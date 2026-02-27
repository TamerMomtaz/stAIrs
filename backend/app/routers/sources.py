"""Stairs — Strategy Sources Router (Source of Truth)"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Depends, UploadFile, File
from pydantic import BaseModel

from app.db.connection import get_pool
from app.helpers import row_to_dict, rows_to_dicts, get_auth, AuthContext
from app.models.schemas import SourceCreate, SourceUpdate, SourceOut
from app.storage import (
    upload_file, get_signed_url, delete_file,
    ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES, MAX_FILE_SIZE,
)
from app.extraction import extract_text, clean_extracted_text, assess_extraction_quality

logger = logging.getLogger(__name__)

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
async def count_sources(
    strategy_id: str,
    source_type: Optional[str] = Query(None, description="Filter by source type"),
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
        if source_type:
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM strategy_sources WHERE strategy_id = $1 AND source_type = $2",
                strategy_id, source_type,
            )
        else:
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


@router.post("/{strategy_id}/sources/upload", status_code=201)
async def upload_document(
    strategy_id: str,
    file: UploadFile = File(...),
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

    # Validate file extension
    fname = file.filename or "untitled"
    ext = ""
    if "." in fname:
        ext = "." + fname.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}")

    # Read file bytes and validate size
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(400, f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")

    content_type = file.content_type or "application/octet-stream"

    # Upload to Supabase Storage
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    storage_path = f"{strategy_id}/{timestamp}_{fname}"
    try:
        await upload_file(storage_path, file_bytes, content_type)
    except Exception as e:
        raise HTTPException(502, f"Storage upload failed: {str(e)}")

    # Extract text
    extracted_text, extra_meta = extract_text(file_bytes, fname, content_type)
    content = extracted_text if extracted_text else "extraction_failed"

    # Ensure cleaned_text and extraction_quality are always present in metadata
    if "cleaned_text" not in extra_meta and content != "extraction_failed":
        extra_meta["cleaned_text"] = clean_extracted_text(content)
    if "extraction_quality" not in extra_meta:
        cleaned = extra_meta.get("cleaned_text", content)
        extra_meta["extraction_quality"] = assess_extraction_quality(cleaned)

    # Get signed URL
    try:
        signed_url = await get_signed_url(storage_path)
    except Exception:
        signed_url = ""

    # Build metadata
    metadata = {
        "context": "document_upload",
        "filename": fname,
        "file_size": len(file_bytes),
        "mime_type": content_type,
        "storage_path": storage_path,
        **extra_meta,
    }

    # Save to database
    source_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO strategy_sources (id, strategy_id, source_type, content, metadata, created_by, created_at, updated_at) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $7)",
            source_id, strategy_id, "document", content,
            json.dumps(metadata), auth.user_id, now,
        )
        row = await conn.fetchrow("SELECT * FROM strategy_sources WHERE id = $1", source_id)
        result = row_to_dict(row)

    result["download_url"] = signed_url
    return result


@router.get("/{strategy_id}/sources/{source_id}/download-url")
async def get_document_download_url(
    strategy_id: str,
    source_id: str,
    auth: AuthContext = Depends(get_auth),
):
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
        storage_path = meta.get("storage_path")
        if not storage_path:
            raise HTTPException(400, "No file associated with this source")
        try:
            signed_url = await get_signed_url(storage_path)
        except Exception as e:
            raise HTTPException(502, f"Failed to generate download URL: {str(e)}")
        return {"download_url": signed_url, "filename": meta.get("filename", "")}


@router.delete("/{strategy_id}/sources/{source_id}/with-file")
async def delete_source_with_file(
    strategy_id: str,
    source_id: str,
    auth: AuthContext = Depends(get_auth),
):
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
        storage_path = meta.get("storage_path")

        # Delete from Supabase Storage if path exists
        if storage_path:
            try:
                await delete_file(storage_path)
            except Exception:
                pass  # Best-effort — still delete from DB

        # Delete from database
        await conn.execute(
            "DELETE FROM strategy_sources WHERE id = $1 AND strategy_id = $2",
            source_id, strategy_id,
        )
    return {"deleted": True, "id": source_id}


AI_EXTRACTION_CATEGORIES = [
    "Financial Data",
    "Market Position",
    "Team & Resources",
    "Competitors",
    "Business Model",
    "Customers",
    "Risks",
    "Opportunities",
]

AI_EXTRACTION_PROMPT = """You are an expert strategy analyst. Analyze the following document text and extract strategy-relevant information into these categories:
{categories}

For each category, extract specific items (facts, figures, quotes) from the document.
For each item include:
- "text": the EXACT quote or data point from the document (do not paraphrase)
- "confidence": your confidence that this belongs in this category — "high", "medium", or "low"

Return ONLY valid JSON in this format:
{{
  "categories": {{
    "Financial Data": {{
      "items": [
        {{"text": "exact quote from document", "confidence": "high"}}
      ]
    }},
    "Market Position": {{
      "items": []
    }}
  }}
}}

