"""
Stairs — Multi-AI Provider Fallback System
Supports: Anthropic Claude (primary), OpenAI GPT-4o (fallback 1), Google Gemini Pro (fallback 2)
"""

import asyncio
import logging
import os
import time
import uuid
from datetime import datetime, timezone, timedelta
from collections import defaultdict

import httpx

logger = logging.getLogger("stairs.ai_providers")

# ─── API KEYS ───
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")

# ─── PROVIDER NAMES ───
PROVIDER_CLAUDE = "claude"
PROVIDER_OPENAI = "openai"
PROVIDER_GEMINI = "gemini"

PROVIDER_CHAIN = [PROVIDER_CLAUDE, PROVIDER_OPENAI, PROVIDER_GEMINI]

PROVIDER_DISPLAY = {
    PROVIDER_CLAUDE: "Claude",
    PROVIDER_OPENAI: "GPT-4o",
    PROVIDER_GEMINI: "Gemini",
}

# ─── RETRY CONFIG ───
RETRIES_PER_PROVIDER = 2
RETRY_DELAY_SECONDS = 3

# ─── FAILURE CODES THAT TRIGGER FALLBACK ───
FALLBACK_STATUS_CODES = {529, 503, 500, 502, 504}

# ─── IN-MEMORY METRICS (supplemented by DB logs) ───
_provider_metrics = {
    p: {
        "failures_recent": [],  # list of timestamps
        "last_success": None,
        "fallback_switches_today": 0,
        "fallback_switches_date": None,
    }
    for p in PROVIDER_CHAIN
}

_active_provider = PROVIDER_CLAUDE
_global_fallback_switches_today = 0
_global_fallback_date = None


def _record_failure(provider: str):
    now = time.time()
    _provider_metrics[provider]["failures_recent"].append(now)
    cutoff = now - 3600
    _provider_metrics[provider]["failures_recent"] = [
        t for t in _provider_metrics[provider]["failures_recent"] if t > cutoff
    ]


def _record_success(provider: str):
    _provider_metrics[provider]["last_success"] = datetime.now(timezone.utc)


def _record_fallback_switch():
    global _global_fallback_switches_today, _global_fallback_date
    today = datetime.now(timezone.utc).date()
    if _global_fallback_date != today:
        _global_fallback_switches_today = 0
        _global_fallback_date = today
    _global_fallback_switches_today += 1


def get_ai_status() -> dict:
    now = time.time()
    cutoff = now - 3600
    today = datetime.now(timezone.utc).date()
    providers = {}
    for p in PROVIDER_CHAIN:
        m = _provider_metrics[p]
        recent_failures = [t for t in m["failures_recent"] if t > cutoff]
        providers[p] = {
            "display_name": PROVIDER_DISPLAY[p],
            "has_key": bool(_get_api_key(p)),
            "last_success": m["last_success"].isoformat() if m["last_success"] else None,
            "failures_last_hour": len(recent_failures),
        }
    return {
        "active_provider": _active_provider,
        "active_provider_display": PROVIDER_DISPLAY.get(_active_provider, _active_provider),
        "fallback_switches_today": _global_fallback_switches_today if _global_fallback_date == today else 0,
        "providers": providers,
    }


def _get_api_key(provider: str) -> str:
    if provider == PROVIDER_CLAUDE:
        return ANTHROPIC_API_KEY
    elif provider == PROVIDER_OPENAI:
        return OPENAI_API_KEY
    elif provider == PROVIDER_GEMINI:
        return GOOGLE_API_KEY
    return ""


# ─── PROMPT ADAPTATION ───

