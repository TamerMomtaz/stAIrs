"""Stairs — Data Quality Assurance Router

Implements a 6-layer data integrity system for the Source of Truth:
  Layer 1: Upload Quality Gate (relevance scoring)
  Layer 2: Contradiction Detection (cross-source validation)
  Layer 3: Source Confidence Scoring
  Layer 4: Data Quarantine
  Layer 5: Impact Tracing
  Layer 6: Questionnaire Answer Validation
  + Data Health dashboard endpoint
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel

from app.db.connection import get_pool
from app.helpers import row_to_dict, rows_to_dicts, get_auth, AuthContext

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/data-qa", tags=["data-qa"])


# ─── PYDANTIC MODELS ───

class RelevanceCheckRequest(BaseModel):
    document_text: str
    strategy_id: str


class RelevanceCheckResponse(BaseModel):
    relevance_score: int
    detected_topic: str
    strategy_topic: str
    is_relevant: bool
    warning: Optional[str] = None


class ContradictionItem(BaseModel):
    source_id: str
    source_type: str
    field: str
    value: str
    source_label: str


class Contradiction(BaseModel):
    field: str
    new_value: str
    new_source_id: str
    existing: List[ContradictionItem]


class ContradictionCheckResponse(BaseModel):
    has_contradictions: bool
    contradictions: List[Contradiction]


class ConflictResolution(BaseModel):
    field: str
    chosen_source_id: str
    rejected_source_ids: List[str]


class ResolveConflictsRequest(BaseModel):
    resolutions: List[ConflictResolution]


class QuarantineRequest(BaseModel):
    reason: Optional[str] = None


class SourceConfidence(BaseModel):
    source_id: str
    confidence_score: int
    confidence_level: str  # high, medium, low
    factors: dict


class DataHealthResponse(BaseModel):
    total_sources: int
    verified_sources: int
    disputed_sources: int
    quarantined_sources: int
    health_score: int
    health_level: str  # healthy, warning, critical
    warning_message: Optional[str] = None


class ImpactItem(BaseModel):
    entity_type: str  # matrix, action_plan, implementation_guide, ai_chat
    entity_id: Optional[str] = None
    entity_label: str
    usage_count: int
    details: Optional[str] = None


class ImpactTraceResponse(BaseModel):
    source_id: str
    source_label: str
    impacts: List[ImpactItem]
    total_references: int


class QuestionnaireValidationItem(BaseModel):
    question_id: str
    question_text: str
    user_answer: str
    document_suggestion: str
    source_filename: str
    confidence: str


class QuestionnaireValidationResponse(BaseModel):
    has_mismatches: bool
    mismatches: List[QuestionnaireValidationItem]


# ─── HELPER: SOURCE TYPE RELIABILITY ───

SOURCE_TYPE_RELIABILITY = {
    "document": 90,
    "ai_extraction": 75,
    "manual_entry": 60,
    "feedback": 55,
    "ai_chat": 50,
    "questionnaire": 45,
}


def _compute_confidence(source: dict, all_sources: list) -> dict:
    """Compute confidence score for a source based on multiple factors."""
    meta = source.get("metadata") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}

    # Factor 1: Source type reliability (0-100)
    type_score = SOURCE_TYPE_RELIABILITY.get(source.get("source_type", ""), 50)

    # Factor 2: Document relevance score (0-100, default 70 if not available)
    relevance_score = meta.get("relevance_score", 70)

    # Factor 3: User verification (adds 20 points)
    verified = meta.get("user_verified", False)
    verification_bonus = 20 if verified else 0

    # Factor 4: Contradiction penalty (each dispute costs 15 points)
    dispute_count = meta.get("dispute_count", 0)
    contradiction_penalty = min(dispute_count * 15, 45)

    # Factor 5: Quarantine (score is 0)
    is_quarantined = meta.get("quarantined", False)
    if is_quarantined:
        return {
            "confidence_score": 0,
            "confidence_level": "quarantined",
            "factors": {
                "source_type_score": type_score,
                "relevance_score": relevance_score,
                "verified": verified,
                "dispute_count": dispute_count,
                "quarantined": True,
            },
        }

    # Weighted average
    raw_score = (
        type_score * 0.3
        + relevance_score * 0.3
        + verification_bonus
        - contradiction_penalty
    )
    confidence_score = max(0, min(100, int(raw_score)))

    if confidence_score >= 70:
        level = "high"
    elif confidence_score >= 40:
        level = "medium"
    else:
        level = "low"

    return {
        "confidence_score": confidence_score,
        "confidence_level": level,
        "factors": {
            "source_type_score": type_score,
            "relevance_score": relevance_score,
            "verified": verified,
            "dispute_count": dispute_count,
            "quarantined": False,
        },
    }


# ─── LAYER 1: UPLOAD QUALITY GATE ───

@router.post("/relevance-check", response_model=RelevanceCheckResponse)
async def check_relevance(req: RelevanceCheckRequest, auth: AuthContext = Depends(get_auth)):
    """Check if document text is relevant to the strategy's company/industry."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        strat = await conn.fetchrow(
            "SELECT name, company, industry, description FROM strategies WHERE id = $1 AND organization_id = $2",
            req.strategy_id, auth.org_id,
        )
        if not strat:
            raise HTTPException(404, "Strategy not found")

    strategy_company = strat.get("company") or ""
    strategy_industry = strat.get("industry") or ""
    strategy_name = strat.get("name") or ""
    strategy_desc = strat.get("description") or ""
    strategy_topic = f"{strategy_company} ({strategy_industry})" if strategy_company else strategy_name

    # Use simple keyword matching for relevance scoring
    doc_lower = req.document_text.lower()[:5000]
    score = 50  # Base score

    # Check for company name match
    if strategy_company and strategy_company.lower() in doc_lower:
        score += 30

    # Check for industry match
    if strategy_industry and strategy_industry.lower() in doc_lower:
        score += 15

    # Check for strategy keywords from description
    if strategy_desc:
        desc_words = [w.strip().lower() for w in strategy_desc.split() if len(w.strip()) > 4]
        matched = sum(1 for w in desc_words[:20] if w in doc_lower)
        score += min(matched * 2, 20)

    # Detect topic from document (first meaningful line)
    lines = [ln.strip() for ln in req.document_text.split("\n") if ln.strip() and len(ln.strip()) > 10]
    detected_topic = lines[0][:100] if lines else "Unknown topic"

    # Clamp score
    relevance_score = max(0, min(100, score))
    is_relevant = relevance_score >= 40

    warning = None
    if not is_relevant:
        warning = (
            f"This document may not be relevant to your strategy. "
            f"It appears to be about \"{detected_topic[:60]}\" "
            f"but your strategy is about {strategy_topic}. Upload anyway?"
        )

    return RelevanceCheckResponse(
        relevance_score=relevance_score,
        detected_topic=detected_topic,
        strategy_topic=strategy_topic,
        is_relevant=is_relevant,
        warning=warning,
    )


