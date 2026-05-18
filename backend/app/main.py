"""
═══════════════════════════════════════════════════════════
Stairs — Strategy AI Interactive Real-time System
FastAPI Backend v3.7.1 — Modular Router Edition
By Tee | DEVONEERS | "Human IS the Loop"

v3.7.1 Changes:
  - CORS: allow_origin_regex for all *.vercel.app subdomains
  - CORS: explicit origins for production + localhost
  - Version string in /health for deployment verification

v3.6.0 Changes:
  - Split monolithic main.py into modular routers
  - Added rate limiting middleware
  - JWT secret validation warning
  - CORS wildcard warning
  - Removed hardcoded credentials
  - Docker-compose fixes

v3.5.1 Changes:
  - Strategy containers (multi-strategy per org)
  - Strategy CRUD endpoints (list, create, get, update, delete, tree)
  - Auto-migration: ensure_strategies_table() on startup
  - Dynamic year in AI system prompt
  - All v3.5 Knowledge Engine features preserved
═══════════════════════════════════════════════════════════
"""

import os
import re as re_module
import time
import logging
import traceback as tb_module
from datetime import datetime, timezone
from collections import defaultdict

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from contextlib import asynccontextmanager

from app.db.connection import get_pool, init_db, close_pool
from app.helpers import (
    hash_password, DEFAULT_USER_ID, JWT_SECRET,
)

# Import routers
from app.routers.auth import router as auth_router
from app.routers.stairs import router as stairs_router
from app.routers.strategies import router as strategies_router
from app.routers.knowledge import router as knowledge_router
from app.routers.ai import router as ai_router
from app.routers.dashboard import router as dashboard_router
from app.routers.notes import router as notes_router
from app.routers.websocket import router as ws_router
from app.routers.admin import router as admin_router
from app.routers.sources import router as sources_router
from app.routers.data_qa import router as data_qa_router


# ─── LOGGING ───
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("stairs")


# ─── KNOWLEDGE ENGINE CACHE ───
_knowledge_cache = {
    "frameworks": [],
    "failure_patterns": [],
    "books_summary": "",
    "measurement_tools": [],
    "system_prompt": "",
    "loaded_at": None,
}


async def load_knowledge_cache():
    """Load knowledge from kb_* tables into memory for AI prompt enrichment."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        kb_exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'kb_frameworks')"
        )
        if not kb_exists:
            print("  ⚠️ Knowledge Engine tables not found — using basic system prompt")
            _knowledge_cache["system_prompt"] = _build_basic_system_prompt()
            return

        try:
            fw_rows = await conn.fetch(
                "SELECT code, name, phase, originator, year_introduced, description "
                "FROM kb_frameworks ORDER BY phase, year_introduced"
            )
            _knowledge_cache["frameworks"] = [dict(r) for r in fw_rows]
        except Exception as e:
            print(f"  ⚠️ kb_frameworks load failed: {e}")
            _knowledge_cache["frameworks"] = []

        try:
            fp_rows = await conn.fetch(
                "SELECT code, name, category, description, detection_signals, prevention_strategies, severity, statistic "
                "FROM kb_failure_patterns ORDER BY severity DESC"
            )
            _knowledge_cache["failure_patterns"] = [dict(r) for r in fp_rows]
        except Exception:
            _knowledge_cache["failure_patterns"] = []

        try:
            book_count = await conn.fetchval("SELECT COUNT(*) FROM kb_books")
            top_books = await conn.fetch(
                "SELECT title, category, key_concepts FROM kb_books WHERE integration_tier = 'tier_1' ORDER BY year_published DESC LIMIT 10"
            )
            _knowledge_cache["books_summary"] = f"{book_count} strategy books indexed. Key tier-1 references: " + \
                ", ".join(f"{b['title']} ({b['category']})" for b in top_books)
        except Exception:
            _knowledge_cache["books_summary"] = ""

        try:
            mt_rows = await conn.fetch(
                "SELECT code, name, stage, description, how_it_works, interpretation_guide "
                "FROM kb_measurement_tools ORDER BY stage, year_introduced"
            )
            _knowledge_cache["measurement_tools"] = [dict(r) for r in mt_rows]
        except Exception:
            _knowledge_cache["measurement_tools"] = []

        _knowledge_cache["system_prompt"] = _build_enriched_system_prompt()
        _knowledge_cache["loaded_at"] = datetime.now(timezone.utc)
        fw_count = len(_knowledge_cache["frameworks"])
        fp_count = len(_knowledge_cache["failure_patterns"])
        mt_count = len(_knowledge_cache["measurement_tools"])
        print(f"  ✅ Knowledge Engine loaded: {fw_count} frameworks, {fp_count} failure patterns, {mt_count} measurement tools")


def _build_basic_system_prompt():
    return f"""You are Stairs, an AI strategy assistant created by DEVONEERS.
