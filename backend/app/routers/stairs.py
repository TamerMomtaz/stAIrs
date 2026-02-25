"""ST.AIRS — Stairs CRUD Router"""

import json
import uuid
from datetime import datetime, date, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query, Depends

from app.db.connection import get_pool
from app.helpers import (
    row_to_dict, rows_to_dicts, compute_health, generate_code,
    get_auth, AuthContext,
)
from app.models.schemas import (
    StairCreate, StairUpdate, StairOut, StairTree,
    ProgressCreate, ProgressOut,
    RelationshipCreate, RelationshipOut,
    KPIMeasurementCreate, KPIMeasurementOut,
    ActionPlanCreate, ActionPlanOut, ActionPlanSummary,
)
from app.routers.websocket import ws_manager

router = APIRouter(prefix="/api/v1", tags=["stairs"])


# ─── STAIRS CRUD ───

@router.get("/stairs", response_model=List[StairOut])
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


@router.post("/stairs", response_model=StairOut, status_code=201)
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
                priority, tags, metadata, status, health, progress_percent, confidence_percent, created_by, strategy_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'active',$22,0,50,$23,$24)
        """, stair_id, auth.org_id, code, stair.title, stair.title_ar, stair.description, stair.description_ar,
            stair.element_type, str(stair.framework_id) if stair.framework_id else None,
            str(stair.parent_id) if stair.parent_id else None, level, auth.user_id,
            str(stair.team_id) if stair.team_id else None,
            stair.start_date, stair.end_date, stair.target_value, stair.current_value, stair.unit,
            stair.priority or "medium", stair.tags, json.dumps(stair.metadata) if stair.metadata else "{}",
            health_val, auth.user_id, str(stair.strategy_id) if stair.strategy_id else None)
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


@router.get("/stairs/tree", response_model=List[StairTree])
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


@router.get("/stairs/{stair_id}", response_model=StairOut)
async def get_stair(stair_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""SELECT s.*, (SELECT COUNT(*) FROM stairs c WHERE c.parent_id = s.id AND c.deleted_at IS NULL) as children_count,
            u.full_name as owner_name FROM stairs s LEFT JOIN users u ON s.owner_id = u.id
            WHERE s.id = $1 AND s.organization_id = $2 AND s.deleted_at IS NULL""", stair_id, auth.org_id)
        if not row: raise HTTPException(404, "Stair not found")
        return row_to_dict(row)


@router.put("/stairs/{stair_id}", response_model=StairOut)
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


