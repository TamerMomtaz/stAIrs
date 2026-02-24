"""ST.AIRS — Knowledge Engine Router"""

from fastapi import APIRouter, HTTPException, Depends

from app.db.connection import get_pool
from app.helpers import row_to_dict, rows_to_dicts, require_auth, AuthContext

router = APIRouter(prefix="/api/v1/knowledge", tags=["knowledge"])


@router.get("/frameworks")
async def list_knowledge_frameworks():
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            rows = await conn.fetch("SELECT * FROM kb_frameworks ORDER BY phase, year_introduced")
            return rows_to_dicts(rows)
        except Exception:
            return []


@router.get("/books")
async def list_knowledge_books():
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            rows = await conn.fetch("""
                SELECT b.*, string_agg(a.name, ', ') as authors
                FROM kb_books b
                LEFT JOIN kb_book_authors ba ON ba.book_id = b.id
                LEFT JOIN kb_authors a ON a.id = ba.author_id
                GROUP BY b.id
                ORDER BY b.integration_tier, b.year_published DESC
            """)
            return rows_to_dicts(rows)
        except Exception:
            try:
                rows = await conn.fetch("SELECT * FROM kb_books ORDER BY integration_tier, year_published DESC")
                return rows_to_dicts(rows)
            except Exception:
                return []


@router.get("/failure-patterns")
async def list_failure_patterns():
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            rows = await conn.fetch("SELECT * FROM kb_failure_patterns ORDER BY severity DESC, name")
            return rows_to_dicts(rows)
        except Exception:
            return []


@router.get("/measurement-tools")
async def list_measurement_tools():
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            rows = await conn.fetch("SELECT * FROM kb_measurement_tools ORDER BY stage, year_introduced")
            return rows_to_dicts(rows)
        except Exception:
            return []


@router.get("/measurement-tools/{code}")
async def get_measurement_tool(code: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow("SELECT * FROM kb_measurement_tools WHERE code = $1", code)
            if not row:
                raise HTTPException(404, f"Measurement tool '{code}' not found")
            return row_to_dict(row)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(404, "Measurement tools table not found — run migration first")


@router.get("/kpis")
async def list_knowledge_kpis():
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            rows = await conn.fetch("SELECT * FROM kb_leading_lagging_kpis ORDER BY perspective, kpi_type")
            return rows_to_dicts(rows)
        except Exception:
            return []


@router.get("/mena-intel")
async def list_mena_intel():
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            rows = await conn.fetch("SELECT * FROM kb_mena_market_intel ORDER BY category, year DESC")
            return rows_to_dicts(rows)
        except Exception:
            return []


@router.get("/stats")
async def knowledge_stats():
    pool = await get_pool()
    async with pool.acquire() as conn:
        stats = {}
        for tbl, key in [
            ("kb_frameworks", "frameworks"),
            ("kb_books", "books"),
            ("kb_failure_patterns", "failure_patterns"),
            ("kb_measurement_tools", "measurement_tools"),
            ("kb_authors", "authors"),
            ("kb_leading_lagging_kpis", "kpis"),
            ("kb_mena_market_intel", "mena_intel"),
            ("kb_ontology_terms", "ontology_terms"),
            ("kb_review_cadences", "review_cadences"),
        ]:
            try:
                stats[key] = await conn.fetchval(f"SELECT COUNT(*) FROM {tbl}")
            except Exception:
                stats[key] = 0
        stats["key_facts"] = [
            {"label": "Strategy Execution Gap", "value": "63%", "source": "Mankins & Steele (Bain)"},
            {"label": "Employees Understanding Strategy", "value": "5%", "source": "Kaplan & Norton"},
            {"label": "MENA AI Market by 2030", "value": "$166B", "source": "Industry projections"},
            {"label": "Cross-functional Trust", "value": "9%", "source": "MIT/HBR (Sull, Homkes, Sull)"},
        ]
        return stats


@router.post("/reload")
async def reload_knowledge(auth: AuthContext = Depends(require_auth)):
    if auth.role not in ("admin", "owner"):
        raise HTTPException(403, "Admin access required")
    # Import here to avoid circular import — cache lives in main
    from app.main import load_knowledge_cache, _knowledge_cache
    await load_knowledge_cache()
    return {"reloaded": True, "loaded_at": str(_knowledge_cache.get("loaded_at"))}
