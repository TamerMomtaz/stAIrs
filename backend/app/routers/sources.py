"""ST.AIRS — Strategy Sources Router (Source of Truth)"""

import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Depends, UploadFile, File

from app.db.connection import get_pool
from app.helpers import row_to_dict, rows_to_dicts, get_auth, AuthContext
from app.models.schemas import SourceCreate, SourceUpdate, SourceOut
from app.storage import (
    upload_file, get_signed_url, delete_file,
    ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES, MAX_FILE_SIZE,
)
from app.extraction import extract_text, clean_extracted_text, assess_extraction_quality

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
