"""
═══════════════════════════════════════════════════════════
ST.AIRS — Strategy AI Interactive Real-time System
FastAPI Backend v2.0
By Tee | DEVONEERS | "Human IS the Loop"

v2.0 Changes:
  Step 1: Frontend API wiring (CORS, proper responses)
  Step 2: JWT Authentication (jose + bcrypt)
  Step 3: WebSocket real-time updates
  Step 4: Multi-tenant isolation (org_id from JWT)
═══════════════════════════════════════════════════════════
"""

import os
import json
import uuid
import asyncio
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List
from decimal import Decimal

from fastapi import (
    FastAPI, HTTPException, Query, Depends, Header,
    WebSocket, WebSocketDisconnect, status as http_status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from contextlib import asynccontextmanager
import httpx

# JWT & password hashing
from jose import JWTError, jwt
import bcrypt

from app.db.connection import get_pool, init_db, close_pool
from app.models.schemas import (
    StairCreate, StairUpdate, StairOut, StairTree,
    ProgressCreate, ProgressOut,
    RelationshipCreate, RelationshipOut,
    AIChatRequest, AIChatResponse, AIAnalysisResponse, AIGenerateRequest,
    AlertOut, AlertUpdate,
    DashboardStats, ExecutiveDashboard,
    FrameworkOut, OrgOut, UserOut,
    LoginRequest, TokenResponse, RegisterRequest,
    TeamCreate, TeamOut, TeamMemberOut,
    KPIMeasurementCreate, KPIMeasurementOut,
)

# ─── CONFIG ───
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")

JWT_SECRET = os.getenv("JWT_SECRET", "stairs-dev-secret-change-in-production-2026")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "72"))

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False

DEFAULT_ORG_ID = "a0000000-0000-0000-0000-000000000001"
DEFAULT_USER_ID = "b0000000-0000-0000-0000-000000000001"

JSONB_FIELDS = frozenset({
    'metadata', 'ai_insights', 'settings', 'preferences',
    'hierarchy_template', 'recommended_actions', 'changes', 'actions_taken',
})


# ═══════════════════════════════════════════════
# STEP 3: WEBSOCKET CONNECTION MANAGER
# ═══════════════════════════════════════════════

class ConnectionManager:
    def __init__(self):
        self.connections: dict[str, dict[str, list[WebSocket]]] = {}

    async def connect(self, ws: WebSocket, org_id: str, user_id: str):
        await ws.accept()
        self.connections.setdefault(org_id, {}).setdefault(user_id, []).append(ws)

    def disconnect(self, ws: WebSocket, org_id: str, user_id: str):
        if org_id in self.connections and user_id in self.connections[org_id]:
            self.connections[org_id][user_id] = [
                c for c in self.connections[org_id][user_id] if c is not ws
            ]

    async def broadcast_to_org(self, org_id: str, message: dict):
        if org_id not in self.connections:
            return
        for user_id, sockets in self.connections[org_id].items():
            dead = []
            for ws in sockets:
                try:
                    await ws.send_json(message)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                sockets.remove(ws)

    async def send_to_user(self, org_id: str, user_id: str, message: dict):
        sockets = self.connections.get(org_id, {}).get(user_id, [])
        dead = []
        for ws in sockets:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            sockets.remove(ws)

ws_manager = ConnectionManager()


# ─── LIFESPAN ───
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🪜 ST.AIRS v2.0 Starting up...")
    await init_db()
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id, password_hash FROM users WHERE id = $1", DEFAULT_USER_ID)
        if user and user["password_hash"] and not user["password_hash"].startswith("$2"):
            hashed = hash_password("stairs2026")
            await conn.execute("UPDATE users SET password_hash = $1 WHERE id = $2", hashed, DEFAULT_USER_ID)
            print("  → Migrated seed user password to bcrypt")
    yield
    await close_pool()
    print("🪜 ST.AIRS Shutting down...")


# ─── APP ───
app = FastAPI(
    title="ST.AIRS API",
    description="Strategy AI Interactive Real-time System — By DEVONEERS",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════

def row_to_dict(row):
    if row is None:
        return None
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, Decimal):
            d[k] = float(v)
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


# ═══════════════════════════════════════════════
# STEP 2: JWT AUTH
# ═══════════════════════════════════════════════

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
    """Carries user_id, org_id, role from JWT through request"""
    def __init__(self, user_id: str, org_id: str, role: str):
        self.user_id = user_id
        self.org_id = org_id
        self.role = role

async def get_auth(authorization: Optional[str] = Header(None)) -> AuthContext:
    """STEP 4: Extract org_id from JWT for multi-tenant isolation. Falls back to defaults for dev."""
    if not authorization or not authorization.startswith("Bearer "):
        return AuthContext(DEFAULT_USER_ID, DEFAULT_ORG_ID, "admin")
    token = authorization[7:]
    payload = decode_jwt(token)
    return AuthContext(payload["sub"], payload["org"], payload.get("role", "member"))

