"""Stairs — AI Engine Router (with multi-agent ensemble + multi-provider fallback)"""

import asyncio
import json
import logging
import uuid

from typing import List

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
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
    PrefillQuestionnaireRequest,
    ActionPlanGenerateRequest, CustomizedPlanRequest,
    ExplainActionRequest, ImplementationGuideRequest, AgentResponse,
    AgentInfo, ValidationInfo,
)
from app.routers.websocket import ws_manager
from app.routers.sources import log_source
from app.ai_providers import (
    call_ai_with_fallback, PROVIDER_DISPLAY, get_ai_status,
)
from app.agents.orchestrator import Orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])

AI_RETRY_MAX = 3
AI_RETRY_DELAY = 5  # seconds

# Module-level orchestrator instance
_orchestrator = Orchestrator()

# Agent display names and roles for transparency
AGENT_DISPLAY = {
    "strategy_advisor": {"name": "Strategy Advisor", "role": "Analyzes strategy and provides recommendations"},
    "strategy_analyst": {"name": "Strategy Analyst", "role": "Performs framework analysis and strategic evaluations"},
    "document_analyst": {"name": "Document Analyst", "role": "Analyzes uploaded documents and extracts insights"},
    "execution_planner": {"name": "Execution Planner", "role": "Creates action plans and implementation guides"},
    "validation": {"name": "Validation Agent", "role": "Reviews outputs for accuracy and consistency"},
}


def _build_agents_used(agent_chain: list) -> list:
    """Build a list of AgentInfo from an agent_chain."""
    agents = []
    for agent_key in (agent_chain or []):
        info = AGENT_DISPLAY.get(agent_key, {"name": agent_key, "role": None})
        agents.append(AgentInfo(name=info["name"], role=info.get("role")))
    return agents


