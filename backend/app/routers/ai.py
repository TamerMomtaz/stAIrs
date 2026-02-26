"""ST.AIRS — AI Engine Router (with multi-provider fallback)"""

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, HTTPException, Depends
import httpx

from app.db.connection import get_pool
from app.helpers import (
    row_to_dict, rows_to_dicts, generate_code,
    get_auth, AuthContext,
    ANTHROPIC_API_KEY, CLAUDE_MODEL,
)
from app.models.schemas import (
    AIChatRequest, AIChatResponse, AIGenerateRequest,
    QuestionnaireGenerateRequest, QuestionnaireGenerateResponse,
)
from app.routers.websocket import ws_manager
from app.routers.sources import log_source
from app.ai_providers import (
    call_ai_with_fallback, PROVIDER_DISPLAY, get_ai_status,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])

AI_RETRY_MAX = 3
AI_RETRY_DELAY = 5  # seconds


async def _log_ai_usage(
    provider: str,
    success: bool,
    response_time_ms: int = 0,
    tokens_used: int = 0,
    status_code: int = 0,
    fallback_used: bool = False,
    fallback_from: str = None,
    error_message: str = None,
):
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            table_exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_usage_logs')"
            )
            if table_exists:
                await conn.execute(
                    "INSERT INTO ai_usage_logs (id, provider, success, response_time_ms, tokens_used, "
                    "status_code, fallback_used, fallback_from, error_message) "
                    "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
                    str(uuid.uuid4()), provider, success, response_time_ms, tokens_used,
                    status_code, fallback_used, fallback_from, error_message,
                )
    except Exception as e:
        logger.warning("Failed to log AI usage: %s", e)


async def call_claude(messages: list, system: str = None, max_tokens: int = 1024) -> dict:
    """Wrapper that uses the multi-provider fallback system but returns
    the same dict shape the rest of the codebase expects."""
    result = await call_ai_with_fallback(
        messages=messages,
        system=system,
        max_tokens=max_tokens,
        log_callback=_log_ai_usage,
    )
    # Convert fallback result to the legacy format expected by existing endpoints
    provider = result.get("provider", "none")
    model_name = PROVIDER_DISPLAY.get(provider, provider)
    return {
        "content": [{"type": "text", "text": result["text"]}],
        "usage": {"input_tokens": 0, "output_tokens": result.get("tokens", 0)},
        "_provider": provider,
        "_provider_display": model_name,
        "_fallback_used": result.get("fallback_used", False),
    }


