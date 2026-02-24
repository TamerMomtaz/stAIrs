"""ST.AIRS — AI Engine Router"""

import json
import uuid

from fastapi import APIRouter, HTTPException, Depends
import httpx

from app.db.connection import get_pool
from app.helpers import (
    row_to_dict, rows_to_dicts, generate_code,
    get_auth, AuthContext,
    ANTHROPIC_API_KEY, CLAUDE_MODEL,
)
from app.models.schemas import AIChatRequest, AIChatResponse, AIGenerateRequest
from app.routers.websocket import ws_manager

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


async def call_claude(messages: list, system: str = None, max_tokens: int = 1024) -> dict:
    if system is None:
        from app.main import _knowledge_cache, _build_basic_system_prompt
        system = _knowledge_cache.get("system_prompt") or _build_basic_system_prompt()
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


@router.post("/chat", response_model=AIChatResponse)
async def ai_chat(req: AIChatRequest, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    context_parts = []
    async with pool.acquire() as conn:
        org = await conn.fetchrow("SELECT * FROM organizations WHERE id = $1", auth.org_id)
        if org:
            context_parts.append(f"Organization: {org['name']}" +
                                 (f" (Industry: {org['industry']})" if org.get('industry') else ""))
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


@router.post("/analyze/{stair_id}")
async def ai_analyze(stair_id: str, auth: AuthContext = Depends(get_auth)):
    from app.main import _knowledge_cache
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
Check for these failure patterns: {', '.join(p['name'] for p in _knowledge_cache.get('failure_patterns', [])[:6])}
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


@router.post("/generate")
async def ai_generate_strategy(req: AIGenerateRequest, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        org = await conn.fetchrow("SELECT * FROM organizations WHERE id = $1", auth.org_id)
    org_name = org["name"] if org else "Organization"
    industry = org["industry"] if org and org.get("industry") else "General"
    prompt = f"""Generate a {req.framework.upper()} strategy for: {org_name} (Industry: {industry})
User request: {req.prompt}
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
