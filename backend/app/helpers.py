"""
ST.AIRS — Shared Helpers
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
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")

JWT_SECRET = os.getenv("JWT_SECRET", "stairs-dev-secret-change-in-production-2026")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "72"))

DEFAULT_ORG_ID = "a0000000-0000-0000-0000-000000000001"
DEFAULT_USER_ID = "b0000000-0000-0000-0000-000000000001"

JSONB_FIELDS = frozenset({
    'metadata', 'ai_insights', 'settings', 'preferences',
    'hierarchy_template', 'recommended_actions', 'changes', 'actions_taken',
    'template_structure', 'scoring_guide', 'example_factors', 'framework_mappings',
    'tasks', 'feedback',
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
    payload = {
        "sub": user_id,
        "org": org_id,
        "role": role,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> dict:
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
