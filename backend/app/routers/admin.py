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


@router.get("/agents")
async def agent_stats(auth: AuthContext = Depends(get_auth)):
    """Agent transparency stats: calls per agent, avg confidence, fallback frequency,
    avg response time, and validation rejection rate."""
    result = {
        "agents": {},
        "total_calls": 0,
        "recent_activity": [],
    }

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Check if agent_logs table exists
        agent_table = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_logs')"
        )
        if not agent_table:
            return result

        # Total calls per agent + avg confidence
        agent_rows = await conn.fetch(
            "SELECT agent_name, COUNT(*) as total_calls, "
            "AVG(confidence_score) as avg_confidence, "
            "COUNT(CASE WHEN confidence_score < 60 THEN 1 END) as low_confidence_count "
            "FROM agent_logs GROUP BY agent_name ORDER BY total_calls DESC"
        )
        total = 0
        for row in agent_rows:
            name = row["agent_name"]
            calls = row["total_calls"]
            total += calls
            result["agents"][name] = {
                "total_calls": calls,
                "avg_confidence": round(float(row["avg_confidence"]), 1) if row["avg_confidence"] else None,
                "low_confidence_count": row["low_confidence_count"],
                "validation_rejection_rate": round(
                    (row["low_confidence_count"] / calls) * 100, 1
                ) if calls > 0 else 0,
            }
        result["total_calls"] = total

        # Avg response time from ai_usage_logs
        usage_table = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_usage_logs')"
        )
        if usage_table:
            avg_rt = await conn.fetchval(
                "SELECT AVG(response_time_ms) FROM ai_usage_logs WHERE success = TRUE"
            )
            result["avg_response_time_ms"] = round(float(avg_rt), 1) if avg_rt else None

            # Fallback frequency
            total_usage = await conn.fetchval("SELECT COUNT(*) FROM ai_usage_logs")
            fallback_count = await conn.fetchval(
                "SELECT COUNT(*) FROM ai_usage_logs WHERE fallback_used = TRUE"
            )
            result["fallback_frequency"] = round(
                (fallback_count / total_usage) * 100, 1
            ) if total_usage > 0 else 0
            result["fallback_count"] = fallback_count

            # Per-provider avg response time
            provider_rows = await conn.fetch(
                "SELECT provider, AVG(response_time_ms) as avg_rt, COUNT(*) as cnt "
                "FROM ai_usage_logs WHERE success = TRUE GROUP BY provider"
            )
            for pr in provider_rows:
                result.setdefault("providers", {})[pr["provider"]] = {
                    "avg_response_time_ms": round(float(pr["avg_rt"]), 1) if pr["avg_rt"] else None,
                    "call_count": pr["cnt"],
                }

        # Recent activity (last 20 agent calls)
        recent = await conn.fetch(
            "SELECT agent_name, task_type, confidence_score, model_used, created_at "
            "FROM agent_logs ORDER BY created_at DESC LIMIT 20"
        )
        result["recent_activity"] = [
            {
                "agent_name": r["agent_name"],
                "task_type": r["task_type"],
                "confidence_score": r["confidence_score"],
                "model_used": r["model_used"],
                "timestamp": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in recent
        ]

    return result
