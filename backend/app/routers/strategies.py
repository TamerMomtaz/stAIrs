"""ST.AIRS — Strategies Router"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Depends

from app.db.connection import get_pool
from app.helpers import row_to_dict, rows_to_dicts, get_auth, AuthContext
from app.models.schemas import StrategyCreate, StrategyUpdate
from app.routers.websocket import ws_manager

router = APIRouter(prefix="/api/v1/strategies", tags=["strategies"])


@router.get("")
async def list_strategies(
    auth: AuthContext = Depends(get_auth),
    include_archived: bool = Query(False, description="Include archived strategies"),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        q = """
            SELECT s.*,
                   u.full_name as owner_name,
                   (SELECT COUNT(*) FROM stairs st WHERE st.strategy_id = s.id AND st.deleted_at IS NULL) as element_count,
                   (SELECT AVG(st.progress_percent) FROM stairs st WHERE st.strategy_id = s.id AND st.deleted_at IS NULL) as avg_progress
            FROM strategies s
            LEFT JOIN users u ON u.id = s.owner_id
            WHERE s.organization_id = $1
        """
        if not include_archived:
            q += " AND (s.status != 'archived' OR s.status IS NULL)"
        q += " ORDER BY s.updated_at DESC"
        rows = await conn.fetch(q, auth.org_id)
        results = rows_to_dicts(rows)
        for r in results:
            r["avg_progress"] = round(float(r.get("avg_progress") or 0), 1)
        return results


@router.post("", status_code=201)
async def create_strategy(strat: StrategyCreate, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        strat_id = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO strategies (id, organization_id, name, name_ar, description, description_ar,
                                    company, industry, icon, color, framework, status, owner_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',$12)
        """, strat_id, auth.org_id, strat.name, strat.name_ar, strat.description, strat.description_ar,
            strat.company, strat.industry, strat.icon or "🎯", strat.color or "#B8904A",
            strat.framework or "okr", auth.user_id)
        row = await conn.fetchrow("""
            SELECT s.*, u.full_name as owner_name, 0 as element_count, 0.0 as avg_progress
            FROM strategies s LEFT JOIN users u ON u.id = s.owner_id WHERE s.id = $1
        """, strat_id)
        await ws_manager.broadcast_to_org(auth.org_id, {
            "event": "strategy_created", "data": {"id": strat_id, "name": strat.name}
        })
        return row_to_dict(row)


@router.get("/{strategy_id}")
async def get_strategy(strategy_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT s.*, u.full_name as owner_name,
                   (SELECT COUNT(*) FROM stairs st WHERE st.strategy_id = s.id AND st.deleted_at IS NULL) as element_count,
                   (SELECT AVG(st.progress_percent) FROM stairs st WHERE st.strategy_id = s.id AND st.deleted_at IS NULL) as avg_progress
            FROM strategies s LEFT JOIN users u ON u.id = s.owner_id
            WHERE s.id = $1 AND s.organization_id = $2
        """, strategy_id, auth.org_id)
        if not row:
            raise HTTPException(404, "Strategy not found")
        result = row_to_dict(row)
        result["avg_progress"] = round(float(result.get("avg_progress") or 0), 1)
        return result


@router.put("/{strategy_id}")
async def update_strategy(strategy_id: str, updates: StrategyUpdate, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM strategies WHERE id = $1 AND organization_id = $2", strategy_id, auth.org_id
        )
        if not existing:
            raise HTTPException(404, "Strategy not found")
        update_data = updates.model_dump(exclude_unset=True)
        if not update_data:
            raise HTTPException(400, "No fields to update")
        sets, params, idx = [], [], 1
        for k, v in update_data.items():
            sets.append(f'"{k}" = ${idx}')
            params.append(v)
            idx += 1
        sets.append(f"updated_at = ${idx}")
        params.append(datetime.now(timezone.utc))
        idx += 1
        params.append(strategy_id)
        await conn.execute(f'UPDATE strategies SET {", ".join(sets)} WHERE id = ${idx}', *params)
        row = await conn.fetchrow("""
            SELECT s.*, u.full_name as owner_name,
                   (SELECT COUNT(*) FROM stairs st WHERE st.strategy_id = s.id AND st.deleted_at IS NULL) as element_count,
                   (SELECT AVG(st.progress_percent) FROM stairs st WHERE st.strategy_id = s.id AND st.deleted_at IS NULL) as avg_progress
            FROM strategies s LEFT JOIN users u ON u.id = s.owner_id WHERE s.id = $1
        """, strategy_id)
        return row_to_dict(row)


@router.delete("/{strategy_id}")
async def delete_strategy(strategy_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id, status FROM strategies WHERE id = $1 AND organization_id = $2",
            strategy_id, auth.org_id
        )
        if not existing:
            raise HTTPException(404, "Strategy not found")
        await conn.execute(
            "UPDATE strategies SET status = 'archived', updated_at = NOW() WHERE id = $1",
            strategy_id
        )
        await ws_manager.broadcast_to_org(auth.org_id, {
            "event": "strategy_archived", "data": {"id": strategy_id}
        })
        return {"archived": True, "id": strategy_id}


@router.post("/{strategy_id}/restore")
async def restore_strategy(strategy_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id, status FROM strategies WHERE id = $1 AND organization_id = $2",
            strategy_id, auth.org_id
        )
        if not existing:
            raise HTTPException(404, "Strategy not found")
        if existing["status"] != "archived":
            raise HTTPException(400, "Strategy is not archived")
        await conn.execute(
            "UPDATE strategies SET status = 'active', updated_at = NOW() WHERE id = $1",
            strategy_id
        )
        await ws_manager.broadcast_to_org(auth.org_id, {
            "event": "strategy_restored", "data": {"id": strategy_id}
        })
        return {"restored": True, "id": strategy_id}


@router.delete("/{strategy_id}/permanent")
async def permanent_delete_strategy(strategy_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id, status FROM strategies WHERE id = $1 AND organization_id = $2",
            strategy_id, auth.org_id
        )
        if not existing:
            raise HTTPException(404, "Strategy not found")
        if existing["status"] != "archived":
            raise HTTPException(400, "Strategy must be archived before permanent deletion")
        await conn.execute(
            "UPDATE stairs SET deleted_at = NOW() WHERE strategy_id = $1 AND deleted_at IS NULL",
            strategy_id
        )
        await conn.execute("DELETE FROM strategies WHERE id = $1", strategy_id)
        await ws_manager.broadcast_to_org(auth.org_id, {
            "event": "strategy_deleted", "data": {"id": strategy_id}
        })
        return {"deleted": True, "id": strategy_id, "permanent": True}


@router.get("/{strategy_id}/tree")
async def get_strategy_tree(strategy_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT s.*, (SELECT COUNT(*) FROM stairs c WHERE c.parent_id = s.id AND c.deleted_at IS NULL) as children_count,
                u.full_name as owner_name
            FROM stairs s LEFT JOIN users u ON s.owner_id = u.id
            WHERE s.strategy_id = $1 AND s.organization_id = $2 AND s.deleted_at IS NULL
            ORDER BY s.level, s.sort_order, s.created_at
        """, strategy_id, auth.org_id)
        all_stairs = rows_to_dicts(rows)
        def build_tree(parent_id=None):
            children = []
            for s in all_stairs:
                pid = str(s["parent_id"]) if s.get("parent_id") else None
                if pid == parent_id:
                    children.append({"stair": s, "children": build_tree(str(s["id"]))})
            return children
        return build_tree(None)