# ─── LAYER 2: CONTRADICTION DETECTION ───

@router.post("/{strategy_id}/check-contradictions")
async def check_contradictions(
    strategy_id: str,
    source_id: str = Query(..., description="ID of the new source to check"),
    auth: AuthContext = Depends(get_auth),
):
    """Cross-check a new source against all existing sources for contradictions."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        strat = await conn.fetchrow(
            "SELECT id FROM strategies WHERE id = $1 AND organization_id = $2",
            strategy_id, auth.org_id,
        )
        if not strat:
            raise HTTPException(404, "Strategy not found")

        new_source = await conn.fetchrow(
            "SELECT * FROM strategy_sources WHERE id = $1 AND strategy_id = $2",
            source_id, strategy_id,
        )
        if not new_source:
            raise HTTPException(404, "Source not found")

        existing_sources = await conn.fetch(
            "SELECT * FROM strategy_sources WHERE strategy_id = $1 AND id != $2 "
            "ORDER BY created_at DESC LIMIT 200",
            strategy_id, source_id,
        )

    new_dict = row_to_dict(new_source)
    existing_dicts = rows_to_dicts(existing_sources)
    new_content = (new_dict.get("content") or "").lower()

    # Extract numeric data points from sources for comparison
    import re
    number_pattern = re.compile(r'\$[\d,.]+[MBK]?|\d+[\d,.]*\s*%|\d[\d,.]+')

    new_numbers = set(number_pattern.findall(new_content))

    contradictions = []
    for existing in existing_dicts:
        ex_meta = existing.get("metadata") or {}
        if ex_meta.get("quarantined"):
            continue
        ex_content = (existing.get("content") or "").lower()
        ex_numbers = set(number_pattern.findall(ex_content))

        # Find overlapping numeric contexts (potential contradictions)
        common_context_words = {"revenue", "profit", "growth", "market", "share",
                                "employee", "budget", "cost", "sales", "target"}
        new_context = {w for w in new_content.split() if w in common_context_words}
        ex_context = {w for w in ex_content.split() if w in common_context_words}
        shared_context = new_context & ex_context

        if shared_context and new_numbers and ex_numbers:
            # Potential contradiction: same context, different numbers
            diff_numbers = new_numbers - ex_numbers
            if diff_numbers:
                for ctx in shared_context:
                    for new_num in list(diff_numbers)[:2]:
                        for ex_num in list(ex_numbers)[:2]:
                            if new_num != ex_num:
                                cfg_label = _source_label(existing)
                                contradictions.append({
                                    "field": ctx,
                                    "new_value": new_num,
                                    "new_source_id": source_id,
                                    "existing": [{
                                        "source_id": existing["id"],
                                        "source_type": existing.get("source_type", ""),
                                        "field": ctx,
                                        "value": ex_num,
                                        "source_label": cfg_label,
                                    }],
                                })
                                break
                        break

    return {
        "has_contradictions": len(contradictions) > 0,
        "contradictions": contradictions[:10],
    }


def _source_label(source: dict) -> str:
    meta = source.get("metadata") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
    if meta.get("filename"):
        return meta["filename"]
    if meta.get("context") == "questionnaire_answer":
        return "Questionnaire"
    if source.get("source_type") == "ai_chat":
        return "AI Chat"
    if source.get("source_type") == "manual_entry":
        return "Manual Entry"
    return source.get("source_type", "Unknown")


@router.post("/{strategy_id}/resolve-conflicts")
async def resolve_conflicts(
    strategy_id: str,
    req: ResolveConflictsRequest,
    auth: AuthContext = Depends(get_auth),
):
    """Resolve data conflicts by marking chosen source as verified and rejected as disputed."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        strat = await conn.fetchrow(
            "SELECT id FROM strategies WHERE id = $1 AND organization_id = $2",
            strategy_id, auth.org_id,
        )
        if not strat:
            raise HTTPException(404, "Strategy not found")

        resolved_count = 0
        now = datetime.now(timezone.utc)

        for resolution in req.resolutions:
            # Mark chosen source as verified
            chosen = await conn.fetchrow(
                "SELECT metadata FROM strategy_sources WHERE id = $1 AND strategy_id = $2",
                resolution.chosen_source_id, strategy_id,
            )
            if chosen:
                meta = chosen["metadata"]
                if isinstance(meta, str):
                    try:
                        meta = json.loads(meta)
                    except Exception:
                        meta = {}
                elif meta is None:
                    meta = {}
                meta["user_verified"] = True
                meta["verified_at"] = now.isoformat()
                meta["verified_by"] = auth.user_id
                meta["verification_status"] = "verified"
                await conn.execute(
                    'UPDATE strategy_sources SET "metadata" = $1, updated_at = $2 WHERE id = $3',
                    json.dumps(meta), now, resolution.chosen_source_id,
                )

            # Mark rejected sources as disputed
            for rejected_id in resolution.rejected_source_ids:
                rejected = await conn.fetchrow(
                    "SELECT metadata FROM strategy_sources WHERE id = $1 AND strategy_id = $2",
                    rejected_id, strategy_id,
                )
                if rejected:
                    meta = rejected["metadata"]
                    if isinstance(meta, str):
                        try:
                            meta = json.loads(meta)
                        except Exception:
                            meta = {}
                    elif meta is None:
                        meta = {}
                    meta["verification_status"] = "disputed"
                    dispute_count = meta.get("dispute_count", 0) + 1
                    meta["dispute_count"] = dispute_count
                    meta["disputed_at"] = now.isoformat()
                    meta["disputed_field"] = resolution.field
                    await conn.execute(
                        'UPDATE strategy_sources SET "metadata" = $1, updated_at = $2 WHERE id = $3',
                        json.dumps(meta), now, rejected_id,
                    )

            resolved_count += 1

    return {"resolved": resolved_count}


