"""
Stairs — Shared Helpers
Row conversion, health computation, code generation, and auth utilities.
"""

import os
import json
import uuid
from datetime import datetime, date, timedelta, timezone
from typing import Optional
from decimal import Decimal

from fastapi import HTTPException, Header, status as http_status
from jose import JWTError, jwt
import bcrypt

from app.db.connection import get_pool

# ─── CONFIG ───
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
# Advisory only — the live model id is resolved at runtime by app.ai_client,
# which discovers what this key can serve and fails over past retired ids.
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")

# No default. The whole tenancy model rests on the "org" claim in a token being
# unforgeable, so a signing key checked into a public repository is a master key
# for every organization on the system. An unset JWT_SECRET is a hard failure at
# startup (see require_jwt_secret), never a silent fallback.
JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "72"))

# Values that must never sign a token. The first shipped as the default in this
# repository, so it is public and permanently burned.
BURNED_JWT_SECRETS = frozenset({
    "stairs-dev-secret-change-in-production-2026",
    "changeme", "secret", "change-me", "your-secret-key",
})
MIN_JWT_SECRET_LENGTH = 32


def jwt_secret_problem(secret: str) -> Optional[str]:
    """Why this secret is unusable, or None if it's acceptable.

    Returns a reason that never contains the secret itself, so it is safe to
    print in a boot log or CI output.
    """
    if not secret:
        return "JWT_SECRET is not set"
    if secret in BURNED_JWT_SECRETS:
        return ("JWT_SECRET is a publicly known default value — it has appeared in "
                "this repository and must never be used")
    if len(secret) < MIN_JWT_SECRET_LENGTH:
        return (f"JWT_SECRET is {len(secret)} characters; at least "
                f"{MIN_JWT_SECRET_LENGTH} are required")
    if len(set(secret)) < 8:
        return (f"JWT_SECRET uses only {len(set(secret))} distinct characters — "
                "it looks like a repeated or placeholder string")
    return None


def require_jwt_secret():
    """Raise unless JWT_SECRET is set and strong. Called at startup."""
    problem = jwt_secret_problem(JWT_SECRET)
    if problem:
        raise RuntimeError(
            f"{problem}. Refusing to start: anyone who knows the signing key can "
            f"mint a token for any organization and read and write all of its data. "
            f"Generate one with:  python -c \"import secrets; print(secrets.token_urlsafe(48))\""
        )

DEFAULT_ORG_ID = "a0000000-0000-0000-0000-000000000001"
DEFAULT_USER_ID = "b0000000-0000-0000-0000-000000000001"

JSONB_FIELDS = frozenset({
    'metadata', 'ai_insights', 'settings', 'preferences',
    'hierarchy_template', 'recommended_actions', 'changes', 'actions_taken',
    'template_structure', 'scoring_guide', 'example_factors', 'framework_mappings',
    'tasks', 'feedback', 'payload',
})


# ─── ROW HELPERS ───

def row_to_dict(row):
    if row is None:
        return None
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, Decimal):
            d[k] = float(v)
        elif isinstance(v, uuid.UUID):
            d[k] = str(v)
        elif isinstance(v, datetime):
            d[k] = v.isoformat()
        elif isinstance(v, date):
            d[k] = v.isoformat()
        elif isinstance(v, str) and k in JSONB_FIELDS:
            try:
                d[k] = json.loads(v)
            except (json.JSONDecodeError, TypeError):
                pass
    return d


def rows_to_dicts(rows):
    return [row_to_dict(r) for r in rows]


def compute_health(progress: float, start_date=None, end_date=None) -> str:
    if progress >= 100:
        return "achieved"
    if start_date and end_date:
        today = date.today()
        total = (end_date - start_date).days or 1
        elapsed = (today - start_date).days
        time_pct = min(100, (elapsed / total) * 100)
        if progress >= time_pct - 10:
            return "on_track"
        elif progress >= time_pct - 30:
            return "at_risk"
        else:
            return "off_track"
    if progress >= 50:
        return "on_track"
    elif progress >= 25:
        return "at_risk"
    else:
        return "off_track"


def generate_code(element_type: str) -> str:
    prefix = {
        "vision": "VIS", "objective": "OBJ", "key_result": "KR",
        "initiative": "INI", "task": "TSK", "kpi": "KPI",
        "perspective": "PER", "strategic_objective": "SO",
        "measure": "MSR", "goal": "GOL", "strategy": "STR",
    }.get(element_type, "ELM")
    return f"{prefix}-{datetime.now().strftime('%y%m')}-{str(uuid.uuid4())[:4].upper()}"


# ─── PASSWORD ───

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False


# ─── JWT ───

def create_jwt(user_id: str, org_id: str, role: str = "member") -> str:
    # Fail closed. If startup validation was somehow bypassed, signing with an
    # empty or burned key would mint tokens anyone could forge.
    require_jwt_secret()
    payload = {
        "sub": user_id,
        "org": org_id,
        "role": role,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> dict:
    # An empty key would make every signature verify against "", so a request
    # must never be authenticated by a server that isn't properly configured.
    if jwt_secret_problem(JWT_SECRET):
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server authentication is misconfigured",
        )
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


class AuthContext:
    def __init__(self, user_id: str, org_id: str, role: str):
        self.user_id = user_id
        self.org_id = org_id
        self.role = role


async def get_auth(authorization: Optional[str] = Header(None)) -> AuthContext:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization[7:]
    payload = decode_jwt(token)
    user_id = payload.get("sub")
    org_id = payload.get("org")
    if not user_id or not org_id:
        raise HTTPException(
            status_code=401,
            detail="Invalid token: missing user or organization",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return AuthContext(user_id, org_id, payload.get("role", "member"))


async def require_auth(authorization: Optional[str] = Header(None)) -> AuthContext:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required",
                            headers={"WWW-Authenticate": "Bearer"})
    token = authorization[7:]
    payload = decode_jwt(token)
    user_id = payload.get("sub")
    org_id = payload.get("org")
    if not user_id or not org_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing user or organization",
                            headers={"WWW-Authenticate": "Bearer"})
    return AuthContext(user_id, org_id, payload.get("role", "member"))