def _build_validation_info(validation: dict) -> ValidationInfo | None:
    """Build ValidationInfo from orchestrator validation result."""
    if not validation:
        return None
    return ValidationInfo(
        confidence_score=validation.get("confidence_score"),
        validated=validation.get("validated"),
        warnings=validation.get("warnings", []),
        contradictions=validation.get("contradictions", []),
        suggestions=validation.get("suggestions", []),
    )


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
    the same dict shape the rest of the codebase expects.

    Kept for backward compatibility (used by sources.py and other routers).
    New code should use the orchestrator instead."""
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
    sources_used = []

    # Resolve strategy_id FIRST so we can filter all queries by it
    strategy_id = str(req.strategy_id) if req.strategy_id else None
    if not strategy_id and req.context_stair_id:
        async with pool.acquire() as conn:
            stair_row = await conn.fetchrow(
                "SELECT strategy_id FROM stairs WHERE id = $1", str(req.context_stair_id)
            )
            if stair_row and stair_row.get("strategy_id"):
                strategy_id = str(stair_row["strategy_id"])

    # Build context from strategy, stairs, and Source of Truth
    strategy_company = None
    strategy_industry = None
    strategy_name = None
    async with pool.acquire() as conn:
        if strategy_id:
            strat_row = await conn.fetchrow(
                "SELECT name, company, industry FROM strategies WHERE id = $1",
                strategy_id,
            )
            if strat_row:
                strategy_name = strat_row.get("name")
                strategy_company = strat_row.get("company")
                strategy_industry = strat_row.get("industry")

        if strategy_company:
            context_parts.append(
                f"You are analyzing the strategy for {strategy_company}"
                + (f" in the {strategy_industry} sector." if strategy_industry else ".")
            )
            context_parts.append(
                "IMPORTANT: The company you are advising is "
                + f"{strategy_company}. Do NOT use any other company name, "
                + "even if uploaded documents mention other companies."
            )
            if strategy_name:
                context_parts.append(f"Strategy: {strategy_name}")
        else:
            org = await conn.fetchrow("SELECT * FROM organizations WHERE id = $1", auth.org_id)
            if org:
                context_parts.append(f"Organization: {org['name']}" +
                                     (f" (Industry: {org['industry']})" if org.get('industry') else ""))
        if strategy_id:
            stairs = await conn.fetch("""SELECT code, title, element_type, health, progress_percent, status
                FROM stairs WHERE organization_id = $1 AND strategy_id = $2 AND deleted_at IS NULL ORDER BY level, sort_order LIMIT 30""", auth.org_id, strategy_id)
        else:
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

    # Include approved AI extractions grouped by category (Source of Truth)
    if strategy_id:
        async with pool.acquire() as conn:
            extraction_rows = await conn.fetch(
                "SELECT content, metadata FROM strategy_sources "
                "WHERE strategy_id = $1 AND source_type = 'ai_extraction' "
                "ORDER BY created_at DESC LIMIT 100",
                strategy_id,
            )
            if extraction_rows:
                by_category = {}
                file_sources = {}
                for er in extraction_rows:
                    er_meta = er["metadata"] if isinstance(er["metadata"], dict) else json.loads(er["metadata"] or "{}")
                    cat = er_meta.get("category", "General")
                    fname = er_meta.get("parent_filename", "")
                    if cat not in by_category:
                        by_category[cat] = []
                    by_category[cat].append({"text": er["content"][:500], "filename": fname})
                    if fname:
                        if fname not in file_sources:
                            file_sources[fname] = set()
                        file_sources[fname].add(cat)

                context_parts.append("\n=== Verified Strategy Data from Uploaded Documents ===")
                context_parts.append(
                    "IMPORTANT: When your answer uses data from these documents, "
                    "cite the source document name in parentheses, e.g. (Source: filename.pdf)."
                )
                category_order = [
                    "Financial Data", "Market Position", "Team & Resources",
                    "Competitors", "Business Model", "Customers",
                    "Risks", "Opportunities",
                ]
                all_cats = list(dict.fromkeys(category_order + list(by_category.keys())))
                for cat in all_cats:
                    if cat in by_category:
                        context_parts.append(f"\n## {cat}")
                        for item in by_category[cat]:
                            src = f" [from: {item['filename']}]" if item["filename"] else ""
                            context_parts.append(f"  - {item['text']}{src}")
                context_parts.append("\n=== End of Verified Strategy Data ===")

                sources_used = [
                    {"filename": fn, "categories": sorted(cats)}
                    for fn, cats in file_sources.items()
                ]

    # Build pre-built strategy context for the orchestrator (avoids duplicate DB queries)
    strategy_context = {
        "strategy_id": strategy_id,
        "company": strategy_company or "",
        "industry": strategy_industry or "",
        "strategy_name": strategy_name or "",
        "source_of_truth": "",  # SoT is already in context_parts
        "previous_outputs": [],
    }

    # Route through Orchestrator → Advisor Agent (may chain to Strategy Agent)
    agent_result = await _orchestrator.process(
        task_type="chat",
        strategy_id=strategy_id,
        payload={"message": req.message, "context_parts": context_parts},
        strategy_context=strategy_context,
    )

    text = agent_result.get("text", "No response generated")
    tokens = agent_result.get("tokens", 0)
    provider = agent_result.get("provider", "claude")
    provider_display = agent_result.get("provider_display", "Claude")

    # Check which sources were actually cited in the response
    for src in sources_used:
        src["cited"] = src["filename"].lower() in text.lower() if src.get("filename") else False

    model_used = provider_display
    conv_id = str(req.conversation_id) if req.conversation_id else str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute("""INSERT INTO ai_conversations (id, organization_id, user_id, context_type, context_stair_id, title)
            VALUES ($1,$2,$3,'chat',$4,$5) ON CONFLICT (id) DO NOTHING""",
            conv_id, auth.org_id, auth.user_id, str(req.context_stair_id) if req.context_stair_id else None, req.message[:100])
        total_tokens = tokens
        await conn.execute("INSERT INTO ai_messages (id, conversation_id, role, content, tokens_used, model_used) VALUES ($1,$2,'user',$3,0,$4)",
            str(uuid.uuid4()), conv_id, req.message, model_used)
        await conn.execute("INSERT INTO ai_messages (id, conversation_id, role, content, tokens_used, model_used) VALUES ($1,$2,'assistant',$3,$4,$5)",
            str(uuid.uuid4()), conv_id, text, total_tokens, model_used)
    # Auto-log to Source of Truth (reuse already-resolved strategy_id)
    try:
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
                    "sources_used": [s["filename"] for s in sources_used] if sources_used else [],
                    "agent_chain": agent_result.get("agent_chain", []),
                },
                user_id=auth.user_id,
            )
    except Exception:
        pass

    agent_chain = agent_result.get("agent_chain", [])
    validation_data = agent_result.get("validation")

    return {"response": text, "conversation_id": conv_id, "actions": [], "tokens_used": total_tokens,
            "provider": provider, "provider_display": provider_display,
            "sources_used": sources_used if sources_used else None,
            "agents_used": [ai.model_dump() for ai in _build_agents_used(agent_chain)],
            "validation": _build_validation_info(validation_data).model_dump() if validation_data else None}


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
    # Route through Orchestrator → Strategy Agent
    agent_result = await _orchestrator.process(
        task_type="questionnaire",
        payload={
            "company_name": req.company_name,
            "company_brief": req.company_brief,
            "industry": req.industry,
            "strategy_type": req.strategy_type,
        },
    )

    text = agent_result.get("text", "{}")

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
    try:
        question_count = sum(len(g.get("questions", [])) if isinstance(g, dict) else len(g.questions) for g in (questionnaire.get("groups", []) if isinstance(questionnaire, dict) else questionnaire["groups"]))
        await log_source(
            strategy_id="00000000-0000-0000-0000-000000000000",
            source_type="questionnaire",
            content=f"Questionnaire generated for {req.company_name} ({req.strategy_type}): {question_count} questions",
            metadata={
                "context": "questionnaire_generation",
                "company_name": req.company_name,
                "strategy_type": req.strategy_type,
                "industry": req.industry,
                "question_count": question_count,
                "agent_chain": agent_result.get("agent_chain", []),
            },
            user_id=auth.user_id,
        )
    except Exception:
        pass

    return questionnaire


@router.post("/extract-document-text")
async def extract_document_text(
    files: List[UploadFile] = File(...),
    auth: AuthContext = Depends(get_auth),
):
    """Extract text from uploaded files without storing them. Used by the strategy wizard."""
    from app.extraction import extract_text, clean_extracted_text, assess_extraction_quality
    from app.storage import ALLOWED_EXTENSIONS, MAX_FILE_SIZE

    documents = []
    for file in files:
        fname = file.filename or "untitled"
        ext = ""
        if "." in fname:
            ext = "." + fname.rsplit(".", 1)[-1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            documents.append({"filename": fname, "text": "", "extraction_quality": "failed", "error": f"Unsupported file type '{ext}'"})
            continue

        file_bytes = await file.read()
        if len(file_bytes) > MAX_FILE_SIZE:
            documents.append({"filename": fname, "text": "", "extraction_quality": "failed", "error": "File too large (max 10MB)"})
            continue

        content_type = file.content_type or "application/octet-stream"
        try:
            extracted_text, extra_meta = extract_text(file_bytes, fname, content_type)
            if extracted_text:
                cleaned = clean_extracted_text(extracted_text)
                quality = assess_extraction_quality(cleaned)
                documents.append({"filename": fname, "text": cleaned, "extraction_quality": quality})
            else:
                documents.append({"filename": fname, "text": "", "extraction_quality": "failed"})
        except Exception as e:
            logger.warning("Text extraction failed for %s: %s", fname, e)
            documents.append({"filename": fname, "text": "", "extraction_quality": "failed"})

    return {"documents": documents}


@router.post("/prefill-questionnaire")
async def prefill_questionnaire(
    req: PrefillQuestionnaireRequest,
    auth: AuthContext = Depends(get_auth),
):
    """Use AI to pre-fill questionnaire answers from uploaded document text."""
    # Build the questions section from groups
    questions_section = []
    for group in req.groups:
        group_name = group.get("name", "") if isinstance(group, dict) else group.name
        questions = group.get("questions", []) if isinstance(group, dict) else group.questions
        for q in questions:
            qid = q.get("id", "") if isinstance(q, dict) else q.id
            qtext = q.get("question", "") if isinstance(q, dict) else q.question
            qtype = q.get("type", "short_text") if isinstance(q, dict) else q.type
            qopts = q.get("options") if isinstance(q, dict) else q.options
            qexpl = q.get("explanation", "") if isinstance(q, dict) else q.explanation

            q_line = f"  {qid}: {qtext} (type: {qtype})"
            if qopts:
                q_line += f"\n    Options: {qopts}"
            if qexpl:
                q_line += f"\n    Context: {qexpl}"
            questions_section.append(q_line)

    # Route through Orchestrator → Document Agent + Advisor Agent
    agent_result = await _orchestrator.process(
        task_type="prefill_questionnaire",
        payload={
            "company_name": req.company_name,
            "company_brief": req.company_brief,
            "industry": req.industry,
            "strategy_type": req.strategy_type,
            "document_text": req.document_text,
            "questions_section": chr(10).join(questions_section),
        },
    )

    text = agent_result.get("text", "{}")

    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            parsed = json.loads(text[start:end])
        else:
            parsed = {"answers": {}}
    except Exception:
        parsed = {"answers": {}}

    answers = parsed.get("answers", {})
    # Ensure all values are strings
    clean_answers = {}
    for k, v in answers.items():
        if v is not None and str(v).strip():
            clean_answers[k] = str(v)

    return {"answers": clean_answers}


# ─── NEW AGENT ENDPOINTS ───

@router.post("/action-plan", response_model=AgentResponse)
async def ai_action_plan(req: ActionPlanGenerateRequest, auth: AuthContext = Depends(get_auth)):
    """Generate an action plan for a strategy stair element."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        stair = await conn.fetchrow(
            "SELECT * FROM stairs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL",
            str(req.stair_id), auth.org_id,
        )
        if not stair:
            raise HTTPException(404, "Stair not found")

    strategy_id = str(req.strategy_id) if req.strategy_id else (str(stair["strategy_id"]) if stair.get("strategy_id") else None)

    stair_context = (
        f"Element: {stair['title']} ({stair['element_type']})\n"
        f"Description: {stair['description'] or 'No description'}\n"
        f"Status: {stair['status']}, Health: {stair['health']}, Progress: {stair['progress_percent']}%\n"
        f"Target: {stair['target_value']} {stair['unit'] or ''}, Current: {stair['current_value']}\n"
        f"Start: {stair['start_date']}, End: {stair['end_date']}\n"
        f"Priority: {stair['priority']}"
    )

    agent_result = await _orchestrator.process(
        task_type="action_plan",
        strategy_id=strategy_id,
        payload={"stair_context": stair_context},
    )

    validation = agent_result.get("validation", {})
    agent_chain = agent_result.get("agent_chain", [])
    return {
        "response": agent_result.get("text", ""),
        "tokens_used": agent_result.get("tokens", 0),
        "provider": agent_result.get("provider"),
        "provider_display": agent_result.get("provider_display"),
        "agent_chain": agent_chain,
        "confidence_score": validation.get("confidence_score"),
        "agents_used": [ai.model_dump() for ai in _build_agents_used(agent_chain)],
        "validation": _build_validation_info(validation).model_dump() if validation else None,
    }


