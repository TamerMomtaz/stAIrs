"""Stairs — Generated Artifacts Router

Server-side home for content the client explicitly generated or created:
Execution Room solutions, explanations, implementation guides and their step
checklists, per-task chats, staircase explain/enhance results, matrix
worksheets. These are domain data, not UI state — they get written here, read
back on mount, and never regenerated automatically.

Identity is (organization_id, artifact_type, scope_key). scope_key names the
thing the artifact belongs to:

    solutions      "<stair_id>"
    explain        "<stair_id>:<task_id>"
    impl_guide     "<stair_id>:<task_id>"
    matrix         "<strategy_id>:<matrix_key>"

Writes upsert on that key, so re-running a generation replaces the previous
result rather than accumulating duplicates.
"""

import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Depends

from app.db.connection import get_pool
from app.helpers import row_to_dict, rows_to_dicts, get_auth, AuthContext
from app.models.schemas import ArtifactUpsert, ArtifactOut

router = APIRouter(prefix="/api/v1", tags=["artifacts"])


@router.put("/artifacts", response_model=ArtifactOut)
async def upsert_artifact(art: ArtifactUpsert, auth: AuthContext = Depends(get_auth)):
    """Create or replace an artifact. generated_at moves to now on every write —
    it is the timestamp the client shows so saved content reads as saved."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        if art.stair_id:
            stair = await conn.fetchrow(
                "SELECT id FROM stairs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL",
                str(art.stair_id), auth.org_id)
            if not stair:
                raise HTTPException(404, "Stair not found")
        now = datetime.now(timezone.utc)
        row = await conn.fetchrow("""
            INSERT INTO generated_artifacts
                (id, organization_id, strategy_id, stair_id, artifact_type, scope_key,
                 content, payload, generated_at, updated_at, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10)
            ON CONFLICT (organization_id, artifact_type, scope_key) DO UPDATE SET
                strategy_id = EXCLUDED.strategy_id,
                stair_id = EXCLUDED.stair_id,
                content = EXCLUDED.content,
                payload = EXCLUDED.payload,
                generated_at = EXCLUDED.generated_at,
                updated_at = EXCLUDED.updated_at
            RETURNING *
        """, str(uuid.uuid4()), auth.org_id,
            str(art.strategy_id) if art.strategy_id else None,
            str(art.stair_id) if art.stair_id else None,
            art.artifact_type, art.scope_key, art.content,
            json.dumps(art.payload or {}), now, auth.user_id)
        return row_to_dict(row)


@router.get("/stairs/{stair_id}/artifacts", response_model=List[ArtifactOut])
async def list_stair_artifacts(
    stair_id: str,
    artifact_type: Optional[str] = Query(None),
    auth: AuthContext = Depends(get_auth),
):
    """Everything generated for one stair — the Execution Room's mount read."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        q = """SELECT a.* FROM generated_artifacts a
               JOIN stairs s ON s.id = a.stair_id
               WHERE a.stair_id = $1 AND a.organization_id = $2 AND s.deleted_at IS NULL"""
        p = [stair_id, auth.org_id]
        if artifact_type:
            q += " AND a.artifact_type = $3"
            p.append(artifact_type)
        q += " ORDER BY a.generated_at DESC"
        return rows_to_dicts(await conn.fetch(q, *p))


@router.get("/strategies/{strategy_id}/artifacts", response_model=List[ArtifactOut])
async def list_strategy_artifacts(
    strategy_id: str,
    artifact_type: Optional[str] = Query(None),
    auth: AuthContext = Depends(get_auth),
):
    """Everything generated under one strategy — Manifest Room and the matrix
    toolkit read this so results follow the account, not the browser."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        q = """SELECT * FROM generated_artifacts
               WHERE strategy_id = $1 AND organization_id = $2"""
        p = [strategy_id, auth.org_id]
        if artifact_type:
            q += " AND artifact_type = $3"
            p.append(artifact_type)
        q += " ORDER BY generated_at DESC"
        return rows_to_dicts(await conn.fetch(q, *p))


@router.delete("/artifacts/{artifact_type}/{scope_key:path}")
async def delete_artifact(artifact_type: str, scope_key: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM generated_artifacts WHERE organization_id = $1 AND artifact_type = $2 AND scope_key = $3",
            auth.org_id, artifact_type, scope_key)
        if result == "DELETE 0":
            raise HTTPException(404, "Artifact not found")
        return {"deleted": True, "artifact_type": artifact_type, "scope_key": scope_key}
