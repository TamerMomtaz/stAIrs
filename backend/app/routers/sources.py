"""ST.AIRS — Strategy Sources Router (Source of Truth)"""

import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Depends

from app.db.connection import get_pool
from app.helpers import row_to_dict, rows_to_dicts, get_auth, AuthContext
from app.models.schemas import SourceCreate, SourceUpdate, SourceOut

router = APIRouter(prefix="/api/v1/strategies", tags=["sources"])


@router.get("/{strategy_id}/sources")
async def list_sources(
    strategy_id: str,
    source_type: Optional[str] = Query(None, description="Filter by source type"),
    search: Optional[str] = Query(None, description="Search across source content"),
    auth: AuthContext = Depends(get_auth),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        strat = await conn.fetchrow(
            "SELECT id FROM strategies WHERE id = $1 AND organization_id = $2",
            strategy_id, auth.org_id,
        )
        if not strat:
            raise HTTPException(404, "Strategy not found")

        q = "SELECT * FROM strategy_sources WHERE strategy_id = $1"
        params = [strategy_id]
        idx = 2

        if source_type:
            q += f" AND source_type = ${idx}"
            params.append(source_type)
            idx += 1

        if search:
            q += f" AND content ILIKE ${idx}"
            params.append(f"%{search}%")
            idx += 1

        q += " ORDER BY created_at DESC"
        rows = await conn.fetch(q, *params)
        return rows_to_dicts(rows)


@router.get("/{strategy_id}/sources/count")
async def count_sources(strategy_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        strat = await conn.fetchrow(
            "SELECT id FROM strategies WHERE id = $1 AND organization_id = $2",
            strategy_id, auth.org_id,
        )
        if not strat:
            raise HTTPException(404, "Strategy not found")
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM strategy_sources WHERE strategy_id = $1",
            strategy_id,
        )
        return {"count": count, "strategy_id": strategy_id}


@router.post("/{strategy_id}/sources", status_code=201)
async def create_source(
    strategy_id: str,
    source: SourceCreate,
    auth: AuthContext = Depends(get_auth),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        strat = await conn.fetchrow(
            "SELECT id FROM strategies WHERE id = $1 AND organization_id = $2",
            strategy_id, auth.org_id,
        )
        if not strat:
            raise HTTPException(404, "Strategy not found")

        source_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        await conn.execute(
            "INSERT INTO strategy_sources (id, strategy_id, source_type, content, metadata, created_by, created_at, updated_at) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $7)",
            source_id, strategy_id, source.source_type, source.content,
            json.dumps(source.metadata or {}), auth.user_id, now,
        )
        row = await conn.fetchrow("SELECT * FROM strategy_sources WHERE id = $1", source_id)
        return row_to_dict(row)


@router.put("/{strategy_id}/sources/{source_id}")
async def update_source(
    strategy_id: str,
    source_id: str,
    updates: SourceUpdate,
    auth: AuthContext = Depends(get_auth),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT * FROM strategy_sources WHERE id = $1 AND strategy_id = $2",
            source_id, strategy_id,
        )
        if not existing:
            raise HTTPException(404, "Source not found")

        update_data = updates.model_dump(exclude_unset=True)
        if not update_data:
            raise HTTPException(400, "No fields to update")

        sets, params, idx = [], [], 1
        for k, v in update_data.items():
            if k == "metadata":
                sets.append(f'"metadata" = ${idx}')
                params.append(json.dumps(v or {}))
            else:
                sets.append(f'"{k}" = ${idx}')
                params.append(v)
            idx += 1
        sets.append(f"updated_at = ${idx}")
        params.append(datetime.now(timezone.utc))
        idx += 1
        params.append(source_id)
        await conn.execute(
            f'UPDATE strategy_sources SET {", ".join(sets)} WHERE id = ${idx}', *params
        )
        row = await conn.fetchrow("SELECT * FROM strategy_sources WHERE id = $1", source_id)
        return row_to_dict(row)


@router.delete("/{strategy_id}/sources/{source_id}")
async def delete_source(
    strategy_id: str,
    source_id: str,
    auth: AuthContext = Depends(get_auth),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM strategy_sources WHERE id = $1 AND strategy_id = $2",
            source_id, strategy_id,
        )
        if result == "DELETE 0":
            raise HTTPException(404, "Source not found")
        return {"deleted": True, "id": source_id}


async def log_source(strategy_id: str, source_type: str, content: str, metadata: dict = None, user_id: str = None):
    """Helper to auto-log a source entry. Used by other routers for integration."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            table_exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'strategy_sources')"
            )
            if not table_exists:
                return
            source_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)
            await conn.execute(
                "INSERT INTO strategy_sources (id, strategy_id, source_type, content, metadata, created_by, created_at, updated_at) "
                "VALUES ($1, $2, $3, $4, $5, $6, $7, $7)",
                source_id, strategy_id, source_type, content,
                json.dumps(metadata or {}), user_id, now,
            )
    except Exception:
        pass  # Non-critical — never break the main flow