@router.get("/provider")
async def get_active_provider(auth: AuthContext = Depends(get_auth)):
    """Returns the currently active AI provider for the frontend indicator."""
    status = get_ai_status()
    return {
        "provider": status["active_provider"],
        "provider_display": status["active_provider_display"],
    }


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
    # Include approved AI extractions from documents (Source of Truth)
    if req.context_stair_id:
        async with pool.acquire() as conn:
            stair_row = await conn.fetchrow(
                "SELECT strategy_id FROM stairs WHERE id = $1", str(req.context_stair_id)
            )
            if stair_row and stair_row.get("strategy_id"):
                extraction_rows = await conn.fetch(
                    "SELECT content, metadata FROM strategy_sources "
                    "WHERE strategy_id = $1 AND source_type = 'ai_extraction' "
                    "ORDER BY created_at DESC LIMIT 50",
                    str(stair_row["strategy_id"]),
                )
                if extraction_rows:
                    context_parts.append("\nAPPROVED DOCUMENT EXTRACTIONS (verified data from uploaded documents):")
                    for er in extraction_rows:
                        er_meta = er["metadata"] if isinstance(er["metadata"], dict) else json.loads(er["metadata"] or "{}")
                        cat = er_meta.get("category", "General")
                        fname = er_meta.get("parent_filename", "")
                        src_label = f" (from: {fname})" if fname else ""
                        context_parts.append(f"  [{cat}]{src_label}: {er['content'][:300]}")
    messages = [{"role": "user", "content": f"CONTEXT:\n{chr(10).join(context_parts)}\n\nUSER QUESTION:\n{req.message}"}]
    result = await call_claude(messages)
    text = result["content"][0]["text"] if result.get("content") else "No response generated"
    provider = result.get("_provider", "claude")
    provider_display = result.get("_provider_display", "Claude")
    model_used = provider_display
    conv_id = str(req.conversation_id) if req.conversation_id else str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute("""INSERT INTO ai_conversations (id, organization_id, user_id, context_type, context_stair_id, title)
            VALUES ($1,$2,$3,'chat',$4,$5) ON CONFLICT (id) DO NOTHING""",
            conv_id, auth.org_id, auth.user_id, str(req.context_stair_id) if req.context_stair_id else None, req.message[:100])
        total_tokens = result.get("usage", {}).get("input_tokens", 0) + result.get("usage", {}).get("output_tokens", 0)
        await conn.execute("INSERT INTO ai_messages (id, conversation_id, role, content, tokens_used, model_used) VALUES ($1,$2,'user',$3,0,$4)",
            str(uuid.uuid4()), conv_id, req.message, model_used)
        await conn.execute("INSERT INTO ai_messages (id, conversation_id, role, content, tokens_used, model_used) VALUES ($1,$2,'assistant',$3,$4,$5)",
            str(uuid.uuid4()), conv_id, text, total_tokens, model_used)
    # Auto-log to Source of Truth
    try:
        strategy_id = None
        if req.context_stair_id:
            async with pool.acquire() as conn:
                stair_row = await conn.fetchrow(
                    "SELECT strategy_id FROM stairs WHERE id = $1", str(req.context_stair_id)
                )
                if stair_row and stair_row["strategy_id"]:
                    strategy_id = str(stair_row["strategy_id"])
        if strategy_id:
            await log_source(
                strategy_id=strategy_id,
                source_type="ai_chat",
                content=f"Q: {req.message[:500]}\n\nA: {text[:1000]}",
                metadata={
                    "conversation_id": conv_id,
                    "context_stair_id": str(req.context_stair_id) if req.context_stair_id else None,
                    "tokens_used": total_tokens,
                    "provider": provider,
                    "context": "ai_advisor",
                },
                user_id=auth.user_id,
            )
    except Exception:
        pass

    return {"response": text, "conversation_id": conv_id, "actions": [], "tokens_used": total_tokens,
            "provider": provider, "provider_display": provider_display}


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

    # Auto-log analysis to Source of Truth
    try:
        strategy_id_val = stair.get("strategy_id") if isinstance(stair, dict) else stair["strategy_id"]
        if strategy_id_val:
            await log_source(
                strategy_id=str(strategy_id_val),
                source_type="ai_chat",
                content=f"AI Risk Analysis for '{stair['title']}': Risk score {analysis.get('risk_score', 'N/A')}, {analysis.get('summary', '')[:500]}",
                metadata={
                    "context": "risk_analysis",
                    "stair_id": stair_id,
                    "stair_title": stair["title"],
                    "risk_score": analysis.get("risk_score"),
                    "risk_level": analysis.get("risk_level"),
                },
                user_id=auth.user_id,
            )
    except Exception:
        pass

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

    # Auto-log to Source of Truth — find strategy for generated elements
    try:
        if created:
            async with pool.acquire() as conn:
                stair_row = await conn.fetchrow(
                    "SELECT strategy_id FROM stairs WHERE id = $1", created[0]["id"]
                )
                if stair_row and stair_row.get("strategy_id"):
                    await log_source(
                        strategy_id=str(stair_row["strategy_id"]),
                        source_type="ai_chat",
                        content=f"AI Strategy Generation: {req.prompt[:500]}",
                        metadata={
                            "context": "strategy_generation",
                            "framework": req.framework,
                            "elements_generated": len(created),
                            "element_titles": [e["title"] for e in created[:10]],
                        },
                        user_id=auth.user_id,
                    )
    except Exception:
        pass

    return {"generated": len(created), "elements": created}


def _mock_questionnaire(strategy_type: str) -> dict:
    type_label = strategy_type.replace("_", " ").title()
    return {"groups": [
        {"name": "Current Situation", "questions": [
            {"id": "q1", "question": f"How would you rate your current {type_label.lower()} maturity?",
             "type": "scale", "explanation": "Establishes your starting point to set realistic goals",
             "options": ["1", "2", "3", "4", "5"], "conditional_on": None},
            {"id": "q2", "question": f"Do you have an existing {type_label.lower()} strategy in place?",
             "type": "yes_no", "explanation": "Helps determine whether to build from scratch or optimize",
             "options": ["Yes", "No"], "conditional_on": None},
            {"id": "q3", "question": "What's working well in your current approach?",
             "type": "short_text", "explanation": "Identifies strengths to build upon",
             "options": None, "conditional_on": {"question_id": "q2", "expected_answer": "Yes"}},
        ]},
        {"name": "Goals & Objectives", "questions": [
            {"id": "q4", "question": f"What is the primary goal of this {type_label.lower()} strategy?",
             "type": "multiple_choice", "explanation": "Focuses the strategy on your most important outcome",
             "options": ["Revenue growth", "Market share expansion", "Cost reduction", "Brand awareness", "Operational efficiency"], "conditional_on": None},
            {"id": "q5", "question": "What does success look like in 12 months?",
             "type": "short_text", "explanation": "Defines measurable outcomes for the strategy",
             "options": None, "conditional_on": None},
            {"id": "q6", "question": "What is the timeline for achieving your primary goal?",
             "type": "multiple_choice", "explanation": "Determines the urgency and pacing of initiatives",
             "options": ["3 months", "6 months", "12 months", "18+ months"], "conditional_on": None},
        ]},
        {"name": "Resources & Constraints", "questions": [
            {"id": "q7", "question": "What is your approximate budget for this initiative?",
             "type": "multiple_choice", "explanation": "Budget determines the scope and scale of the strategy",
             "options": ["Under $10K", "$10K-$50K", "$50K-$200K", "$200K-$1M", "Over $1M"], "conditional_on": None},
            {"id": "q8", "question": "How many team members will be dedicated to execution?",
             "type": "multiple_choice", "explanation": "Team capacity impacts what initiatives are realistic",
             "options": ["1-2 people", "3-5 people", "6-10 people", "11-20 people", "20+ people"], "conditional_on": None},
            {"id": "q9", "question": "What is the biggest constraint or challenge you face?",
             "type": "short_text", "explanation": "Helps the strategy account for real-world limitations",
             "options": None, "conditional_on": None},
        ]},
        {"name": "Competitive Landscape", "questions": [
            {"id": "q10", "question": "How many direct competitors do you face in this area?",
             "type": "multiple_choice", "explanation": "Competition level shapes strategic positioning",
             "options": ["None (new market)", "1-3 competitors", "4-10 competitors", "Highly fragmented market"], "conditional_on": None},
            {"id": "q11", "question": "What differentiates you from competitors?",
             "type": "short_text", "explanation": "Your unique advantages form the foundation of the strategy",
             "options": None, "conditional_on": None},
        ]},
    ]}