# ─── LAYER 3: SOURCE CONFIDENCE SCORING ───

@router.get("/{strategy_id}/confidence")
async def get_source_confidence(
    strategy_id: str,
    auth: AuthContext = Depends(get_auth),
):
    """Get confidence scores for all sources in a strategy."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        strat = await conn.fetchrow(
            "SELECT id FROM strategies WHERE id = $1 AND organization_id = $2",
            strategy_id, auth.org_id,
        )
        if not strat:
            raise HTTPException(404, "Strategy not found")

        rows = await conn.fetch(
            "SELECT * FROM strategy_sources WHERE strategy_id = $1 ORDER BY created_at DESC",
            strategy_id,
        )

    sources = rows_to_dicts(rows)
    result = []
    for source in sources:
        conf = _compute_confidence(source, sources)
        result.append({
            "source_id": source["id"],
            **conf,
        })

    return result


@router.post("/{strategy_id}/sources/{source_id}/verify")
async def verify_source(
    strategy_id: str,
    source_id: str,
    auth: AuthContext = Depends(get_auth),
):
    """Mark a source as user-verified, boosting its confidence score."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM strategy_sources WHERE id = $1 AND strategy_id = $2",
            source_id, strategy_id,
        )
        if not row:
            raise HTTPException(404, "Source not found")

        source = row_to_dict(row)
        meta = source.get("metadata") or {}
        meta["user_verified"] = True
        meta["verified_at"] = datetime.now(timezone.utc).isoformat()
        meta["verified_by"] = auth.user_id
        meta["verification_status"] = "verified"

        now = datetime.now(timezone.utc)
        await conn.execute(
            'UPDATE strategy_sources SET "metadata" = $1, updated_at = $2 WHERE id = $3',
            json.dumps(meta), now, source_id,
        )
        updated = await conn.fetchrow("SELECT * FROM strategy_sources WHERE id = $1", source_id)

    return row_to_dict(updated)


