"""Stairs — Supabase Storage Helper for Document Uploads"""

import os
import httpx

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

BUCKET = "strategy-documents"

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "text/plain",
    "image/png",
    "image/jpeg",
}

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".csv", ".txt", ".png", ".jpg", ".jpeg"}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def _headers():
    return {
        "apikey": SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY}",
    }


async def upload_file(path: str, file_bytes: bytes, content_type: str) -> dict:
    """Upload a file to Supabase Storage. Returns upload response."""
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}"
    headers = {**_headers(), "Content-Type": content_type}
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, content=file_bytes, headers=headers)
        resp.raise_for_status()
        return resp.json()


async def get_signed_url(path: str, expires_in: int = 3600) -> str:
    """Get a signed download URL for a file. Default 1 hour expiry."""
    url = f"{SUPABASE_URL}/storage/v1/object/sign/{BUCKET}/{path}"
    headers = {**_headers(), "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json={"expiresIn": expires_in}, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        signed = data.get("signedURL", "")
        if signed and not signed.startswith("http"):
            signed = f"{SUPABASE_URL}/storage/v1{signed}"
        return signed


async def delete_file(path: str) -> bool:
    """Delete a file from Supabase Storage."""
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}"
    headers = {**_headers(), "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.delete(url, json={"prefixes": [path]}, headers=headers)
        return resp.status_code < 400