If a category has no relevant content, return an empty items array for it.
Focus on concrete data points, metrics, names, and factual statements — not vague descriptions.

DOCUMENT TEXT:
{document_text}"""


@router.post("/{strategy_id}/sources/{source_id}/analyze")
async def analyze_document_source(
    strategy_id: str,
    source_id: str,
    auth: AuthContext = Depends(get_auth),
):
    """Send document text to AI for strategy-relevant categorization via Document Agent."""
    from app.agents.orchestrator import Orchestrator

    pool = await get_pool()
    async with pool.acquire() as conn:
        strat = await conn.fetchrow(
            "SELECT id FROM strategies WHERE id = $1 AND organization_id = $2",
            strategy_id, auth.org_id,
        )
        if not strat:
            raise HTTPException(404, "Strategy not found")

        row = await conn.fetchrow(
            "SELECT * FROM strategy_sources WHERE id = $1 AND strategy_id = $2",
            source_id, strategy_id,
        )
        if not row:
            raise HTTPException(404, "Source not found")

    source = row_to_dict(row)
    meta = source.get("metadata") or {}

    # Get cleaned text or raw content
    document_text = meta.get("cleaned_text") or source.get("content") or ""
    if not document_text or document_text == "extraction_failed":
        raise HTTPException(400, "No extracted text available for this document")

    # Route through Orchestrator → Document Agent
    orchestrator = Orchestrator()
    agent_result = await orchestrator.process(
        task_type="document_analysis",
        strategy_id=strategy_id,
        payload={"document_text": document_text},
    )

    text = agent_result.get("text", "{}")
    provider = agent_result.get("provider", "claude")

    # Parse AI response
    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            parsed = json.loads(text[start:end])
        else:
            parsed = {"categories": {}}
    except Exception:
        parsed = {"categories": {}}

    # Normalize the response — ensure all categories exist
    categories = parsed.get("categories", {})
    ai_analysis = {"categories": {}, "provider": provider, "analyzed_at": datetime.now(timezone.utc).isoformat()}
    for cat in AI_EXTRACTION_CATEGORIES:
        cat_data = categories.get(cat, {})
        items = cat_data.get("items", []) if isinstance(cat_data, dict) else []
        # Validate each item
        valid_items = []
        for item in items:
            if isinstance(item, dict) and item.get("text"):
                conf = item.get("confidence", "medium")
                if conf not in ("high", "medium", "low"):
                    conf = "medium"
                valid_items.append({"text": str(item["text"]), "confidence": conf})
        ai_analysis["categories"][cat] = {"items": valid_items}

    # Save analysis to source metadata
    meta["ai_analysis"] = ai_analysis
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        await conn.execute(
            'UPDATE strategy_sources SET "metadata" = $1, updated_at = $2 WHERE id = $3',
            json.dumps(meta), now, source_id,
        )
        updated_row = await conn.fetchrow("SELECT * FROM strategy_sources WHERE id = $1", source_id)

    return row_to_dict(updated_row)


class ApproveExtractionsRequest(BaseModel):
    items: List[dict]  # Each: {"category": str, "text": str, "confidence": str}


@router.post("/{strategy_id}/sources/{source_id}/approve-extractions", status_code=201)
async def approve_extractions(
    strategy_id: str,
    source_id: str,
    req: ApproveExtractionsRequest,
    auth: AuthContext = Depends(get_auth),
):
    """Approve selected AI extractions and create individual source entries."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        strat = await conn.fetchrow(
            "SELECT id FROM strategies WHERE id = $1 AND organization_id = $2",
            strategy_id, auth.org_id,
        )
        if not strat:
            raise HTTPException(404, "Strategy not found")

        parent_row = await conn.fetchrow(
            "SELECT * FROM strategy_sources WHERE id = $1 AND strategy_id = $2",
            source_id, strategy_id,
        )
        if not parent_row:
            raise HTTPException(404, "Source not found")

    parent = row_to_dict(parent_row)
    parent_meta = parent.get("metadata") or {}
    parent_filename = parent_meta.get("filename", "Document")

    created = []
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        for item in req.items:
            category = item.get("category", "")
            text = item.get("text", "")
            confidence = item.get("confidence", "medium")
            if not text or not category:
                continue

            new_id = str(uuid.uuid4())
            item_metadata = {
                "context": "ai_extraction",
                "category": category,
                "confidence": confidence,
                "parent_source_id": source_id,
                "parent_filename": parent_filename,
            }
            await conn.execute(
                "INSERT INTO strategy_sources (id, strategy_id, source_type, content, metadata, created_by, created_at, updated_at) "
                "VALUES ($1, $2, $3, $4, $5, $6, $7, $7)",
                new_id, strategy_id, "ai_extraction", text,
                json.dumps(item_metadata), auth.user_id, now,
            )
            created.append({"id": new_id, "category": category, "text": text[:200]})

    return {"approved": len(created), "items": created}


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