# ─── LAYER 4: DATA QUARANTINE ───

@router.post("/{strategy_id}/sources/{source_id}/quarantine")
async def quarantine_source(
    strategy_id: str,
    source_id: str,
    req: QuarantineRequest,
    auth: AuthContext = Depends(get_auth),
):
    """Quarantine a source — excludes it from agent context immediately."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM strategy_sources WHERE id = $1 AND strategy_id = $2",
            source_id, strategy_id,
        )
        if not row:
            raise HTTPException(404, "Source not found")

        source = row_to_dict(row)
        meta = source.get("metadata") or {}
        meta["quarantined"] = True
        meta["quarantined_at"] = datetime.now(timezone.utc).isoformat()
        meta["quarantined_by"] = auth.user_id
        meta["quarantine_reason"] = req.reason or ""
        meta["verification_status"] = "quarantined"

        now = datetime.now(timezone.utc)
        await conn.execute(
            'UPDATE strategy_sources SET "metadata" = $1, updated_at = $2 WHERE id = $3',
            json.dumps(meta), now, source_id,
        )
        updated = await conn.fetchrow("SELECT * FROM strategy_sources WHERE id = $1", source_id)

    return row_to_dict(updated)


@router.post("/{strategy_id}/sources/{source_id}/restore")
async def restore_source(
    strategy_id: str,
    source_id: str,
    auth: AuthContext = Depends(get_auth),
):
    """Restore a quarantined source back to active status."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM strategy_sources WHERE id = $1 AND strategy_id = $2",
            source_id, strategy_id,
        )
        if not row:
            raise HTTPException(404, "Source not found")

        source = row_to_dict(row)
        meta = source.get("metadata") or {}
        meta["quarantined"] = False
        meta["restored_at"] = datetime.now(timezone.utc).isoformat()
        meta["restored_by"] = auth.user_id
        if meta.get("verification_status") == "quarantined":
            meta["verification_status"] = "unverified"

        now = datetime.now(timezone.utc)
        await conn.execute(
            'UPDATE strategy_sources SET "metadata" = $1, updated_at = $2 WHERE id = $3',
            json.dumps(meta), now, source_id,
        )
        updated = await conn.fetchrow("SELECT * FROM strategy_sources WHERE id = $1", source_id)

    return row_to_dict(updated)


# ─── LAYER 5: IMPACT TRACING ───

