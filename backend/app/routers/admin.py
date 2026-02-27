"""Stairs — Admin Router (AI monitoring)"""

import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends

from app.db.connection import get_pool
from app.helpers import get_auth, AuthContext
from app.ai_providers import get_ai_status

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get("/ai-status")
async def ai_status(auth: AuthContext = Depends(get_auth)):
    status = get_ai_status()

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Check if table exists before querying
        table_exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_usage_logs')"
        )
        if table_exists:
            one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
            today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

            # Failures per provider in last hour
            failure_rows = await conn.fetch(
                "SELECT provider, COUNT(*) as cnt FROM ai_usage_logs "
                "WHERE success = FALSE AND created_at > $1 GROUP BY provider",
                one_hour_ago,
            )
            for row in failure_rows:
                p = row["provider"]
                if p in status["providers"]:
                    status["providers"][p]["db_failures_last_hour"] = row["cnt"]

            # Last successful call per provider from DB
            for p in status["providers"]:
                last = await conn.fetchval(
                    "SELECT MAX(created_at) FROM ai_usage_logs WHERE provider = $1 AND success = TRUE",
                    p,
                )
                if last:
                    status["providers"][p]["last_success_db"] = last.isoformat()

            # Fallback switches today from DB
            fb_count = await conn.fetchval(
                "SELECT COUNT(*) FROM ai_usage_logs WHERE fallback_used = TRUE AND created_at > $1",
                today_start,
            )
            status["db_fallback_switches_today"] = fb_count

            # Recent logs (last 20)
            recent = await conn.fetch(
                "SELECT provider, success, response_time_ms, tokens_used, status_code, "
                "fallback_used, fallback_from, error_message, created_at "
                "FROM ai_usage_logs ORDER BY created_at DESC LIMIT 20"
            )
            status["recent_logs"] = [
                {
                    "provider": r["provider"],
                    "success": r["success"],
                    "response_time_ms": r["response_time_ms"],
                    "tokens_used": r["tokens_used"],
                    "status_code": r["status_code"],
                    "fallback_used": r["fallback_used"],
                    "fallback_from": r["fallback_from"],
                    "error_message": r["error_message"],
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                }
                for r in recent
            ]

    return status