@router.post("/customized-plan", response_model=AgentResponse)
async def ai_customized_plan(req: CustomizedPlanRequest, auth: AuthContext = Depends(get_auth)):
    """Customize an existing action plan based on user feedback."""
    strategy_id = str(req.strategy_id) if req.strategy_id else None

    agent_result = await _orchestrator.process(
        task_type="customized_plan",
        strategy_id=strategy_id,
        payload={"original_plan": req.original_plan, "feedback": req.feedback},
    )

    validation = agent_result.get("validation", {})
    agent_chain = agent_result.get("agent_chain", [])
    return {
        "response": agent_result.get("text", ""),
        "tokens_used": agent_result.get("tokens", 0),
        "provider": agent_result.get("provider"),
        "provider_display": agent_result.get("provider_display"),
        "agent_chain": agent_chain,
        "confidence_score": validation.get("confidence_score"),
        "agents_used": [ai.model_dump() for ai in _build_agents_used(agent_chain)],
        "validation": _build_validation_info(validation).model_dump() if validation else None,
    }


@router.post("/explain-action", response_model=AgentResponse)
async def ai_explain_action(req: ExplainActionRequest, auth: AuthContext = Depends(get_auth)):
    """Explain a strategic action in practical terms."""
    stair_context = ""
    strategy_id = str(req.strategy_id) if req.strategy_id else None

    if req.stair_id:
        pool = await get_pool()
        async with pool.acquire() as conn:
            stair = await conn.fetchrow(
                "SELECT * FROM stairs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL",
                str(req.stair_id), auth.org_id,
            )
            if stair:
                stair_context = (
                    f"Element: {stair['title']} ({stair['element_type']})\n"
                    f"Description: {stair['description'] or 'No description'}\n"
                    f"Status: {stair['status']}, Health: {stair['health']}"
                )
                if not strategy_id and stair.get("strategy_id"):
                    strategy_id = str(stair["strategy_id"])

    agent_result = await _orchestrator.process(
        task_type="explain_action",
        strategy_id=strategy_id,
        payload={"action": req.action, "stair_context": stair_context},
    )

    agent_chain = agent_result.get("agent_chain", [])
    return {
        "response": agent_result.get("text", ""),
        "tokens_used": agent_result.get("tokens", 0),
        "provider": agent_result.get("provider"),
        "provider_display": agent_result.get("provider_display"),
        "agent_chain": agent_chain,
        "confidence_score": None,
        "agents_used": [ai.model_dump() for ai in _build_agents_used(agent_chain)],
        "validation": None,
    }