@router.get("/{strategy_id}/sources/{source_id}/impact")
async def trace_source_impact(
    strategy_id: str,
    source_id: str,
    auth: AuthContext = Depends(get_auth),
):
    """Trace everywhere a source has been referenced: matrices, action plans, AI outputs."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM strategy_sources WHERE id = $1 AND strategy_id = $2",
            source_id, strategy_id,
        )
        if not row:
            raise HTTPException(404, "Source not found")

        source = row_to_dict(row)
        meta = source.get("metadata") or {}
        source_label = _source_label(source)
        content_snippet = (source.get("content") or "")[:200].lower()

        impacts = []
        total_refs = 0

        # Check AI chat sources that may reference this content
        ai_chats = await conn.fetch(
            "SELECT id, content, metadata FROM strategy_sources "
            "WHERE strategy_id = $1 AND source_type = 'ai_chat' AND id != $2 "
            "ORDER BY created_at DESC LIMIT 100",
            strategy_id, source_id,
        )
        for chat in ai_chats:
            chat_content = (chat["content"] or "").lower()
            chat_meta = chat["metadata"]
            if isinstance(chat_meta, str):
                try:
                    chat_meta = json.loads(chat_meta)
                except Exception:
                    chat_meta = {}
            # Check if source file was referenced in chat
            filename = meta.get("filename", "")
            if filename and filename.lower() in chat_content:
                total_refs += 1

        if total_refs > 0:
            impacts.append({
                "entity_type": "ai_chat",
                "entity_id": None,
                "entity_label": "AI Advisor Conversations",
                "usage_count": total_refs,
                "details": f"Referenced in {total_refs} AI chat response(s)",
            })

        # Check action plans
        try:
            action_plans = await conn.fetch(
                "SELECT ap.id, ap.raw_text, s.title as stair_title FROM action_plans ap "
                "JOIN stairs s ON s.id = ap.stair_id "
                "WHERE ap.organization_id = $1 ORDER BY ap.created_at DESC LIMIT 100",
                auth.org_id,
            )
            plan_refs = 0
            for plan in action_plans:
                plan_text = (plan["raw_text"] or "").lower()
                # Check if any significant words from the source appear in the plan
                significant_words = [w for w in content_snippet.split() if len(w) > 5][:10]
                matches = sum(1 for w in significant_words if w in plan_text)
                if matches >= 3:
                    plan_refs += 1

            if plan_refs > 0:
                impacts.append({
                    "entity_type": "action_plan",
                    "entity_id": None,
                    "entity_label": "Action Plans",
                    "usage_count": plan_refs,
                    "details": f"Data used in {plan_refs} action plan(s)",
                })
        except Exception:
            pass

        # Check AI extractions that came from this source
        if source.get("source_type") == "document":
            extraction_count = await conn.fetchval(
                "SELECT COUNT(*) FROM strategy_sources "
                "WHERE strategy_id = $1 AND source_type = 'ai_extraction' "
                "AND metadata::text LIKE $2",
                strategy_id, f'%"parent_source_id": "{source_id}"%',
            )
            if extraction_count and extraction_count > 0:
                impacts.append({
                    "entity_type": "ai_extraction",
                    "entity_id": None,
                    "entity_label": "AI Extracted Data Points",
                    "usage_count": extraction_count,
                    "details": f"{extraction_count} data point(s) extracted from this document",
                })

    return {
        "source_id": source_id,
        "source_label": source_label,
        "impacts": impacts,
        "total_references": sum(i["usage_count"] for i in impacts),
    }


# ─── LAYER 6: QUESTIONNAIRE ANSWER VALIDATION ───

@router.post("/{strategy_id}/validate-answers")
async def validate_questionnaire_answers(
    strategy_id: str,
    answers: dict,
    auth: AuthContext = Depends(get_auth),
):
    """Check questionnaire answers against uploaded document data for mismatches."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        strat = await conn.fetchrow(
            "SELECT id FROM strategies WHERE id = $1 AND organization_id = $2",
            strategy_id, auth.org_id,
        )
        if not strat:
            raise HTTPException(404, "Strategy not found")

        # Get all document and AI extraction sources
        doc_sources = await conn.fetch(
            "SELECT content, metadata FROM strategy_sources "
            "WHERE strategy_id = $1 AND source_type IN ('document', 'ai_extraction') "
            "AND (metadata::text NOT LIKE '%\"quarantined\": true%' OR metadata::text IS NULL) "
            "ORDER BY created_at DESC LIMIT 100",
            strategy_id,
        )

    doc_dicts = rows_to_dicts(doc_sources)
    # Build a combined document knowledge base
    doc_text = " ".join((d.get("content") or "") for d in doc_dicts).lower()

    mismatches = []
    import re
    number_pattern = re.compile(r'\$[\d,.]+[MBK]?|\d+[\d,.]*\s*%|\d[\d,.]+')

    for qid, answer_data in answers.items():
        answer_text = answer_data if isinstance(answer_data, str) else str(answer_data)
        answer_lower = answer_text.lower()

        # Extract numbers from the answer
        answer_numbers = set(number_pattern.findall(answer_lower))
        doc_numbers = set(number_pattern.findall(doc_text))

        # Check for numeric contradictions
        for ans_num in answer_numbers:
            if ans_num not in doc_numbers and doc_numbers:
                # Find closest context in documents
                for doc in doc_dicts:
                    doc_content = (doc.get("content") or "").lower()
                    if any(n in doc_content for n in doc_numbers):
                        meta = doc.get("metadata") or {}
                        filename = meta.get("filename") or meta.get("parent_filename") or "Document"
                        doc_suggestion = ", ".join(list(doc_numbers)[:3])
                        mismatches.append({
                            "question_id": qid,
                            "question_text": qid,
                            "user_answer": answer_text,
                            "document_suggestion": doc_suggestion,
                            "source_filename": filename,
                            "confidence": "medium",
                        })
                        break

    return {
        "has_mismatches": len(mismatches) > 0,
        "mismatches": mismatches[:20],
    }