def adapt_system_prompt(base_prompt: str, provider: str) -> str:
    if provider == PROVIDER_CLAUDE:
        return base_prompt
    elif provider == PROVIDER_OPENAI:
        return (
            base_prompt + "\n\n"
            "FORMATTING INSTRUCTIONS (GPT-4o):\n"
            "- Use structured markdown with clear headers and bullet points.\n"
            "- When returning JSON, use ```json code blocks.\n"
            "- Be precise and data-driven in your analysis.\n"
            "- Maintain the same output structure as expected."
        )
    elif provider == PROVIDER_GEMINI:
        return (
            base_prompt + "\n\n"
            "FORMATTING INSTRUCTIONS (Gemini):\n"
            "- Provide well-structured responses with clear sections.\n"
            "- When returning JSON, output only valid JSON without extra commentary.\n"
            "- Use concrete examples and actionable recommendations.\n"
            "- Maintain the same output structure as expected."
        )
    return base_prompt


def adapt_messages(messages: list, provider: str) -> list:
    if provider == PROVIDER_CLAUDE:
        return messages
    adapted = []
    for msg in messages:
        adapted.append({
            "role": msg.get("role", "user"),
            "content": msg.get("content", ""),
        })
    return adapted


# ─── PROVIDER-SPECIFIC API CALLS ───

async def _call_claude_api(client: httpx.AsyncClient, messages: list, system: str, max_tokens: int) -> tuple:
    resp = await client.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": CLAUDE_MODEL,
            "max_tokens": max_tokens,
            "system": system,
            "messages": messages,
        },
    )
    if resp.status_code == 200:
        data = resp.json()
        text = data["content"][0]["text"] if data.get("content") else ""
        tokens = data.get("usage", {}).get("input_tokens", 0) + data.get("usage", {}).get("output_tokens", 0)
        return True, text, tokens, resp.status_code
    return False, None, 0, resp.status_code


async def _call_openai_api(client: httpx.AsyncClient, messages: list, system: str, max_tokens: int) -> tuple:
    oai_messages = [{"role": "system", "content": system}]
    for msg in messages:
        oai_messages.append({"role": msg["role"], "content": msg["content"]})
    resp = await client.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "gpt-4o",
            "max_tokens": max_tokens,
            "messages": oai_messages,
        },
    )
    if resp.status_code == 200:
        data = resp.json()
        text = data["choices"][0]["message"]["content"] if data.get("choices") else ""
        tokens = data.get("usage", {}).get("total_tokens", 0)
        return True, text, tokens, resp.status_code
    return False, None, 0, resp.status_code


async def _call_gemini_api(client: httpx.AsyncClient, messages: list, system: str, max_tokens: int) -> tuple:
    contents = []
    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        contents.append({"role": role, "parts": [{"text": msg["content"]}]})
    resp = await client.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GOOGLE_API_KEY}",
        headers={"Content-Type": "application/json"},
        json={
            "system_instruction": {"parts": [{"text": system}]},
            "contents": contents,
            "generationConfig": {"maxOutputTokens": max_tokens},
        },
    )
    if resp.status_code == 200:
        data = resp.json()
        candidates = data.get("candidates", [])
        text = ""
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            text = parts[0].get("text", "") if parts else ""
        tokens_meta = data.get("usageMetadata", {})
        tokens = tokens_meta.get("totalTokenCount", 0)
        return True, text, tokens, resp.status_code
    return False, None, 0, resp.status_code


_PROVIDER_CALLERS = {
    PROVIDER_CLAUDE: _call_claude_api,
    PROVIDER_OPENAI: _call_openai_api,
    PROVIDER_GEMINI: _call_gemini_api,
}


# ─── MAIN FALLBACK CALL ───

