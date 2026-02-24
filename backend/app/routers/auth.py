"""ST.AIRS — Auth Router"""

import uuid
from fastapi import APIRouter, Depends

from app.db.connection import get_pool
from app.helpers import (
    row_to_dict, hash_password, verify_password,
    create_jwt, get_auth, require_auth, AuthContext,
    DEFAULT_ORG_ID,
)
from app.models.schemas import LoginRequest, RegisterRequest

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register", status_code=201)
async def register(req: RegisterRequest):
    from fastapi import HTTPException
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", req.email)
        if existing:
            raise HTTPException(400, "Email already registered")

        user_id = str(uuid.uuid4())
        hashed = hash_password(req.password)

        org_name = getattr(req, 'org_name', None) or getattr(req, 'organization_name', None)
        if org_name:
            org_id = str(uuid.uuid4())
            slug = org_name.lower().replace(" ", "-").replace("'", "")[:50] + "-" + str(uuid.uuid4())[:4]
            industry = getattr(req, 'industry', None) or 'General'
            await conn.execute("""
                INSERT INTO organizations (id, name, slug, industry, subscription_tier)
                VALUES ($1, $2, $3, $4, 'free')
            """, org_id, org_name, slug, industry)
            role = "admin"
        else:
            org_id = DEFAULT_ORG_ID
            role = "member"

        await conn.execute("""
            INSERT INTO users (id, organization_id, email, password_hash, full_name, language, role)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
        """, user_id, org_id, req.email, hashed, req.full_name, req.language, role)

        token = create_jwt(user_id, org_id, role)
        user = await conn.fetchrow(
            "SELECT id, email, full_name, role, language, organization_id FROM users WHERE id = $1", user_id
        )
        return {"access_token": token, "token_type": "bearer", "user": row_to_dict(user)}


@router.post("/login")
async def login(req: LoginRequest):
    from fastapi import HTTPException
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
    from fastapi import HTTPException
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