The current year is {datetime.now().year}.
You help organizations build, execute, and monitor their strategic plans.
Expert in: OKR, Balanced Scorecard, OGSM, Hoshin Kanri, Blue Ocean Strategy, Porter's frameworks.
Philosophy: "Human IS the Loop" — you suggest, humans decide.
Keep responses concise and actionable. Use Arabic when the user writes in Arabic.
Format measurable items with clear targets, units, and timeframes.

When performing a SPACE Matrix analysis, include a markdown table: | Dimension | Factor | Score | (FS/IS: +1 to +6, CA/ES: -1 to -6).
When performing a BCG Matrix analysis, include a markdown table: | Product/Unit | Market Growth Rate (%) | Relative Market Share | Quadrant |.
When performing a Porter's Five Forces analysis, include a markdown table: | Force | Intensity (1-5) | Key Factors |."""


def _build_enriched_system_prompt():
    parts = [
        "You are Stairs, an AI strategy assistant created by DEVONEERS.",
        f"The current year is {datetime.now().year}.",
        'Philosophy: "Human IS the Loop" — you suggest, humans decide.',
        "You help ANY organization build, execute, and monitor their strategic plans.",
        "Keep responses concise and actionable. Use Arabic when the user writes in Arabic.",
        "",
        "═══ YOUR KNOWLEDGE BASE ═══",
    ]

    fw = _knowledge_cache.get("frameworks", [])
    if fw:
        parts.append(f"\nYou know {len(fw)} strategy frameworks:")
        for f in fw:
            parts.append(f"• {f['name']} ({f['originator']}, {f['year_introduced']}) [{f['phase']}]: {f['description']}")

    fp = _knowledge_cache.get("failure_patterns", [])
    if fp:
        parts.append(f"\nYou detect {len(fp)} strategy failure patterns:")
        for p in fp:
            signals = p.get('detection_signals') or []
            parts.append(f"• {p['name']} [{p['severity']}]: {p['description'][:120]}...")
            if signals:
                parts.append(f"  Signals: {', '.join(signals[:3])}")
            if p.get('statistic'):
                parts.append(f"  Research: {p['statistic']}")

    mt = _knowledge_cache.get("measurement_tools", [])
    if mt:
        parts.append(f"\nYou can guide users through {len(mt)} strategy measurement tools:")
        for t in mt:
            parts.append(f"• {t['name']} (Stage: {t['stage']}): {t['description'][:100]}...")

    bs = _knowledge_cache.get("books_summary", "")
    if bs:
        parts.append(f"\nKnowledge library: {bs}")

    parts.extend([
        "",
        "═══ RULES ═══",
        "• When analyzing strategy, actively check for failure patterns and warn the user.",
        "• When a user asks about measuring or evaluating strategy, suggest relevant measurement tools (IFE, EFE, CPM, SPACE, IE, Grand Strategy, QSPM).",
        "• Reference specific frameworks by name when they apply.",
        "• Cite research statistics when relevant (e.g., '63% strategy execution gap').",
        "• Format measurable items with clear targets, units, and timeframes.",
        "• Never hardcode to any specific organization — adapt advice to the user's context.",
        "",
        "═══ STRUCTURED TABLE OUTPUT ═══",
        "When performing a SPACE Matrix analysis, ALWAYS include a markdown table with these columns:",
        "| Dimension | Factor | Score |",
        "|-----------|--------|-------|",
        "Dimension must be one of: Financial Strength, Competitive Advantage, Environmental Stability, Industry Strength.",
        "Scores: Financial Strength and Industry Strength use +1 to +6. Competitive Advantage and Environmental Stability use -1 to -6.",
        "",
        "When performing a BCG Matrix analysis, ALWAYS include a markdown table with these columns:",
        "| Product/Unit | Market Growth Rate (%) | Relative Market Share | Quadrant |",
        "|--------------|----------------------|----------------------|----------|",
        "Market Growth Rate is a percentage. Relative Market Share is a ratio (>=1.0 means high). Quadrant is Star, Question Mark, Cash Cow, or Dog.",
        "",
        "When performing a Porter's Five Forces analysis, ALWAYS include a markdown table with these columns:",
        "| Force | Intensity (1-5) | Key Factors |",
        "|-------|----------------|-------------|",
        "Force must be one of: Competitive Rivalry, Threat of New Entrants, Threat of Substitutes, Bargaining Power of Buyers, Bargaining Power of Suppliers.",
        "Intensity is 1 (low) to 5 (high).",
        "",
        "These tables enable the interactive calculator feature. Always include them alongside your prose analysis.",
    ])

    return "\n".join(parts)