@router.delete("/stairs/{stair_id}")
async def delete_stair(stair_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("UPDATE stairs SET deleted_at = NOW() WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL", stair_id, auth.org_id)
        if result == "UPDATE 0": raise HTTPException(404, "Stair not found")
        await ws_manager.broadcast_to_org(auth.org_id, {"event": "stair_deleted", "data": {"id": stair_id}})
        return {"deleted": True, "id": stair_id}


@router.get("/stairs/{stair_id}/children", response_model=List[StairOut])
async def get_children(stair_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""SELECT s.*, (SELECT COUNT(*) FROM stairs c WHERE c.parent_id = s.id AND c.deleted_at IS NULL) as children_count,
            u.full_name as owner_name FROM stairs s LEFT JOIN users u ON s.owner_id = u.id
            WHERE s.parent_id = $1 AND s.organization_id = $2 AND s.deleted_at IS NULL ORDER BY s.sort_order, s.created_at""", stair_id, auth.org_id)
        return rows_to_dicts(rows)


@router.get("/stairs/{stair_id}/ancestors", response_model=List[StairOut])
async def get_ancestors(stair_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""SELECT s.*, (SELECT COUNT(*) FROM stairs c WHERE c.parent_id = s.id AND c.deleted_at IS NULL) as children_count,
            u.full_name as owner_name FROM stairs s LEFT JOIN users u ON s.owner_id = u.id
            JOIN stair_closure sc ON sc.ancestor_id = s.id WHERE sc.descendant_id = $1 AND sc.depth > 0 AND s.organization_id = $2
            ORDER BY sc.depth DESC""", stair_id, auth.org_id)
        return rows_to_dicts(rows)


# ─── PROGRESS TRACKING ───

@router.post("/stairs/{stair_id}/progress", response_model=ProgressOut, status_code=201)
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


@router.get("/stairs/{stair_id}/history", response_model=List[ProgressOut])
async def get_progress_history(stair_id: str, limit: int = 30, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""SELECT p.* FROM stair_progress p JOIN stairs s ON s.id = p.stair_id
            WHERE p.stair_id = $1 AND s.organization_id = $2 ORDER BY p.snapshot_date DESC LIMIT $3""", stair_id, auth.org_id, limit)
        return rows_to_dicts(rows)


# ─── RELATIONSHIPS ───

@router.get("/stairs/{stair_id}/relationships", response_model=List[RelationshipOut])
async def get_relationships(stair_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        return rows_to_dicts(await conn.fetch("SELECT * FROM stair_relationships WHERE source_stair_id = $1 OR target_stair_id = $1", stair_id))


@router.post("/relationships", response_model=RelationshipOut, status_code=201)
async def create_relationship(rel: RelationshipCreate, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rel_id = str(uuid.uuid4())
        await conn.execute("""INSERT INTO stair_relationships (id, source_stair_id, target_stair_id, relationship_type, strength, description)
            VALUES ($1,$2,$3,$4,$5,$6)""", rel_id, str(rel.source_stair_id), str(rel.target_stair_id), rel.relationship_type, rel.strength, rel.description)
        return row_to_dict(await conn.fetchrow("SELECT * FROM stair_relationships WHERE id = $1", rel_id))


# ─── KPIs ───

@router.post("/stairs/{stair_id}/kpi", response_model=KPIMeasurementOut, status_code=201)
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


@router.get("/stairs/{stair_id}/kpi", response_model=List[KPIMeasurementOut])
async def get_kpi(stair_id: str, limit: int = 50, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        return rows_to_dicts(await conn.fetch("""SELECT m.* FROM kpi_measurements m JOIN stairs s ON s.id = m.stair_id
            WHERE m.stair_id = $1 AND s.organization_id = $2 ORDER BY m.measured_at DESC LIMIT $3""", stair_id, auth.org_id, limit))


@router.get("/kpis/summary")
async def kpi_summary(auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        return rows_to_dicts(await conn.fetch("""SELECT s.id, s.code, s.title, s.title_ar, s.target_value, s.current_value,
            s.unit, s.health, s.progress_percent, s.measurement_direction,
            (SELECT value FROM kpi_measurements km WHERE km.stair_id = s.id ORDER BY measured_at DESC LIMIT 1) as latest_value,
            (SELECT measured_at FROM kpi_measurements km WHERE km.stair_id = s.id ORDER BY measured_at DESC LIMIT 1) as latest_at,
            (SELECT COUNT(*) FROM kpi_measurements km WHERE km.stair_id = s.id) as measurement_count
            FROM stairs s WHERE s.organization_id = $1 AND s.element_type IN ('kpi','key_result','measure') AND s.deleted_at IS NULL ORDER BY s.code""", auth.org_id))


# ─── ACTION PLANS ───

@router.post("/stairs/{stair_id}/action-plans", response_model=ActionPlanOut, status_code=201)
async def save_action_plan(stair_id: str, plan: ActionPlanCreate, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        stair = await conn.fetchrow("SELECT id FROM stairs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL", stair_id, auth.org_id)
        if not stair: raise HTTPException(404, "Stair not found")
        plan_id = str(uuid.uuid4())
        await conn.execute("""INSERT INTO action_plans (id, stair_id, organization_id, plan_type, raw_text, tasks, feedback, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)""",
            plan_id, stair_id, auth.org_id, plan.plan_type, plan.raw_text,
            json.dumps(plan.tasks) if plan.tasks else "[]",
            json.dumps(plan.feedback) if plan.feedback else None,
            auth.user_id)
        row = await conn.fetchrow("SELECT * FROM action_plans WHERE id = $1", plan_id)
        return row_to_dict(row)


@router.patch("/action-plans/{plan_id}/tasks", response_model=ActionPlanOut)
async def update_action_plan_tasks(plan_id: str, body: dict, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM action_plans WHERE id = $1 AND organization_id = $2",
            plan_id, auth.org_id)
        if not row:
            raise HTTPException(404, "Action plan not found")
        tasks = body.get("tasks", [])
        await conn.execute(
            "UPDATE action_plans SET tasks = $1 WHERE id = $2",
            json.dumps(tasks), plan_id)
        updated = await conn.fetchrow("SELECT * FROM action_plans WHERE id = $1", plan_id)
        return row_to_dict(updated)


@router.get("/stairs/{stair_id}/action-plans", response_model=List[ActionPlanOut])
async def get_stair_action_plans(stair_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""SELECT ap.* FROM action_plans ap JOIN stairs s ON s.id = ap.stair_id
            WHERE ap.stair_id = $1 AND s.organization_id = $2 AND s.deleted_at IS NULL
            ORDER BY ap.created_at DESC""", stair_id, auth.org_id)
        return rows_to_dicts(rows)


@router.get("/strategies/{strategy_id}/action-plans")
async def get_strategy_action_plans(strategy_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT ap.*, s.title as stair_title, s.title_ar as stair_title_ar,
                   s.code as stair_code, s.element_type as stair_element_type
            FROM action_plans ap
            JOIN stairs s ON s.id = ap.stair_id
            WHERE s.strategy_id = $1 AND s.organization_id = $2 AND s.deleted_at IS NULL
            ORDER BY s.level, s.sort_order, ap.created_at DESC
        """, strategy_id, auth.org_id)
        plans_by_stair = {}
        for r in rows:
            d = row_to_dict(r)
            sid = str(d["stair_id"])
            if sid not in plans_by_stair:
                tasks_rec = []
                tasks_cust = []
                plans_by_stair[sid] = {
                    "stair_id": sid,
                    "stair_title": d.get("stair_title", ""),
                    "stair_title_ar": d.get("stair_title_ar"),
                    "stair_code": d.get("stair_code"),
                    "element_type": d.get("stair_element_type", ""),
                    "has_recommended": False,
                    "has_customized": False,
                    "latest_recommended_at": None,
                    "latest_customized_at": None,
                    "recommended_task_count": 0,
                    "customized_task_count": 0,
                    "recommended_completed": 0,
                    "customized_completed": 0,
                    "plans": [],
                }
            plan_out = {
                "id": d["id"], "stair_id": d["stair_id"], "organization_id": d["organization_id"],
                "plan_type": d["plan_type"], "raw_text": d["raw_text"],
                "tasks": d.get("tasks", []), "feedback": d.get("feedback"),
                "created_by": d.get("created_by"), "created_at": d.get("created_at"),
            }
            entry = plans_by_stair[sid]
            entry["plans"].append(plan_out)
            plan_tasks = d.get("tasks") or []
            if d["plan_type"] == "recommended":
                if not entry["has_recommended"]:
                    entry["has_recommended"] = True
                    entry["latest_recommended_at"] = d.get("created_at")
                    entry["recommended_task_count"] = len(plan_tasks)
                    entry["recommended_completed"] = sum(1 for t in plan_tasks if t.get("done"))
            elif d["plan_type"] == "customized":
                if not entry["has_customized"]:
                    entry["has_customized"] = True
                    entry["latest_customized_at"] = d.get("created_at")
                    entry["customized_task_count"] = len(plan_tasks)
                    entry["customized_completed"] = sum(1 for t in plan_tasks if t.get("done"))
        return list(plans_by_stair.values())