async def require_auth(authorization: Optional[str] = Header(None)) -> AuthContext:
    """Strict auth — no fallback"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required",
                            headers={"WWW-Authenticate": "Bearer"})
    token = authorization[7:]
    payload = decode_jwt(token)
    return AuthContext(payload["sub"], payload["org"], payload.get("role", "member"))


# ═══════════════════════════════════════════════
# AUTH ENDPOINTS
# ═══════════════════════════════════════════════

@app.post("/api/v1/auth/register", status_code=201)
async def register(req: RegisterRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", req.email)
        if existing:
            raise HTTPException(400, "Email already registered")
        user_id = str(uuid.uuid4())
        org_id = DEFAULT_ORG_ID
        hashed = hash_password(req.password)
        await conn.execute("""
            INSERT INTO users (id, organization_id, email, password_hash, full_name, language, role)
            VALUES ($1,$2,$3,$4,$5,$6,'member')
        """, user_id, org_id, req.email, hashed, req.full_name, req.language)
        token = create_jwt(user_id, org_id, "member")
        user = await conn.fetchrow("SELECT id, email, full_name, role, language, organization_id FROM users WHERE id = $1", user_id)
        return {"access_token": token, "token_type": "bearer", "user": row_to_dict(user)}

@app.post("/api/v1/auth/login")
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

@app.get("/api/v1/auth/me")
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

@app.post("/api/v1/auth/refresh")
async def refresh_token(auth: AuthContext = Depends(require_auth)):
    return {"access_token": create_jwt(auth.user_id, auth.org_id, auth.role), "token_type": "bearer"}


# ═══════════════════════════════════════════════
# HEALTH
# ═══════════════════════════════════════════════

@app.get("/")
async def root():
    return {"name": "ST.AIRS API", "version": "2.0.0", "tagline": "Climb Your Strategy",
            "by": "Tee | DEVONEERS", "status": "operational",
            "features": ["jwt_auth", "websocket", "multi_tenant"]}

@app.get("/health")
async def health():
    pool = await get_pool()
    async with pool.acquire() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM stairs WHERE deleted_at IS NULL")
    return {"status": "healthy", "stairs_count": count, "version": "2.0.0"}


# ═══════════════════════════════════════════════
# STAIRS CRUD (STEP 4: org_id from JWT)
# ═══════════════════════════════════════════════

@app.get("/api/v1/stairs", response_model=List[StairOut])
async def list_stairs(
    auth: AuthContext = Depends(get_auth),
    element_type: Optional[str] = None, status: Optional[str] = None,
    health: Optional[str] = None, parent_id: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        q = """SELECT s.*, (SELECT COUNT(*) FROM stairs c WHERE c.parent_id = s.id AND c.deleted_at IS NULL) as children_count,
               u.full_name as owner_name FROM stairs s LEFT JOIN users u ON s.owner_id = u.id
               WHERE s.organization_id = $1 AND s.deleted_at IS NULL"""
        p = [auth.org_id]; idx = 2
        if element_type: q += f" AND s.element_type = ${idx}"; p.append(element_type); idx += 1
        if status: q += f" AND s.status = ${idx}"; p.append(status); idx += 1
        if health: q += f" AND s.health = ${idx}"; p.append(health); idx += 1
        if parent_id:
            if parent_id == "null": q += " AND s.parent_id IS NULL"
            else: q += f" AND s.parent_id = ${idx}"; p.append(parent_id); idx += 1
        if search: q += f" AND (s.title ILIKE ${idx} OR s.title_ar ILIKE ${idx} OR s.description ILIKE ${idx})"; p.append(f"%{search}%"); idx += 1
        q += f' ORDER BY s.level, s.sort_order, s.created_at LIMIT ${idx} OFFSET ${idx+1}'
        p.extend([limit, offset])
        return rows_to_dicts(await conn.fetch(q, *p))

@app.post("/api/v1/stairs", response_model=StairOut, status_code=201)
async def create_stair(stair: StairCreate, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        stair_id = str(uuid.uuid4())
        code = generate_code(stair.element_type)
        level = 0
        if stair.parent_id:
            parent = await conn.fetchrow("SELECT level FROM stairs WHERE id = $1", str(stair.parent_id))
            if parent: level = parent["level"] + 1
        health_val = compute_health(0, stair.start_date, stair.end_date)
        await conn.execute("""
            INSERT INTO stairs (id, organization_id, code, title, title_ar, description, description_ar,
                element_type, framework_id, parent_id, level, owner_id, team_id,
                start_date, end_date, target_value, current_value, unit,
                priority, tags, metadata, status, health, progress_percent, confidence_percent, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'active',$22,0,50,$23)
        """, stair_id, auth.org_id, code, stair.title, stair.title_ar, stair.description, stair.description_ar,
            stair.element_type, str(stair.framework_id) if stair.framework_id else None,
            str(stair.parent_id) if stair.parent_id else None, level, auth.user_id,
            str(stair.team_id) if stair.team_id else None,
            stair.start_date, stair.end_date, stair.target_value, stair.current_value, stair.unit,
            stair.priority or "medium", stair.tags, json.dumps(stair.metadata) if stair.metadata else "{}",
            health_val, auth.user_id)
        # Closure table
        await conn.execute("INSERT INTO stair_closure (ancestor_id, descendant_id, depth) VALUES ($1,$1,0) ON CONFLICT DO NOTHING", stair_id)
        if stair.parent_id:
            await conn.execute("""INSERT INTO stair_closure (ancestor_id, descendant_id, depth)
                SELECT ancestor_id, $1, depth + 1 FROM stair_closure WHERE descendant_id = $2""",
                stair_id, str(stair.parent_id))
        row = await conn.fetchrow("""SELECT s.*, 0 as children_count, u.full_name as owner_name
            FROM stairs s LEFT JOIN users u ON s.owner_id = u.id WHERE s.id = $1""", stair_id)
        await ws_manager.broadcast_to_org(auth.org_id, {"event": "stair_created",
            "data": {"id": stair_id, "title": stair.title, "type": stair.element_type}})
        return row_to_dict(row)

@app.get("/api/v1/stairs/tree", response_model=List[StairTree])
async def get_stair_tree(auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""SELECT s.*, (SELECT COUNT(*) FROM stairs c WHERE c.parent_id = s.id AND c.deleted_at IS NULL) as children_count,
            u.full_name as owner_name FROM stairs s LEFT JOIN users u ON s.owner_id = u.id
            WHERE s.organization_id = $1 AND s.deleted_at IS NULL ORDER BY s.level, s.sort_order, s.created_at""", auth.org_id)
        all_stairs = rows_to_dicts(rows)
        def build_tree(parent_id=None):
            children = []
            for s in all_stairs:
                pid = str(s["parent_id"]) if s.get("parent_id") else None
                if pid == parent_id:
                    children.append({"stair": s, "children": build_tree(str(s["id"]))})
            return children
        return build_tree(None)