# ─── AUTO-MIGRATION: STRATEGIES TABLE ───

async def ensure_strategies_table():
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'strategies')"
        )
        if not exists:
            print("  → Creating strategies table...")
            await conn.execute("""
                CREATE TABLE strategies (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
                    name VARCHAR(500) NOT NULL,
                    name_ar VARCHAR(500),
                    description TEXT,
                    description_ar TEXT,
                    company VARCHAR(255),
                    industry VARCHAR(255),
                    icon VARCHAR(10) DEFAULT '🎯',
                    color VARCHAR(20) DEFAULT '#B8904A',
                    framework VARCHAR(50) DEFAULT 'okr',
                    status VARCHAR(30) DEFAULT 'active',
                    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
                    settings JSONB DEFAULT '{}',
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            await conn.execute("CREATE INDEX idx_strategies_org ON strategies(organization_id)")
            await conn.execute("CREATE INDEX idx_strategies_owner ON strategies(owner_id)")
            await conn.execute("""
                INSERT INTO strategies (id, organization_id, name, description, company, industry, icon, color, framework, status, owner_id)
                VALUES ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
                        'RootRise Vision 2026', 'DEVONEERS strategic roadmap', 'DEVONEERS / RootRise',
                        'Technology / AI', '🌱', '#B8904A', 'okr', 'active', 'b0000000-0000-0000-0000-000000000001')
                ON CONFLICT (id) DO NOTHING
            """)
            print("  ✅ strategies table created + default seeded")

        has_col = await conn.fetchval("""
            SELECT EXISTS(SELECT 1 FROM information_schema.columns
            WHERE table_name = 'stairs' AND column_name = 'strategy_id')
        """)
        if not has_col:
            await conn.execute("ALTER TABLE stairs ADD COLUMN strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_stairs_strategy ON stairs(strategy_id)")
            await conn.execute("""
                UPDATE stairs SET strategy_id = 'd0000000-0000-0000-0000-000000000001'
                WHERE organization_id = 'a0000000-0000-0000-0000-000000000001' AND strategy_id IS NULL
            """)
            print("  ✅ stairs.strategy_id added and linked")

        await conn.execute("""
            UPDATE stairs SET
                description = REPLACE(description, '2024', '2026'),
                title = REPLACE(title, '2024', '2026')
            WHERE description LIKE '%2024%' OR title LIKE '%2024%'
        """)


# ─── AUTO-MIGRATION: ORPHAN STAIR CLEANUP ───

async def ensure_no_orphan_stairs():
    """Repair stair elements that were created without a strategy_id.

    The old POST /api/v1/stairs handler dropped strategy_id, leaving
    elements unattached so the AI advisor leaked them across strategies and
    the tree under-counted. Resolve each orphan, most reliable signal first:

      1. Inherit strategy_id from the nearest ancestor that has one
         (handles wizard trees where only the root got linked).
      2. If the org has exactly one strategy, attach orphans to it.
      3. Anything still unresolved can't be safely placed — soft-delete it
         so it stops poisoning AI context (recoverable via deleted_at).

    Idempotent: after a clean run there are no orphans, so re-runs no-op.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        has_col = await conn.fetchval("""
            SELECT EXISTS(SELECT 1 FROM information_schema.columns
            WHERE table_name = 'stairs' AND column_name = 'strategy_id')
        """)
        if not has_col:
            return

        before = await conn.fetchval(
            "SELECT COUNT(*) FROM stairs WHERE strategy_id IS NULL AND deleted_at IS NULL"
        )
        if not before:
            return
        print(f"  → Orphan stair cleanup: {before} element(s) with NULL strategy_id")

        # 1. Inherit from parent, repeatedly, so multi-level trees resolve
        #    from the linked root down to the deepest descendant.
        for _ in range(25):
            result = await conn.execute("""
                UPDATE stairs c SET strategy_id = p.strategy_id, updated_at = NOW()
                FROM stairs p
                WHERE c.parent_id = p.id
                  AND c.strategy_id IS NULL
                  AND c.deleted_at IS NULL
                  AND p.strategy_id IS NOT NULL
            """)
            if result == "UPDATE 0":
                break

        # 2. Single-strategy orgs: the only strategy is the unambiguous home.
        await conn.execute("""
            UPDATE stairs s SET strategy_id = one.sid, updated_at = NOW()
            FROM (
                SELECT organization_id AS oid, MIN(id::text)::uuid AS sid
                FROM strategies
                GROUP BY organization_id
                HAVING COUNT(*) = 1
            ) one
            WHERE s.organization_id = one.oid
              AND s.strategy_id IS NULL
              AND s.deleted_at IS NULL
        """)

        # 3. Unresolvable orphans (multi-strategy org, no linked ancestor):
        #    soft-delete so they stop leaking into AI context.
        remaining = await conn.fetch(
            "SELECT id, organization_id, title FROM stairs "
            "WHERE strategy_id IS NULL AND deleted_at IS NULL"
        )
        if remaining:
            for r in remaining:
                print(f"     soft-deleting unassignable orphan {r['id']} \"{r['title']}\" (org {r['organization_id']})")
            await conn.execute(
                "UPDATE stairs SET deleted_at = NOW(), updated_at = NOW() "
                "WHERE strategy_id IS NULL AND deleted_at IS NULL"
            )

        after = await conn.fetchval(
            "SELECT COUNT(*) FROM stairs WHERE strategy_id IS NULL AND deleted_at IS NULL"
        )
        print(f"  ✅ Orphan stair cleanup complete — remaining orphans: {after}")


