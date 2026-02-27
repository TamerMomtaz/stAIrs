"""Stairs — Dashboard, Alerts, Teams, Export, Onboarding Routers"""

import uuid
from datetime import datetime, date
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import Response

from app.db.connection import get_pool
from app.helpers import (
    row_to_dict, rows_to_dicts, generate_code,
    get_auth, AuthContext,
)
from app.models.schemas import (
    AlertOut, AlertUpdate, ExecutiveDashboard,
    FrameworkOut, TeamCreate, TeamOut,
)

router = APIRouter(prefix="/api/v1", tags=["dashboard"])


# ─── DASHBOARD ───

@router.get("/dashboard", response_model=ExecutiveDashboard)
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


# ─── ALERTS ───

@router.get("/alerts", response_model=List[AlertOut])
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


@router.put("/alerts/{alert_id}", response_model=AlertOut)
async def update_alert(alert_id: str, update: AlertUpdate, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("UPDATE ai_alerts SET status=$1, acknowledged_by=$2, acknowledged_at=NOW() WHERE id=$3 AND organization_id=$4",
            update.status, auth.user_id, alert_id, auth.org_id)
        row = await conn.fetchrow("SELECT * FROM ai_alerts WHERE id = $1", alert_id)
        if not row: raise HTTPException(404, "Alert not found")
        return row_to_dict(row)


# ─── FRAMEWORKS ───

@router.get("/frameworks", response_model=List[FrameworkOut])
async def list_frameworks():
    pool = await get_pool()
    async with pool.acquire() as conn:
        return rows_to_dicts(await conn.fetch("SELECT * FROM frameworks WHERE is_active = true ORDER BY code"))


# ─── TEAMS ───

@router.get("/teams", response_model=List[TeamOut])
async def list_teams(auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        return rows_to_dicts(await conn.fetch("""SELECT t.*, (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count
            FROM teams t WHERE t.organization_id = $1 ORDER BY t.name""", auth.org_id))


@router.post("/teams", response_model=TeamOut, status_code=201)
async def create_team(team: TeamCreate, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        team_id = str(uuid.uuid4())
        await conn.execute("INSERT INTO teams (id, organization_id, name, description, parent_team_id) VALUES ($1,$2,$3,$4,$5)",
            team_id, auth.org_id, team.name, team.description, team.parent_team_id if team.parent_team_id else None)
        return row_to_dict(await conn.fetchrow("SELECT t.*, 0 as member_count FROM teams t WHERE t.id = $1", team_id))


@router.delete("/teams/{team_id}")
async def delete_team(team_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM team_members WHERE team_id = $1", team_id)
        await conn.execute("DELETE FROM teams WHERE id = $1 AND organization_id = $2", team_id, auth.org_id)
        return {"deleted": True}


# ─── EXPORT ───

@router.get("/export/csv")
async def export_csv(auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""SELECT code, title, title_ar, element_type, status, health,
            progress_percent, confidence_percent, target_value, current_value, unit, priority, start_date, end_date, ai_risk_score
            FROM stairs WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY level, sort_order """, auth.org_id)
        header = "Code,Title,Title_AR,Type,Status,Health,Progress%,Confidence%,Target,Current,Unit,Priority,Start,End,AI_Risk\n"
        lines = [",".join(f'"{r[c] or ""}"' for c in ["code","title","title_ar","element_type","status","health","progress_percent","confidence_percent","target_value","current_value","unit","priority","start_date","end_date","ai_risk_score"]) for r in rows]
        return Response(content=header+"\n".join(lines), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=stairs_{date.today()}.csv"})


# ─── ONBOARDING ───

@router.post("/onboarding/quickstart")
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