@app.get("/api/v1/stairs/{stair_id}", response_model=StairOut)
async def get_stair(stair_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""SELECT s.*, (SELECT COUNT(*) FROM stairs c WHERE c.parent_id = s.id AND c.deleted_at IS NULL) as children_count,
            u.full_name as owner_name FROM stairs s LEFT JOIN users u ON s.owner_id = u.id
            WHERE s.id = $1 AND s.organization_id = $2 AND s.deleted_at IS NULL""", stair_id, auth.org_id)
        if not row: raise HTTPException(404, "Stair not found")
        return row_to_dict(row)

@app.put("/api/v1/stairs/{stair_id}", response_model=StairOut)
async def update_stair(stair_id: str, updates: StairUpdate, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM stairs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL", stair_id, auth.org_id)
        if not existing: raise HTTPException(404, "Stair not found")
        update_data = updates.model_dump(exclude_unset=True)
        if not update_data: raise HTTPException(400, "No fields to update")
        if "progress_percent" in update_data and "health" not in update_data:
            sd = update_data.get("start_date", existing["start_date"])
            ed = update_data.get("end_date", existing["end_date"])
            update_data["health"] = compute_health(update_data["progress_percent"], sd, ed)
        sets, params, idx = [], [], 1
        for k, v in update_data.items():
            if k == "parent_id" and v is not None: v = str(v)
            if k == "metadata" and isinstance(v, dict): v = json.dumps(v)
            sets.append(f'"{k}" = ${idx}'); params.append(v); idx += 1
        sets.append(f"updated_at = ${idx}"); params.append(datetime.now(timezone.utc)); idx += 1
        params.append(stair_id)
        await conn.execute(f'UPDATE stairs SET {", ".join(sets)} WHERE id = ${idx}', *params)
        row = await conn.fetchrow("""SELECT s.*, (SELECT COUNT(*) FROM stairs c WHERE c.parent_id = s.id AND c.deleted_at IS NULL) as children_count,
            u.full_name as owner_name FROM stairs s LEFT JOIN users u ON s.owner_id = u.id WHERE s.id = $1""", stair_id)
        await ws_manager.broadcast_to_org(auth.org_id, {"event": "stair_updated", "data": {"id": stair_id, "changes": list(update_data.keys())}})
        return row_to_dict(row)

@app.delete("/api/v1/stairs/{stair_id}")
async def delete_stair(stair_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("UPDATE stairs SET deleted_at = NOW() WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL", stair_id, auth.org_id)
        if result == "UPDATE 0": raise HTTPException(404, "Stair not found")
        await ws_manager.broadcast_to_org(auth.org_id, {"event": "stair_deleted", "data": {"id": stair_id}})
        return {"deleted": True, "id": stair_id}

@app.get("/api/v1/stairs/{stair_id}/children", response_model=List[StairOut])
async def get_children(stair_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""SELECT s.*, (SELECT COUNT(*) FROM stairs c WHERE c.parent_id = s.id AND c.deleted_at IS NULL) as children_count,
            u.full_name as owner_name FROM stairs s LEFT JOIN users u ON s.owner_id = u.id
            WHERE s.parent_id = $1 AND s.organization_id = $2 AND s.deleted_at IS NULL ORDER BY s.sort_order, s.created_at""", stair_id, auth.org_id)
        return rows_to_dicts(rows)