# ─── AUTO-MIGRATION: NOTES TABLE ───

async def ensure_notes_table():
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'notes')"
        )
        if not exists:
            print("  → Creating notes table...")
            await conn.execute("""
                CREATE TABLE notes (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
                    title VARCHAR(500) NOT NULL,
                    content TEXT DEFAULT '',
                    source VARCHAR(50) DEFAULT 'manual',
                    tags TEXT[] DEFAULT '{}',
                    pinned BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            await conn.execute("CREATE INDEX idx_notes_user ON notes(user_id, organization_id)")
            await conn.execute("CREATE INDEX idx_notes_pinned ON notes(user_id, pinned DESC, updated_at DESC)")
            print("  ✅ notes table created")


# ─── AUTO-MIGRATION: ACTION PLANS TABLE ───

async def ensure_action_plans_table():
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'action_plans')"
        )
        if not exists:
            print("  → Creating action_plans table...")
            await conn.execute("""
                CREATE TABLE action_plans (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    stair_id UUID REFERENCES stairs(id) ON DELETE CASCADE NOT NULL,
                    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
                    plan_type VARCHAR(30) NOT NULL DEFAULT 'recommended',
                    raw_text TEXT NOT NULL,
                    tasks JSONB DEFAULT '[]',
                    feedback JSONB,
                    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            await conn.execute("CREATE INDEX idx_action_plans_stair ON action_plans(stair_id, created_at DESC)")
            await conn.execute("CREATE INDEX idx_action_plans_org ON action_plans(organization_id)")
            print("  ✅ action_plans table created")


# ─── AUTO-MIGRATION: AI USAGE LOGS TABLE ───

async def ensure_strategy_sources_table():
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'strategy_sources')"
        )
        if not exists:
            print("  → Creating strategy_sources table...")
            await conn.execute("""
                CREATE TABLE strategy_sources (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    strategy_id UUID NOT NULL,
                    source_type VARCHAR(50) NOT NULL,
                    content TEXT NOT NULL,
                    metadata JSONB DEFAULT '{}',
                    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            await conn.execute("CREATE INDEX idx_strategy_sources_strategy ON strategy_sources(strategy_id, created_at DESC)")
            await conn.execute("CREATE INDEX idx_strategy_sources_type ON strategy_sources(strategy_id, source_type)")
            print("  ✅ strategy_sources table created")


async def ensure_agent_logs_table():
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_logs')"
        )
        if not exists:
            print("  → Creating agent_logs table...")
            await conn.execute("""
                CREATE TABLE agent_logs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    strategy_id UUID,
                    agent_name VARCHAR(50) NOT NULL,
                    task_type VARCHAR(100) NOT NULL,
                    input_summary TEXT,
                    output_summary TEXT,
                    tokens_used INTEGER DEFAULT 0,
                    model_used VARCHAR(50),
                    confidence_score INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            await conn.execute("CREATE INDEX idx_agent_logs_strategy ON agent_logs(strategy_id, created_at DESC)")
            await conn.execute("CREATE INDEX idx_agent_logs_agent ON agent_logs(agent_name, created_at DESC)")
            print("  ✅ agent_logs table created")


async def ensure_ai_usage_logs_table():
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_usage_logs')"
        )
        if not exists:
            print("  → Creating ai_usage_logs table...")
            await conn.execute("""
                CREATE TABLE ai_usage_logs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    provider VARCHAR(20) NOT NULL,
                    success BOOLEAN NOT NULL,
                    response_time_ms INTEGER,
                    tokens_used INTEGER DEFAULT 0,
                    status_code INTEGER,
                    fallback_used BOOLEAN DEFAULT FALSE,
                    fallback_from VARCHAR(20),
                    error_message TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            await conn.execute("CREATE INDEX idx_ai_usage_logs_created ON ai_usage_logs(created_at DESC)")
            await conn.execute("CREATE INDEX idx_ai_usage_logs_provider ON ai_usage_logs(provider, created_at DESC)")
            await conn.execute("CREATE INDEX idx_ai_usage_logs_fallback ON ai_usage_logs(fallback_used) WHERE fallback_used = TRUE")
            print("  ✅ ai_usage_logs table created")


# ─── LIFESPAN ───
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🪜 Stairs v3.7.1 Starting up — Modular Router Edition...")
    await init_db()
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id, password_hash FROM users WHERE id = $1", DEFAULT_USER_ID)
        if user and user["password_hash"] and not user["password_hash"].startswith("$2"):
            hashed = hash_password("stairs2026")
            await conn.execute("UPDATE users SET password_hash = $1 WHERE id = $2", hashed, DEFAULT_USER_ID)
            print("  → Migrated seed user password to bcrypt")
    try:
        await load_knowledge_cache()
    except Exception as e:
        print(f"  ⚠️ Knowledge Engine failed to load: {e}")
        _knowledge_cache["system_prompt"] = _build_basic_system_prompt()
    try:
        await ensure_strategies_table()
    except Exception as e:
        print(f"  ⚠️ Strategies migration: {e}")
    try:
        await ensure_no_orphan_stairs()
    except Exception as e:
        print(f"  ⚠️ Orphan stair cleanup: {e}")
    try:
        await ensure_notes_table()
    except Exception as e:
        print(f"  ⚠️ Notes migration: {e}")
    try:
        await ensure_action_plans_table()
    except Exception as e:
        print(f"  ⚠️ Action plans migration: {e}")
    try:
        await ensure_agent_logs_table()
    except Exception as e:
        print(f"  ⚠️ Agent logs migration: {e}")
    try:
        await ensure_ai_usage_logs_table()
    except Exception as e:
        print(f"  ⚠️ AI usage logs migration: {e}")
    try:
        await ensure_strategy_sources_table()
    except Exception as e:
        print(f"  ⚠️ Strategy sources migration: {e}")
    yield
    await close_pool()
    print("🪜 Stairs Shutting down...")


# ─── APP ───
app = FastAPI(
    title="Stairs API",
    description="Strategy AI Interactive Real-time System — Modular Router Edition — By DEVONEERS",
    version="3.7.1",
    lifespan=lifespan,
)

# ─── CORS ───
ALLOWED_ORIGINS_ENV = os.getenv("ALLOWED_ORIGINS", "")
_cors_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]
if ALLOWED_ORIGINS_ENV and ALLOWED_ORIGINS_ENV != "*":
    _cors_origins.extend(o.strip() for o in ALLOWED_ORIGINS_ENV.split(",") if o.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r'https://.*\.vercel\.app',
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
    expose_headers=['*'],
)


def _is_origin_allowed(origin: str) -> bool:
    """Check if a request origin is allowed for CORS."""
    if not origin:
        return False
    if re_module.match(r'https://.*\.vercel\.app$', origin):
        return True
    if origin.startswith("http://localhost") or origin.startswith("http://127.0.0.1"):
        return True
    if ALLOWED_ORIGINS_ENV == "*":
        return True
    if ALLOWED_ORIGINS_ENV:
        for o in ALLOWED_ORIGINS_ENV.split(","):
            if origin == o.strip():
                return True
    return False


# ─── GLOBAL EXCEPTION HANDLER ───

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions, log full traceback, return JSON with CORS headers."""
    tb = tb_module.format_exc()
    logger.error(
        "Unhandled %s on %s %s:\n%s",
        type(exc).__name__, request.method, request.url.path, tb,
    )
    # Also print to stdout for platforms that capture stdout (Railway, Docker)
    print(f"500 ERROR on {request.method} {request.url.path}: {exc}\n{tb}")
    # Add CORS headers directly as safety net (in case CORSMiddleware doesn't run)
    origin = request.headers.get("origin", "")
    headers = {}
    if _is_origin_allowed(origin):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal Server Error",
            "error": str(exc),
            "type": type(exc).__name__,
        },
        headers=headers,
    )