async def call_ai_with_fallback(
    messages: list,
    system: str = None,
    max_tokens: int = 1024,
    log_callback=None,
) -> dict:
    global _active_provider

    if system is None:
        from app.main import _knowledge_cache, _build_basic_system_prompt
        system = _knowledge_cache.get("system_prompt") or _build_basic_system_prompt()

    no_keys = all(not _get_api_key(p) for p in PROVIDER_CHAIN)
    if no_keys:
        return {
            "text": "⚙️ AI features require an API key. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY to enable Stairs AI.",
            "tokens": 0,
            "provider": "none",
            "fallback_used": False,
        }

    fallback_used = False
    original_provider = _active_provider

    async with httpx.AsyncClient(timeout=60) as client:
        for provider_idx, provider in enumerate(PROVIDER_CHAIN):
            api_key = _get_api_key(provider)
            if not api_key:
                continue

            adapted_system = adapt_system_prompt(system, provider)
            adapted_messages = adapt_messages(messages, provider)
            caller = _PROVIDER_CALLERS[provider]

            for attempt in range(1, RETRIES_PER_PROVIDER + 1):
                start_time = time.time()
                try:
                    success, text, tokens, status_code = await caller(
                        client, adapted_messages, adapted_system, max_tokens
                    )
                    elapsed = time.time() - start_time

                    if success:
                        _record_success(provider)
                        _active_provider = provider

                        if log_callback:
                            await log_callback(
                                provider=provider,
                                success=True,
                                response_time_ms=int(elapsed * 1000),
                                tokens_used=tokens,
                                status_code=status_code,
                                fallback_used=fallback_used,
                                fallback_from=original_provider if fallback_used else None,
                            )

                        if fallback_used:
                            logger.warning(
                                "🔄 AI FALLBACK SWITCH: %s → %s (original provider failed after retries)",
                                original_provider.upper(), provider.upper(),
                            )
                            _record_fallback_switch()

                        return {
                            "text": text,
                            "tokens": tokens,
                            "provider": provider,
                            "fallback_used": fallback_used,
                        }

                    # Non-success response
                    _record_failure(provider)
                    if log_callback:
                        await log_callback(
                            provider=provider,
                            success=False,
                            response_time_ms=int(elapsed * 1000),
                            tokens_used=0,
                            status_code=status_code,
                            fallback_used=fallback_used,
                            fallback_from=None,
                        )

                    if status_code not in FALLBACK_STATUS_CODES and status_code < 500:
                        # Client error (4xx except those we handle) — don't retry
                        return {
                            "text": f"AI service returned status {status_code}. Please try again.",
                            "tokens": 0,
                            "provider": provider,
                            "fallback_used": fallback_used,
                        }

                    if attempt < RETRIES_PER_PROVIDER:
                        logger.warning(
                            "AI provider %s returned %d, retrying in %ds (attempt %d/%d)",
                            provider, status_code, RETRY_DELAY_SECONDS, attempt, RETRIES_PER_PROVIDER,
                        )
                        await asyncio.sleep(RETRY_DELAY_SECONDS)
                    else:
                        logger.warning(
                            "AI provider %s failed after %d attempts (last status: %d), moving to next provider",
                            provider, RETRIES_PER_PROVIDER, status_code,
                        )

                except Exception as exc:
                    elapsed = time.time() - start_time
                    _record_failure(provider)
                    logger.error("AI provider %s exception: %s", provider, exc)

                    if log_callback:
                        await log_callback(
                            provider=provider,
                            success=False,
                            response_time_ms=int(elapsed * 1000),
                            tokens_used=0,
                            status_code=0,
                            fallback_used=fallback_used,
                            fallback_from=None,
                            error_message=str(exc),
                        )

                    if attempt < RETRIES_PER_PROVIDER:
                        logger.warning("Retrying %s in %ds...", provider, RETRY_DELAY_SECONDS)
                        await asyncio.sleep(RETRY_DELAY_SECONDS)
                    else:
                        logger.warning("Provider %s exhausted after %d attempts, moving to next", provider, RETRIES_PER_PROVIDER)

            # Mark fallback for subsequent providers
            fallback_used = True

    # All providers failed
    logger.error(
        "🚨 ALL AI PROVIDERS FAILED — Claude, OpenAI, and Gemini all returned errors. "
        "Check API keys and provider status."
    )
    return {
        "text": (
            "All AI services are temporarily unavailable. "
            "Your existing strategies and plans are still accessible. "
            "Please try again in a few minutes."
        ),
        "tokens": 0,
        "provider": "none",
        "fallback_used": True,
    }