@router.post("/questionnaire", response_model=QuestionnaireGenerateResponse)
async def ai_generate_questionnaire(req: QuestionnaireGenerateRequest, auth: AuthContext = Depends(get_auth)):
    type_label = req.strategy_type.replace("_", " ").title()
    brief_section = f"\nCompany Brief: {req.company_brief}" if req.company_brief else ""
    industry_section = f"\nIndustry: {req.industry}" if req.industry else ""

    prompt = f"""You are an expert strategy consultant. Generate a tailored questionnaire for creating a {type_label} strategy.

Company: {req.company_name}{industry_section}{brief_section}

Generate 8-15 questions that are SPECIFIC to {type_label} strategy planning.

IMPORTANT RULES:
1. Do NOT ask about anything already stated in the company brief above — read it carefully first
2. Questions must gather information that is MISSING but essential for a {type_label} strategy
3. Mix question types: multiple_choice, short_text, yes_no, scale
4. Group questions into 3-5 logical themes with descriptive group names
5. Include 2-3 conditional questions that only apply based on a prior answer
6. Each question must have a one-line explanation of WHY it matters

Return ONLY valid JSON in this exact format:
{{
  "groups": [
    {{
      "name": "Theme Name",
      "questions": [
        {{
          "id": "q1",
          "question": "The question?",
          "type": "multiple_choice",
          "explanation": "Why this question matters for the strategy",
          "options": ["Option A", "Option B", "Option C"],
          "conditional_on": null
        }},
        {{
          "id": "q2",
          "question": "Follow-up question?",
          "type": "short_text",
          "explanation": "Why this matters",
          "options": null,
          "conditional_on": {{"question_id": "q1", "expected_answer": "Option A"}}
        }}
      ]
    }}
  ]
}}

Question type rules:
- "scale": options must be ["1", "2", "3", "4", "5"]
- "yes_no": options must be ["Yes", "No"]
- "multiple_choice": provide 3-5 specific, relevant options
- "short_text": options must be null

Use conditional_on sparingly (2-3 questions). The expected_answer must exactly match one of the parent question's options."""

    result = await call_claude([{"role": "user", "content": prompt}], max_tokens=2048)
    text = result["content"][0]["text"] if result.get("content") else "{}"

    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            questionnaire = json.loads(text[start:end])
        else:
            questionnaire = _mock_questionnaire(req.strategy_type)
    except Exception:
        questionnaire = _mock_questionnaire(req.strategy_type)

    # Auto-log questionnaire generation to Source of Truth
    # Note: strategy_id may not exist yet during wizard; frontend will log answers with strategy_id later
    try:
        question_count = sum(len(g.get("questions", [])) if isinstance(g, dict) else len(g.questions) for g in (questionnaire.get("groups", []) if isinstance(questionnaire, dict) else questionnaire["groups"]))
        await log_source(
            strategy_id="00000000-0000-0000-0000-000000000000",  # placeholder, frontend re-logs with actual ID
            source_type="questionnaire",
            content=f"Questionnaire generated for {req.company_name} ({req.strategy_type}): {question_count} questions",
            metadata={
                "context": "questionnaire_generation",
                "company_name": req.company_name,
                "strategy_type": req.strategy_type,
                "industry": req.industry,
                "question_count": question_count,
            },
            user_id=auth.user_id,
        )
    except Exception:
        pass

    return questionnaire