# ─── DATA HEALTH DASHBOARD ───

@router.get("/{strategy_id}/health", response_model=DataHealthResponse)
async def get_data_health(
    strategy_id: str,
    auth: AuthContext = Depends(get_auth),
):
    """Get overall data health metrics for a strategy's Source of Truth."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        strat = await conn.fetchrow(
            "SELECT id FROM strategies WHERE id = $1 AND organization_id = $2",
            strategy_id, auth.org_id,
        )
        if not strat:
            raise HTTPException(404, "Strategy not found")

        rows = await conn.fetch(
            "SELECT * FROM strategy_sources WHERE strategy_id = $1",
            strategy_id,
        )

    sources = rows_to_dicts(rows)
    total = len(sources)

    verified = 0
    disputed = 0
    quarantined = 0
    clean = 0

    for source in sources:
        meta = source.get("metadata") or {}
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}

        if meta.get("quarantined"):
            quarantined += 1
        elif meta.get("verification_status") == "disputed":
            disputed += 1
        elif meta.get("user_verified") or meta.get("verification_status") == "verified":
            verified += 1
            clean += 1
        else:
            # Unverified but not disputed/quarantined counts as clean
            clean += 1

    # Health score: % of clean, non-conflicting, non-quarantined sources
    if total > 0:
        health_score = int((clean / total) * 100)
    else:
        health_score = 100  # No sources = healthy by default

    if health_score >= 80:
        health_level = "healthy"
    elif health_score >= 60:
        health_level = "warning"
    else:
        health_level = "critical"

    warning_message = None
    if health_score < 70:
        warning_message = (
            "Your strategy data has unresolved conflicts that may affect AI accuracy."
        )

    return DataHealthResponse(
        total_sources=total,
        verified_sources=verified,
        disputed_sources=disputed,
        quarantined_sources=quarantined,
        health_score=health_score,
        health_level=health_level,
        warning_message=warning_message,
    )


# ─── QUARANTINED SOURCES LIST ───

@router.get("/{strategy_id}/quarantined")
async def list_quarantined_sources(
    strategy_id: str,
    auth: AuthContext = Depends(get_auth),
):
    """List all quarantined sources for a strategy."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        strat = await conn.fetchrow(
            "SELECT id FROM strategies WHERE id = $1 AND organization_id = $2",
            strategy_id, auth.org_id,
        )
        if not strat:
            raise HTTPException(404, "Strategy not found")

        rows = await conn.fetch(
            "SELECT * FROM strategy_sources WHERE strategy_id = $1 "
            "AND metadata::text LIKE '%\"quarantined\": true%' "
            "ORDER BY updated_at DESC",
            strategy_id,
        )

    return rows_to_dicts(rows)