@app.get("/api/v1/stairs/{stair_id}/ancestors", response_model=List[StairOut])
async def get_ancestors(stair_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""SELECT s.*, (SELECT COUNT(*) FROM stairs c WHERE c.parent_id = s.id AND c.deleted_at IS NULL) as children_count,
            u.full_name as owner_name FROM stairs s LEFT JOIN users u ON s.owner_id = u.id
            JOIN stair_closure sc ON sc.ancestor_id = s.id WHERE sc.descendant_id = $1 AND sc.depth > 0 AND s.organization_id = $2
            ORDER BY sc.depth DESC""", stair_id, auth.org_id)
        return rows_to_dicts(rows)


# ═══════════════════════════════════════════════
# PROGRESS TRACKING
# ═══════════════════════════════════════════════

@app.post("/api/v1/stairs/{stair_id}/progress", response_model=ProgressOut, status_code=201)
async def log_progress(stair_id: str, progress: ProgressCreate, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        stair = await conn.fetchrow("SELECT * FROM stairs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL", stair_id, auth.org_id)
        if not stair: raise HTTPException(404, "Stair not found")
        snap_id = str(uuid.uuid4())
        today = date.today()
        health_val = progress.health or compute_health(progress.progress_percent, stair["start_date"], stair["end_date"])
        await conn.execute("""INSERT INTO stair_progress (id, stair_id, snapshot_date, progress_percent, confidence_percent, health, status, updated_by, notes)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (stair_id, snapshot_date) DO UPDATE SET
            progress_percent=$4, confidence_percent=$5, health=$6, notes=$9, updated_by=$8""",
            snap_id, stair_id, today, progress.progress_percent, progress.confidence_percent, health_val, stair["status"], auth.user_id, progress.notes)
        ups = ["progress_percent=$1", "health=$2", "updated_at=NOW()"]; up = [progress.progress_percent, health_val]; idx = 3
        if progress.confidence_percent is not None: ups.append(f"confidence_percent=${idx}"); up.append(progress.confidence_percent); idx += 1
        if progress.current_value is not None: ups.append(f"current_value=${idx}"); up.append(progress.current_value); idx += 1
        up.append(stair_id)
        await conn.execute(f'UPDATE stairs SET {", ".join(ups)} WHERE id = ${idx}', *up)
        row = await conn.fetchrow("SELECT * FROM stair_progress WHERE id = $1", snap_id)
        await ws_manager.broadcast_to_org(auth.org_id, {"event": "progress_logged", "data": {"stair_id": stair_id, "progress": progress.progress_percent, "health": health_val}})
        return row_to_dict(row)

@app.get("/api/v1/stairs/{stair_id}/history", response_model=List[ProgressOut])
async def get_progress_history(stair_id: str, limit: int = 30, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""SELECT p.* FROM stair_progress p JOIN stairs s ON s.id = p.stair_id
            WHERE p.stair_id = $1 AND s.organization_id = $2 ORDER BY p.snapshot_date DESC LIMIT $3""", stair_id, auth.org_id, limit)
        return rows_to_dicts(rows)


# ═══════════════════════════════════════════════
# RELATIONSHIPS
# ═══════════════════════════════════════════════