@router.post("/implementation-guide", response_model=AgentResponse)
async def ai_implementation_guide(req: ImplementationGuideRequest, auth: AuthContext = Depends(get_auth)):
    """Generate a comprehensive implementation guide for a stair element."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        stair = await conn.fetchrow(
            "SELECT * FROM stairs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL",
            str(req.stair_id), auth.org_id,
        )
        if not stair:
            raise HTTPException(404, "Stair not found")

    strategy_id = str(req.strategy_id) if req.strategy_id else (str(stair["strategy_id"]) if stair.get("strategy_id") else None)

    element_context = (
        f"Element: {stair['title']} ({stair['element_type']})\n"
        f"Description: {stair['description'] or 'No description'}\n"
        f"Status: {stair['status']}, Health: {stair['health']}, Progress: {stair['progress_percent']}%\n"
        f"Target: {stair['target_value']} {stair['unit'] or ''}, Current: {stair['current_value']}\n"
        f"Start: {stair['start_date']}, End: {stair['end_date']}\n"
        f"Priority: {stair['priority']}"
    )

    agent_result = await _orchestrator.process(
        task_type="implementation_guide",
        strategy_id=strategy_id,
        payload={"element_context": element_context},
    )

    validation = agent_result.get("validation", {})
    agent_chain = agent_result.get("agent_chain", [])
    return {
        "response": agent_result.get("text", ""),
        "tokens_used": agent_result.get("tokens", 0),
        "provider": agent_result.get("provider"),
        "provider_display": agent_result.get("provider_display"),
        "agent_chain": agent_chain,
        "confidence_score": validation.get("confidence_score"),
        "agents_used": [ai.model_dump() for ai in _build_agents_used(agent_chain)],
        "validation": _build_validation_info(validation).model_dump() if validation else None,
    }