# ─── RATE LIMITER (in-memory, per-IP) ───
_rate_limit_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_MAX = int(os.getenv("RATE_LIMIT_MAX", "60"))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW
    hits = _rate_limit_store[client_ip]
    _rate_limit_store[client_ip] = [t for t in hits if t > window_start]
    if len(_rate_limit_store[client_ip]) >= RATE_LIMIT_MAX:
        return Response(
            content='{"detail":"Rate limit exceeded. Try again later."}',
            status_code=429,
            media_type="application/json",
        )
    _rate_limit_store[client_ip].append(now)
    response = await call_next(request)
    return response


# ─── JWT SECRET WARNING ───
if JWT_SECRET == "stairs-dev-secret-change-in-production-2026":
    import warnings
    warnings.warn(
        "JWT_SECRET is using the default value. Set a strong random secret via the JWT_SECRET environment variable.",
        stacklevel=1,
    )


# ─── REGISTER ROUTERS ───
app.include_router(auth_router)
app.include_router(stairs_router)
app.include_router(strategies_router)
app.include_router(knowledge_router)
app.include_router(ai_router)
app.include_router(dashboard_router)
app.include_router(notes_router)
app.include_router(ws_router)
app.include_router(admin_router)
app.include_router(sources_router)
app.include_router(data_qa_router)


# ─── CORS TEST ───

@app.get("/api/cors-test")
def cors_test():
    return {"cors": "working", "version": "v3.7.1"}


# ─── HEALTH & ROOT ───

@app.get("/")
async def root():
    return {"name": "Stairs API", "version": "3.7.1",
            "tagline": "Climb Your Strategy — Modular Router Edition",
            "by": "Tee | DEVONEERS", "status": "operational",
            "knowledge_engine": {
                "frameworks": len(_knowledge_cache.get("frameworks", [])),
                "failure_patterns": len(_knowledge_cache.get("failure_patterns", [])),
                "measurement_tools": len(_knowledge_cache.get("measurement_tools", [])),
                "loaded_at": str(_knowledge_cache.get("loaded_at", "not loaded")),
            },
            "features": ["jwt_auth", "websocket", "multi_tenant", "knowledge_engine", "ai_strategy", "strategy_containers", "rate_limiting", "ai_fallback", "data_qa"]}


@app.get("/health")
async def health():
    pool = await get_pool()
    async with pool.acquire() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM stairs WHERE deleted_at IS NULL")
    return {"status": "healthy", "stairs_count": count, "version": "3.7.1",
            "knowledge_engine": bool(_knowledge_cache.get("loaded_at"))}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