@app.get("/api/v1/stairs/{stair_id}/relationships", response_model=List[RelationshipOut])
async def get_relationships(stair_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        return rows_to_dicts(await conn.fetch("SELECT * FROM stair_relationships WHERE source_stair_id = $1 OR target_stair_id = $1", stair_id))

@app.post("/api/v1/relationships", response_model=RelationshipOut, status_code=201)
async def create_relationship(rel: RelationshipCreate, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rel_id = str(uuid.uuid4())
        await conn.execute("""INSERT INTO stair_relationships (id, source_stair_id, target_stair_id, relationship_type, strength, description)
            VALUES ($1,$2,$3,$4,$5,$6)""", rel_id, str(rel.source_stair_id), str(rel.target_stair_id), rel.relationship_type, rel.strength, rel.description)
        return row_to_dict(await conn.fetchrow("SELECT * FROM stair_relationships WHERE id = $1", rel_id))


# ═══════════════════════════════════════════════
# ALERTS
# ═══════════════════════════════════════════════

@app.get("/api/v1/alerts", response_model=List[AlertOut])
async def list_alerts(auth: AuthContext = Depends(get_auth), severity: Optional[str] = None, status: Optional[str] = None, limit: int = 20):
    pool = await get_pool()
    async with pool.acquire() as conn:
        q = "SELECT * FROM ai_alerts WHERE organization_id = $1"; p = [auth.org_id]; idx = 2
        if severity: q += f" AND severity = ${idx}"; p.append(severity); idx += 1
        if status: q += f" AND status = ${idx}"; p.append(status); idx += 1
        else: q += " AND status != 'dismissed'"
        q += f" ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC LIMIT ${idx}"
        p.append(limit)
        return rows_to_dicts(await conn.fetch(q, *p))

@app.put("/api/v1/alerts/{alert_id}", response_model=AlertOut)
async def update_alert(alert_id: str, update: AlertUpdate, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("UPDATE ai_alerts SET status=$1, acknowledged_by=$2, acknowledged_at=NOW() WHERE id=$3 AND organization_id=$4",
            update.status, auth.user_id, alert_id, auth.org_id)
        row = await conn.fetchrow("SELECT * FROM ai_alerts WHERE id = $1", alert_id)
        if not row: raise HTTPException(404, "Alert not found")
        return row_to_dict(row)


# ═══════════════════════════════════════════════
# DASHBOARD
# ═══════════════════════════════════════════════

@app.get("/api/v1/dashboard", response_model=ExecutiveDashboard)
async def executive_dashboard(auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        stats_rows = await conn.fetch("""SELECT health, COUNT(*) as cnt, AVG(progress_percent) as avg_progress
            FROM stairs WHERE organization_id = $1 AND deleted_at IS NULL GROUP BY health""", auth.org_id)
        total = on_track = at_risk = off_track = achieved = 0; total_progress = 0
        for r in stats_rows:
            cnt = r["cnt"]; total += cnt; total_progress += float(r["avg_progress"] or 0) * cnt
            if r["health"] == "on_track": on_track = cnt
            elif r["health"] == "at_risk": at_risk = cnt
            elif r["health"] == "off_track": off_track = cnt
            elif r["health"] == "achieved": achieved = cnt
        overall_progress = round(total_progress / max(total, 1), 1)
        alerts_rows = rows_to_dicts(await conn.fetch("""SELECT * FROM ai_alerts WHERE organization_id = $1 AND status NOT IN ('dismissed','resolved')
            ORDER BY severity, created_at DESC LIMIT 10""", auth.org_id))
        critical_count = sum(1 for a in alerts_rows if a.get("severity") == "critical")
        top_risks = rows_to_dicts(await conn.fetch("""SELECT s.*, (SELECT COUNT(*) FROM stairs c WHERE c.parent_id = s.id AND c.deleted_at IS NULL) as children_count,
            u.full_name as owner_name FROM stairs s LEFT JOIN users u ON s.owner_id = u.id
            WHERE s.organization_id = $1 AND s.deleted_at IS NULL AND s.health IN ('off_track','at_risk')
            ORDER BY s.progress_percent ASC LIMIT 5""", auth.org_id))
        recent_progress = rows_to_dicts(await conn.fetch("""SELECT p.* FROM stair_progress p JOIN stairs s ON s.id = p.stair_id
            WHERE s.organization_id = $1 ORDER BY p.created_at DESC LIMIT 10""", auth.org_id))
        return {
            "stats": {"total_elements": total, "on_track": on_track, "at_risk": at_risk, "off_track": off_track,
                      "achieved": achieved, "overall_progress": overall_progress, "active_alerts": len(alerts_rows), "critical_alerts": critical_count},
            "top_risks": top_risks, "recent_progress": recent_progress, "alerts": alerts_rows,
        }


# ═══════════════════════════════════════════════
# FRAMEWORKS
# ═══════════════════════════════════════════════

@app.get("/api/v1/frameworks", response_model=List[FrameworkOut])
async def list_frameworks():
    pool = await get_pool()
    async with pool.acquire() as conn:
        return rows_to_dicts(await conn.fetch("SELECT * FROM frameworks WHERE is_active = true ORDER BY code"))


# ═══════════════════════════════════════════════
# AI ENGINE
# ═══════════════════════════════════════════════

SYSTEM_PROMPT = """You are ST.AIRS, an AI strategy assistant created by DEVONEERS.
You help organizations build, execute, and monitor their strategic plans.
Expert in: OKR, Balanced Scorecard, OGSM, Hoshin Kanri, Blue Ocean Strategy, Porter's frameworks.
Philosophy: "Human IS the Loop" — you suggest, humans decide.
Keep responses concise and actionable. Use Arabic when the user writes in Arabic.
Format measurable items with clear targets, units, and timeframes."""

async def call_claude(messages: list, system: str = SYSTEM_PROMPT, max_tokens: int = 1024) -> dict:
    if not ANTHROPIC_API_KEY:
        return {"content": [{"type": "text", "text": "⚙️ AI features require an Anthropic API key. Set ANTHROPIC_API_KEY to enable ST.AIRS AI."}],
                "usage": {"input_tokens": 0, "output_tokens": 0}}
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post("https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": CLAUDE_MODEL, "max_tokens": max_tokens, "system": system, "messages": messages})
        if resp.status_code != 200:
            return {"content": [{"type": "text", "text": f"AI service returned status {resp.status_code}. Please try again."}],
                    "usage": {"input_tokens": 0, "output_tokens": 0}}
        return resp.json()

@app.post("/api/v1/ai/chat", response_model=AIChatResponse)
async def ai_chat(req: AIChatRequest, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    context_parts = []
    async with pool.acquire() as conn:
        org = await conn.fetchrow("SELECT * FROM organizations WHERE id = $1", auth.org_id)
        if org: context_parts.append(f"Organization: {org['name']}")
        stairs = await conn.fetch("""SELECT code, title, element_type, health, progress_percent, status
            FROM stairs WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY level, sort_order LIMIT 30""", auth.org_id)
        if stairs:
            context_parts.append("Current strategy elements:")
            for s in stairs: context_parts.append(f"  [{s['code']}] {s['title']} ({s['element_type']}) — {s['health']} {s['progress_percent']}%")
        if req.context_stair_id:
            detail = await conn.fetchrow("SELECT * FROM stairs WHERE id = $1", str(req.context_stair_id))
            if detail:
                context_parts.append(f"\nFocused: {detail['title']} — {detail['description'] or 'No description'}")
                context_parts.append(f"Progress: {detail['progress_percent']}%, Health: {detail['health']}, Confidence: {detail['confidence_percent']}%")
    messages = [{"role": "user", "content": f"CONTEXT:\n{chr(10).join(context_parts)}\n\nUSER QUESTION:\n{req.message}"}]
    result = await call_claude(messages)
    text = result["content"][0]["text"] if result.get("content") else "No response generated"
    conv_id = str(req.conversation_id) if req.conversation_id else str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute("""INSERT INTO ai_conversations (id, organization_id, user_id, context_type, context_stair_id, title)
            VALUES ($1,$2,$3,'chat',$4,$5) ON CONFLICT (id) DO NOTHING""",
            conv_id, auth.org_id, auth.user_id, str(req.context_stair_id) if req.context_stair_id else None, req.message[:100])
        total_tokens = result.get("usage", {}).get("input_tokens", 0) + result.get("usage", {}).get("output_tokens", 0)
        await conn.execute("INSERT INTO ai_messages (id, conversation_id, role, content, tokens_used, model_used) VALUES ($1,$2,'user',$3,0,$4)",
            str(uuid.uuid4()), conv_id, req.message, CLAUDE_MODEL)
        await conn.execute("INSERT INTO ai_messages (id, conversation_id, role, content, tokens_used, model_used) VALUES ($1,$2,'assistant',$3,$4,$5)",
            str(uuid.uuid4()), conv_id, text, total_tokens, CLAUDE_MODEL)
    return {"response": text, "conversation_id": conv_id, "actions": [], "tokens_used": total_tokens}

@app.post("/api/v1/ai/analyze/{stair_id}")
async def ai_analyze(stair_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        stair = await conn.fetchrow("SELECT * FROM stairs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL", stair_id, auth.org_id)
        if not stair: raise HTTPException(404, "Stair not found")
        children = await conn.fetch("SELECT title, element_type, health, progress_percent FROM stairs WHERE parent_id = $1 AND deleted_at IS NULL", stair_id)
        history = await conn.fetch("SELECT * FROM stair_progress WHERE stair_id = $1 ORDER BY snapshot_date DESC LIMIT 10", stair_id)
    prompt = f"""Analyze for risks:\nELEMENT: {stair['title']} (type: {stair['element_type']})\nDescription: {stair['description'] or 'None'}
Status: {stair['status']}, Health: {stair['health']}, Progress: {stair['progress_percent']}%, Confidence: {stair['confidence_percent']}%
Target: {stair['target_value']} {stair['unit'] or ''}, Current: {stair['current_value']}
Start: {stair['start_date']}, End: {stair['end_date']}
CHILDREN ({len(list(children))}): {json.dumps([dict(c) for c in children], default=str)[:800]}
HISTORY: {json.dumps([dict(h) for h in history], default=str)[:800]}
Return JSON: risk_score (0-100), risk_level, identified_risks[], recommended_actions[], completion_probability (0-100), summary, summary_ar"""
    result = await call_claude([{"role": "user", "content": prompt}], max_tokens=1500)
    text = result["content"][0]["text"] if result.get("content") else "{}"
    try: analysis = json.loads(text.strip().strip("`").removeprefix("json"))
    except Exception:
        analysis = {"risk_score": 50, "risk_level": "medium", "identified_risks": [{"pattern": "Analysis", "evidence": text[:200]}],
                    "recommended_actions": [{"action": "Review manually", "urgency": "this_week"}], "completion_probability": 50,
                    "summary": text[:300] if text else "Analysis completed", "summary_ar": ""}
    async with pool.acquire() as conn:
        await conn.execute("UPDATE stairs SET ai_risk_score=$1, ai_health_prediction=$2, ai_insights=$3, updated_at=NOW() WHERE id=$4",
            analysis.get("risk_score", 50), analysis.get("risk_level", "medium"), json.dumps(analysis), stair_id)
    return analysis

@app.post("/api/v1/ai/generate")
async def ai_generate_strategy(req: AIGenerateRequest, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        org = await conn.fetchrow("SELECT * FROM organizations WHERE id = $1", auth.org_id)
    org_name = org["name"] if org else "Organization"
    prompt = f"""Generate a {req.framework.upper()} strategy for: {org_name}\nUser request: {req.prompt}
Return JSON array: [{{"title":"..","title_ar":"..","description":"..","element_type":"objective|key_result|initiative","parent_idx":null or int,"target_value":null or num,"unit":null or str,"priority":"critical|high|medium|low"}}]
Start with Vision, then Objectives, then Key Results. 3-5 KRs per Objective. Include Arabic."""
    result = await call_claude([{"role": "user", "content": prompt}], max_tokens=2048)
    text = result["content"][0]["text"] if result.get("content") else "[]"
    try:
        start = text.find("["); end = text.rfind("]") + 1
        elements = json.loads(text[start:end]) if start >= 0 else []
    except Exception:
        return {"generated": 0, "elements": [], "raw": text[:500], "message": "Could not parse AI response."}
    created, parent_ids = [], []
    async with pool.acquire() as conn:
        for i, el in enumerate(elements):
            stair_id = str(uuid.uuid4()); el_type = el.get("element_type", "objective"); code = generate_code(el_type)
            parent_id = None
            if el.get("parent_idx") is not None and int(el["parent_idx"]) < len(parent_ids):
                parent_id = parent_ids[int(el["parent_idx"])]
            level = 0
            if parent_id:
                p = await conn.fetchrow("SELECT level FROM stairs WHERE id = $1", parent_id)
                level = (p["level"] + 1) if p else 0
            await conn.execute("""INSERT INTO stairs (id, organization_id, code, title, title_ar, description, element_type,
                parent_id, level, status, health, progress_percent, confidence_percent, target_value, unit, priority, created_by)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active','on_track',0,50,$10,$11,$12,$13)""",
                stair_id, auth.org_id, code, el.get("title", "Untitled"), el.get("title_ar", ""), el.get("description", ""),
                el_type, parent_id, level, el.get("target_value"), el.get("unit"), el.get("priority", "medium"), auth.user_id)
            await conn.execute("INSERT INTO stair_closure (ancestor_id, descendant_id, depth) VALUES ($1,$1,0) ON CONFLICT DO NOTHING", stair_id)
            if parent_id:
                await conn.execute("INSERT INTO stair_closure (ancestor_id, descendant_id, depth) SELECT ancestor_id, $1, depth+1 FROM stair_closure WHERE descendant_id = $2", stair_id, parent_id)
            parent_ids.append(stair_id); created.append({"id": stair_id, "code": code, "title": el.get("title")})
    await ws_manager.broadcast_to_org(auth.org_id, {"event": "strategy_generated", "data": {"count": len(created)}})
    return {"generated": len(created), "elements": created}


# ═══════════════════════════════════════════════
# TEAMS
# ═══════════════════════════════════════════════

@app.get("/api/v1/teams", response_model=List[TeamOut])
async def list_teams(auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        return rows_to_dicts(await conn.fetch("""SELECT t.*, (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count
            FROM teams t WHERE t.organization_id = $1 ORDER BY t.name""", auth.org_id))

@app.post("/api/v1/teams", response_model=TeamOut, status_code=201)
async def create_team(team: TeamCreate, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        team_id = str(uuid.uuid4())
        await conn.execute("INSERT INTO teams (id, organization_id, name, description, parent_team_id) VALUES ($1,$2,$3,$4,$5)",
            team_id, auth.org_id, team.name, team.description, team.parent_team_id if team.parent_team_id else None)
        return row_to_dict(await conn.fetchrow("SELECT t.*, 0 as member_count FROM teams t WHERE t.id = $1", team_id))

@app.delete("/api/v1/teams/{team_id}")
async def delete_team(team_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM team_members WHERE team_id = $1", team_id)
        await conn.execute("DELETE FROM teams WHERE id = $1 AND organization_id = $2", team_id, auth.org_id)
        return {"deleted": True}


# ═══════════════════════════════════════════════
# KPIs
# ═══════════════════════════════════════════════

@app.post("/api/v1/stairs/{stair_id}/kpi", response_model=KPIMeasurementOut, status_code=201)
async def log_kpi(stair_id: str, m: KPIMeasurementCreate, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        stair = await conn.fetchrow("SELECT id FROM stairs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL", stair_id, auth.org_id)
        if not stair: raise HTTPException(404, "Stair not found")
        m_id = str(uuid.uuid4()); now = datetime.now(timezone.utc)
        await conn.execute("INSERT INTO kpi_measurements (id, stair_id, measured_at, value, source, source_system) VALUES ($1,$2,$3,$4,$5,$6)",
            m_id, stair_id, now, m.value, m.source, m.source_system)
        await conn.execute("UPDATE stairs SET current_value=$1, updated_at=NOW() WHERE id=$2", m.value, stair_id)
        await ws_manager.broadcast_to_org(auth.org_id, {"event": "kpi_logged", "data": {"stair_id": stair_id, "value": m.value}})
        return row_to_dict(await conn.fetchrow("SELECT * FROM kpi_measurements WHERE id = $1", m_id))

@app.get("/api/v1/stairs/{stair_id}/kpi", response_model=List[KPIMeasurementOut])
async def get_kpi(stair_id: str, limit: int = 50, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        return rows_to_dicts(await conn.fetch("""SELECT m.* FROM kpi_measurements m JOIN stairs s ON s.id = m.stair_id
            WHERE m.stair_id = $1 AND s.organization_id = $2 ORDER BY m.measured_at DESC LIMIT $3""", stair_id, auth.org_id, limit))

@app.get("/api/v1/kpis/summary")
async def kpi_summary(auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        return rows_to_dicts(await conn.fetch("""SELECT s.id, s.code, s.title, s.title_ar, s.target_value, s.current_value,
            s.unit, s.health, s.progress_percent, s.measurement_direction,
            (SELECT value FROM kpi_measurements km WHERE km.stair_id = s.id ORDER BY measured_at DESC LIMIT 1) as latest_value,
            (SELECT measured_at FROM kpi_measurements km WHERE km.stair_id = s.id ORDER BY measured_at DESC LIMIT 1) as latest_at,
            (SELECT COUNT(*) FROM kpi_measurements km WHERE km.stair_id = s.id) as measurement_count
            FROM stairs s WHERE s.organization_id = $1 AND s.element_type IN ('kpi','key_result','measure') AND s.deleted_at IS NULL ORDER BY s.code""", auth.org_id))


# ═══════════════════════════════════════════════
# EXPORT
# ═══════════════════════════════════════════════

@app.get("/api/v1/export/csv")
async def export_csv(auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""SELECT code, title, title_ar, element_type, status, health,
            progress_percent, confidence_percent, target_value, current_value, unit, priority, start_date, end_date, ai_risk_score
            FROM stairs WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY level, sort_order """, auth.org_id)
        header = "Code,Title,Title_AR,Type,Status,Health,Progress%,Confidence%,Target,Current,Unit,Priority,Start,End,AI_Risk\n"
        lines = [",".join(f'"{r[c] or ""}"' for c in ["code","title","title_ar","element_type","status","health","progress_percent","confidence_percent","target_value","current_value","unit","priority","start_date","end_date","ai_risk_score"]) for r in rows]
        return Response(content=header+"\n".join(lines), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=stairs_{date.today()}.csv"})


# ═══════════════════════════════════════════════
# ONBOARDING
# ═══════════════════════════════════════════════

@app.post("/api/v1/onboarding/quickstart")
async def onboarding_quickstart(org_name: str = Query("My Organization"), framework: str = Query("okr"), auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    templates = {
        "okr": [
            {"type": "vision", "title": f"{org_name} Vision 2026", "title_ar": f"رؤية {org_name} 2026"},
            {"type": "objective", "title": "Revenue Growth", "title_ar": "نمو الإيرادات", "pi": 0},
            {"type": "key_result", "title": "Achieve $X ARR target", "title_ar": "تحقيق هدف الإيرادات", "pi": 1},
            {"type": "key_result", "title": "Acquire N new customers", "title_ar": "اكتساب عملاء جدد", "pi": 1},
            {"type": "objective", "title": "Product Excellence", "title_ar": "تميز المنتج", "pi": 0},
            {"type": "key_result", "title": "Launch v2.0 platform", "title_ar": "إطلاق المنصة v2.0", "pi": 4},
            {"type": "key_result", "title": "Achieve NPS > 50", "title_ar": "تحقيق NPS > 50", "pi": 4},
        ],
        "bsc": [
            {"type": "vision", "title": f"{org_name} Strategic Plan", "title_ar": "الخطة الاستراتيجية"},
            {"type": "perspective", "title": "Financial", "title_ar": "المنظور المالي", "pi": 0},
            {"type": "strategic_objective", "title": "Increase profitability", "title_ar": "زيادة الربحية", "pi": 1},
            {"type": "perspective", "title": "Customer", "title_ar": "منظور العملاء", "pi": 0},
            {"type": "strategic_objective", "title": "Improve satisfaction", "title_ar": "تحسين رضا العملاء", "pi": 3},
            {"type": "perspective", "title": "Internal Processes", "title_ar": "العمليات الداخلية", "pi": 0},
            {"type": "strategic_objective", "title": "Optimize operations", "title_ar": "تحسين العمليات", "pi": 5},
            {"type": "perspective", "title": "Learning & Growth", "title_ar": "التعلم والنمو", "pi": 0},
            {"type": "strategic_objective", "title": "Develop capabilities", "title_ar": "تطوير القدرات", "pi": 7},
        ],
    }
    template = templates.get(framework, templates["okr"]); ids = []
    async with pool.acquire() as conn:
        for item in template:
            sid = str(uuid.uuid4()); pid = ids[item["pi"]] if "pi" in item and item["pi"] < len(ids) else None
            level = 0
            if pid:
                p = await conn.fetchrow("SELECT level FROM stairs WHERE id = $1", pid)
                level = (p["level"] + 1) if p else 0
            await conn.execute("""INSERT INTO stairs (id, organization_id, code, title, title_ar, element_type, parent_id, level, status, health, progress_percent, confidence_percent, created_by)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active','on_track',0,50,$9)""",
                sid, auth.org_id, generate_code(item["type"]), item["title"], item.get("title_ar",""), item["type"], pid, level, auth.user_id)
            ids.append(sid)
    return {"created": len(ids), "framework": framework}


# ═══════════════════════════════════════════════
# STEP 3: WEBSOCKET ENDPOINT
# ═══════════════════════════════════════════════

@app.websocket("/ws/{org_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, org_id: str, user_id: str, token: Optional[str] = Query(None)):
    if token:
        try:
            payload = decode_jwt(token)
            if payload["org"] != org_id:
                await websocket.close(code=4003, reason="Org mismatch"); return
        except HTTPException:
            await websocket.close(code=4001, reason="Invalid token"); return
    await ws_manager.connect(websocket, org_id, user_id)
    try:
        await websocket.send_json({"event": "connected", "data": {"org_id": org_id, "user_id": user_id}})
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=30)
                if data.get("event") == "ping":
                    await websocket.send_json({"event": "pong"})
            except asyncio.TimeoutError:
                await websocket.send_json({"event": "ping"})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, org_id, user_id)
    except Exception:
        ws_manager.disconnect(websocket, org_id, user_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
