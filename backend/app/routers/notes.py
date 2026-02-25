"""ST.AIRS — Notes CRUD Router"""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends

from app.db.connection import get_pool
from app.helpers import row_to_dict, rows_to_dicts, get_auth, AuthContext
from app.models.schemas import NoteCreate, NoteUpdate, NoteOut

router = APIRouter(prefix="/api/v1", tags=["notes"])


@router.get("/notes", response_model=list[NoteOut])
async def list_notes(auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM notes WHERE user_id = $1 AND organization_id = $2 ORDER BY updated_at DESC",
            auth.user_id, auth.org_id)
        return rows_to_dicts(rows)


@router.post("/notes", response_model=NoteOut, status_code=201)
async def create_note(note: NoteCreate, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        note_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        await conn.execute("""
            INSERT INTO notes (id, organization_id, user_id, title, content, source, tags, pinned, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
        """, note_id, auth.org_id, auth.user_id,
            note.title, note.content, note.source,
            json.dumps(note.tags or []), note.pinned, now)
        row = await conn.fetchrow("SELECT * FROM notes WHERE id = $1", note_id)
        return row_to_dict(row)


@router.put("/notes/{note_id}", response_model=NoteOut)
async def update_note(note_id: str, updates: NoteUpdate, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT * FROM notes WHERE id = $1 AND user_id = $2", note_id, auth.user_id)
        if not existing:
            raise HTTPException(404, "Note not found")
        update_data = updates.model_dump(exclude_unset=True)
        if not update_data:
            raise HTTPException(400, "No fields to update")
        sets, params, idx = [], [], 1
        for k, v in update_data.items():
            if k == "tags":
                v = json.dumps(v or [])
            sets.append(f"{k} = ${idx}")
            params.append(v)
            idx += 1
        sets.append(f"updated_at = ${idx}")
        params.append(datetime.now(timezone.utc))
        idx += 1
        params.append(note_id)
        await conn.execute(f'UPDATE notes SET {", ".join(sets)} WHERE id = ${idx}', *params)
        row = await conn.fetchrow("SELECT * FROM notes WHERE id = $1", note_id)
        return row_to_dict(row)


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, auth: AuthContext = Depends(get_auth)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM notes WHERE id = $1 AND user_id = $2", note_id, auth.user_id)
        if result == "DELETE 0":
            raise HTTPException(404, "Note not found")
        return {"deleted": True, "id": note_id}
