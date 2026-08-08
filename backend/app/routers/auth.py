"""Stairs — Auth Router"""

import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.db.connection import get_pool
from app.helpers import (
    row_to_dict, rows_to_dicts, hash_password, verify_password,
    create_jwt, get_auth, require_auth, AuthContext,
)
from app.models.schemas import (
    LoginRequest, RegisterRequest, SignupRequest, InviteCreate, InviteOut,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')


def _slugify(name: str) -> str:
    base = re.sub(r'[^a-z0-9]+', '-', (name or "").lower()).strip('-')[:40] or "org"
    return f"{base}-{uuid.uuid4().hex[:6]}"


async def _create_org(conn, name: str, industry: str | None = None) -> str:
    org_id = str(uuid.uuid4())
    await conn.execute("""
        INSERT INTO organizations (id, name, slug, industry, subscription_tier)
        VALUES ($1, $2, $3, $4, 'free')
    """, org_id, name, _slugify(name), industry or "General")
    return org_id


async def _lookup_invite(conn, token: str, email: str | None = None):
    """Resolve a token to (invite_row, problem).

    problem is None when the invitation is usable, otherwise a plain sentence
    saying exactly what is wrong. Being specific is safe here — the token is 32
    random bytes, so anyone holding one already has it and cannot enumerate
    others — and it is the difference between an invited colleague
    understanding "this invitation has expired, ask for a new one" and staring
    at "invalid".
    """
    invite = await conn.fetchrow("""
        SELECT i.*, o.name AS org_name
        FROM organization_invites i
        JOIN organizations o ON o.id = i.organization_id
        WHERE i.token = $1
    """, token)
    if not invite:
        return None, "This invitation link isn't recognised. Ask your administrator to send a new one."
    if invite["revoked_at"]:
        return invite, "This invitation has been revoked. Ask your administrator to send a new one."
    if invite["accepted_at"]:
        return invite, "This invitation has already been used. If that wasn't you, ask your administrator to send a new one."
    if invite["expires_at"] and invite["expires_at"] <= datetime.now(timezone.utc):
        return invite, "This invitation has expired. Ask your administrator to send a new one."
    # An invite addressed to someone must not be redeemable by anyone else.
    if email and invite["email"] and invite["email"].lower() != email.lower():
        return invite, f"This invitation was sent to {invite['email']}. Sign up with that email address, or ask for an invitation to yours."
    return invite, None


async def _consume_invite(conn, token: str, email: str):
    """Validate an invitation and return (org_id, role, invite_id).

    This is the *only* path into an existing organization, and it either works
    or raises. It must never fall through to creating a new organization —
    that is how an invited colleague lands alone in an empty workspace
    wondering where their team's data went.
    """
    invite, problem = await _lookup_invite(conn, token, email)
    if problem:
        raise HTTPException(400, problem)
    return str(invite["organization_id"]), invite["role"], str(invite["id"])


@router.post("/register", status_code=201)
async def register(req: RegisterRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", req.email)
        if existing:
            raise HTTPException(400, "Email already registered")

        user_id = str(uuid.uuid4())
        hashed = hash_password(req.password)

        # New organization by default; an existing one only by invitation.
        invite_id = None
        if req.invite_token:
            org_id, role, invite_id = await _consume_invite(conn, req.invite_token, req.email)
        else:
            if not (req.org_name or "").strip():
                raise HTTPException(400, "An organisation name is required to create a new workspace")
            org_id = await _create_org(conn, req.org_name.strip(), req.industry)
            role = "admin"

        await conn.execute("""
            INSERT INTO users (id, organization_id, email, password_hash, full_name, language, role)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
        """, user_id, org_id, req.email, hashed, req.full_name, req.language, role)
        if invite_id:
            await conn.execute(
                "UPDATE organization_invites SET accepted_at = NOW(), accepted_by = $1 WHERE id = $2",
                user_id, invite_id)

        token = create_jwt(user_id, org_id, role)
        user = await conn.fetchrow(
            "SELECT id, email, full_name, role, language, organization_id FROM users WHERE id = $1", user_id
        )
        return {"access_token": token, "token_type": "bearer", "user": row_to_dict(user)}


@router.post("/signup", status_code=201)
async def signup(req: SignupRequest):
    if not EMAIL_RE.match(req.email):
        raise HTTPException(400, "Invalid email format")
    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if req.password != req.confirm_password:
        raise HTTPException(400, "Passwords do not match")

    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", req.email)
        if existing:
            raise HTTPException(400, "Email already registered")

        user_id = str(uuid.uuid4())
        hashed = hash_password(req.password)

        # Every signup gets its own organization, with the registrant as its
        # admin. Joining an existing organization requires an invitation token
        # and is never the fallback — that fallback is what put unrelated
        # clients in one tenant reading each other's strategies.
        invite_id = None
        if req.invite_token:
            org_id, role, invite_id = await _consume_invite(conn, req.invite_token, req.email)
        else:
            # Named deliberately: an organisation silently named after whoever
            # signed up first reads as unfinished to every client who sees it.
            if not (req.org_name or "").strip():
                raise HTTPException(400, "An organisation name is required to create a new workspace")
            org_id = await _create_org(conn, req.org_name.strip())
            role = "admin"

        await conn.execute("""
            INSERT INTO users (id, organization_id, email, password_hash, full_name, role, last_login_at)
            VALUES ($1,$2,$3,$4,$5,$6, NOW())
        """, user_id, org_id, req.email, hashed, req.name, role)
        if invite_id:
            await conn.execute(
                "UPDATE organization_invites SET accepted_at = NOW(), accepted_by = $1 WHERE id = $2",
                user_id, invite_id)

        token = create_jwt(user_id, org_id, role)
        user = await conn.fetchrow(
            "SELECT id, email, full_name, role, language, organization_id FROM users WHERE id = $1", user_id
        )
        return {"access_token": token, "token_type": "bearer", "user": row_to_dict(user)}


@router.post("/login")
async def login(req: LoginRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", req.email)
        if not user:
            raise HTTPException(401, "Invalid email or password")
        if not verify_password(req.password, user["password_hash"] or ""):
            raise HTTPException(401, "Invalid email or password")
        org_id = str(user["organization_id"])
        token = create_jwt(str(user["id"]), org_id, user["role"])
        await conn.execute("UPDATE users SET last_login_at = NOW() WHERE id = $1", str(user["id"]))
        return {
            "access_token": token, "token_type": "bearer",
            "user": {"id": str(user["id"]), "email": user["email"], "full_name": user["full_name"],
                     "role": user["role"], "language": user["language"], "organization_id": org_id}
        }


@router.get("/me")
async def get_me(auth: AuthContext = Depends(require_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("""
            SELECT u.id, u.email, u.full_name, u.role, u.language, u.organization_id,
                   o.name as org_name, o.subscription_tier
            FROM users u LEFT JOIN organizations o ON o.id = u.organization_id
            WHERE u.id = $1
        """, auth.user_id)
        if not user:
            raise HTTPException(404, "User not found")
        return row_to_dict(user)


@router.post("/refresh")
async def refresh_token(auth: AuthContext = Depends(require_auth)):
    return {"access_token": create_jwt(auth.user_id, auth.org_id, auth.role), "token_type": "bearer"}


# ─── ORGANIZATION INVITES ───
# The only supported route into an existing organization.

@router.post("/invites", response_model=InviteOut, status_code=201)
async def create_invite(req: InviteCreate, auth: AuthContext = Depends(require_auth)):
    """Mint an invitation to the caller's own organization. Admins only.

    The token is returned exactly once, here. It is stored so it can be
    validated and revoked, and it carries the role the invitee will get — so
    an invitee can never grant themselves more than the inviter chose.
    """
    if auth.role != "admin":
        raise HTTPException(403, "Only an organization admin can invite people")
    pool = await get_pool()
    async with pool.acquire() as conn:
        if req.email and not EMAIL_RE.match(req.email):
            raise HTTPException(400, "Invalid email format")
        invite_id = str(uuid.uuid4())
        token = secrets.token_urlsafe(32)
        await conn.execute("""
            INSERT INTO organization_invites
                (id, organization_id, email, role, token, created_by, expires_at)
            VALUES ($1,$2,$3,$4,$5,$6, NOW() + ($7 || ' hours')::interval)
        """, invite_id, auth.org_id, req.email, req.role, token, auth.user_id,
            str(req.expires_in_hours))
        row = await conn.fetchrow("SELECT * FROM organization_invites WHERE id = $1", invite_id)
        return row_to_dict(row)


@router.get("/invites", response_model=List[InviteOut])
async def list_invites(auth: AuthContext = Depends(require_auth)):
    """Outstanding invitations for the caller's organization. Admins only.

    Tokens are withheld — an invite is handed out once, at creation. Listing
    them again would turn this endpoint into a way to harvest live tokens.
    """
    if auth.role != "admin":
        raise HTTPException(403, "Only an organization admin can view invitations")
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, organization_id, email, role, NULL::text AS token, created_by,
                   created_at, expires_at, accepted_at, accepted_by, revoked_at
            FROM organization_invites WHERE organization_id = $1
            ORDER BY created_at DESC
        """, auth.org_id)
        return rows_to_dicts(rows)


@router.delete("/invites/{invite_id}")
async def revoke_invite(invite_id: str, auth: AuthContext = Depends(require_auth)):
    """Revoke an unused invitation. Admins only, own organization only."""
    if auth.role != "admin":
        raise HTTPException(403, "Only an organization admin can revoke invitations")
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("""
            UPDATE organization_invites SET revoked_at = NOW()
            WHERE id = $1 AND organization_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL
        """, invite_id, auth.org_id)
        if result == "UPDATE 0":
            raise HTTPException(404, "Invitation not found")
        return {"revoked": True, "id": invite_id}


@router.get("/invites/preview/{token}")
async def preview_invite(token: str):
    """Describe an invitation to whoever is holding the link, before signup.

    Unauthenticated on purpose — the person following an invite link has no
    account yet. It reveals only the organization's name and the invited role,
    to someone who already possesses an unguessable token, so the sign-up form
    can say "Join Acme Corp" instead of asking them to trust a blank field.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        invite, problem = await _lookup_invite(conn, token)
        if not invite:
            return {"valid": False, "reason": problem}
        return {
            "valid": problem is None,
            "reason": problem,
            "organization_name": invite["org_name"],
            "role": invite["role"],
            "email": invite["email"],
        }
