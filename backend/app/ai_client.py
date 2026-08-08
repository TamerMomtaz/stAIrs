"""
Stairs — Resilient Anthropic Client

WHY THIS FILE EXISTS
────────────────────
On 2026-08-08 every AI feature in Stairs returned:

    "AI service returned status 404. Please try again."

Root cause: CLAUDE_MODEL was pinned to `claude-sonnet-4-20250514`, which
Anthropic retired on 2026-06-15. Requests to a retired model id come back
as HTTP 404 `not_found_error`, and the old call path put that raw status
straight into the client-facing chat bubble inside an HTTP 200 — so the
browser could not tell it apart from a real answer.

This module removes that failure mode:

  1. SELF-HEALING MODEL RESOLUTION
     Asks Anthropic GET /v1/models which models this API key can actually
     serve, then picks the best one from a preference chain. A future
     retirement heals itself instead of taking the product down.

  2. AUTOMATIC FAILOVER
     404 (or a 400 that mentions the model) on one model transparently
     retries the next model in the chain and re-pins the winner.
     429 / 5xx get exponential backoff honouring Retry-After.

  3. NO RAW ERRORS IN FRONT OF CLIENTS
     No status code, vendor name, model id, or traceback ever reaches the
     browser. Users get calm bilingual (EN/AR) copy. Engineers get the
     full upstream body in the logs.

  4. OBSERVABILITY
     GET /api/v1/ai/status — live model, models visible to the key,
     degraded flag, success rate. POST /api/v1/ai/status/refresh forces a
     re-resolve without a redeploy.

DROP-IN COMPATIBLE: call_claude() keeps the same signature and return
shape as before — result["content"][0]["text"] and
result["usage"]["input_tokens"|"output_tokens"] still work unchanged.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("stairs.ai")


# ─────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────

# Preference chain, best → cheapest. Override with CLAUDE_MODEL_CHAIN
# (comma-separated) if you want different economics.
DEFAULT_MODEL_CHAIN = [
    "claude-sonnet-4-6",            # best speed/intelligence balance
    "claude-sonnet-4-5-20250929",   # still active
    "claude-opus-4-5",              # heavier, pricier
    "claude-haiku-4-5",             # cheap last resort — better than nothing
]

# Model ids Anthropic has already retired. We refuse to even try these, so
# a stale env var costs 0ms instead of a failed round-trip in front of a
# client. call_claude() adds to this set at runtime when a model 404s.
BASE_RETIRED_MODEL_IDS = frozenset({
    "claude-sonnet-4-20250514",
    "claude-opus-4-20250514",
    "claude-opus-4-1-20250805",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-20240620",
    "claude-3-5-haiku-20241022",
    "claude-3-haiku-20240307",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-2.1",
    "claude-2.0",
    "claude-instant-1.2",
})

RETIRED_MODEL_IDS = set(BASE_RETIRED_MODEL_IDS)

# Populated by reload_config() below — module-level so operators can read
# them and tests can monkeypatch them.
ANTHROPIC_API_KEY = ""
ANTHROPIC_BASE_URL = "https://api.anthropic.com"
ANTHROPIC_VERSION = "2023-06-01"
CONFIGURED_MODEL = ""
MODEL_CHAIN: List[str] = list(DEFAULT_MODEL_CHAIN)
REQUEST_TIMEOUT = 90.0
MODEL_CACHE_TTL = 21600  # 6h
MAX_TRANSIENT_RETRIES = 2
MAX_BACKOFF_SECONDS = 10.0

DEFAULT_SYSTEM_PROMPT = "You are Stairs, an AI strategy assistant by DEVONEERS."


def reload_config() -> None:
    """Re-read every tunable from the environment.

    Called at import and from POST /api/v1/ai/status/refresh so an operator
    who fixes CLAUDE_MODEL does not have to wait for a redeploy.
    """
    global ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_VERSION
    global CONFIGURED_MODEL, MODEL_CHAIN, REQUEST_TIMEOUT
    global MODEL_CACHE_TTL, MAX_TRANSIENT_RETRIES

    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
    ANTHROPIC_BASE_URL = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")
    ANTHROPIC_VERSION = os.getenv("ANTHROPIC_VERSION", "2023-06-01")
    # Operator override. Honoured FIRST — but if it is retired or 404s we
    # heal past it instead of dying, and we shout about it in the logs.
    CONFIGURED_MODEL = os.getenv("CLAUDE_MODEL", "").strip()
    MODEL_CHAIN = [
        m.strip() for m in os.getenv("CLAUDE_MODEL_CHAIN", "").split(",") if m.strip()
    ] or list(DEFAULT_MODEL_CHAIN)
    REQUEST_TIMEOUT = float(os.getenv("AI_TIMEOUT_SECONDS", "90"))
    MODEL_CACHE_TTL = int(os.getenv("AI_MODEL_CACHE_SECONDS", "21600"))
    MAX_TRANSIENT_RETRIES = int(os.getenv("AI_MAX_RETRIES", "2"))


reload_config()


# ─────────────────────────────────────────────────────────────────
# CLIENT-SAFE MESSAGES  (never leak a status code to a customer)
# ─────────────────────────────────────────────────────────────────

USER_MESSAGES = {
    "no_key": {
        "en": "The strategy assistant isn't switched on for this workspace yet. "
              "You can continue building your staircase manually — nothing is lost.",
        "ar": "لم يتم تفعيل مساعد الاستراتيجية لمساحة العمل هذه بعد. "
              "يمكنك متابعة بناء السلّم يدويًا — لن تفقد أي بيانات.",
    },
    "unavailable": {
        "en": "The strategy assistant is taking a moment. Your inputs are saved — "
              "try again, or continue manually and generate later.",
        "ar": "مساعد الاستراتيجية يحتاج لحظة. تم حفظ مدخلاتك — "
              "حاول مرة أخرى، أو تابع يدويًا وقم بالتوليد لاحقًا.",
    },
    "busy": {
        "en": "The strategy assistant is busy right now. Give it about thirty seconds "
              "and try again — your inputs are saved.",
        "ar": "مساعد الاستراتيجية مشغول حاليًا. انتظر حوالي ثلاثين ثانية "
              "ثم حاول مجددًا — تم حفظ مدخلاتك.",
    },
    "too_long": {
        "en": "That request is larger than the assistant can take in one pass. "
              "Try narrowing it to a single objective and generating again.",
        "ar": "هذا الطلب أكبر مما يمكن للمساعد معالجته دفعة واحدة. "
              "جرّب تضييقه إلى هدف واحد وأعد التوليد.",
    },
    "offline": {
        "en": "The strategy assistant can't be reached at the moment. Your inputs are "
              "saved — try again shortly, or continue manually.",
        "ar": "تعذّر الوصول إلى مساعد الاستراتيجية حاليًا. تم حفظ مدخلاتك — "
              "أعد المحاولة بعد قليل، أو تابع يدويًا.",
    },
}


def user_message(kind: str, lang: str = "en") -> str:
    """Client-safe copy for a failure kind. Never contains plumbing."""
    block = USER_MESSAGES.get(kind) or USER_MESSAGES["unavailable"]
    return block.get(lang) or block["en"]


# ─────────────────────────────────────────────────────────────────
# RUNTIME STATE
# ─────────────────────────────────────────────────────────────────

def _blank_state() -> Dict[str, Any]:
    return {
        "active_model": None,       # model we believe works right now
        "available_models": [],     # what /v1/models reported for this key
        "resolved_at": 0.0,
        "degraded": False,          # True when we're not on the operator's first choice
        "configured_model_ok": None,
        "last_error": None,         # engineer-facing, never returned to the browser
        "last_status": 0,           # last upstream HTTP status (0 = transport error)
        "last_success_at": None,
        "calls_ok": 0,
        "calls_failed": 0,
    }


_state: Dict[str, Any] = _blank_state()
_resolve_lock = asyncio.Lock()


def reset_state() -> None:
    """Drop every cached decision and counter. Used by tests and by anyone
    who needs a genuinely cold start without a process restart."""
    global _state
    _state = _blank_state()
    RETIRED_MODEL_IDS.clear()
    RETIRED_MODEL_IDS.update(BASE_RETIRED_MODEL_IDS)


def _headers() -> Dict[str, str]:
    return {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }


def _tier_rank(model_id: str) -> tuple:
    """Rough 'newest and strongest first' ordering for discovered models."""
    mid = model_id.lower()
    tier = 1 if "sonnet" in mid else (0 if "opus" in mid else -1)  # sonnet preferred
    # pull the version number out: claude-sonnet-4-6 -> 4.6 ; claude-sonnet-5 -> 5.0
    digits = []
    for part in mid.replace("claude-", "").split("-"):
        if part.isdigit() and len(part) <= 2:
            digits.append(int(part))
    version = digits[0] + (digits[1] / 10 if len(digits) > 1 else 0) if digits else 0
    return (version, tier)


async def _list_models() -> List[str]:
    """Ask Anthropic what this API key can actually serve.

    Never raises — discovery is an optimisation, not a dependency.
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{ANTHROPIC_BASE_URL}/v1/models",
                headers=_headers(),
                params={"limit": 100},
                timeout=20,
            )
        if resp.status_code != 200:
            log.warning("[ai] /v1/models returned %s: %s", resp.status_code, resp.text[:300])
            return []
        payload = resp.json()
        ids = [m.get("id") for m in payload.get("data", []) if m.get("id")]
        return [i for i in ids if i not in RETIRED_MODEL_IDS]
    except Exception as exc:  # network, DNS, parse — never fatal
        log.warning("[ai] /v1/models discovery failed: %s", exc)
        return []


def _candidate_order() -> List[str]:
    """Operator's pick first, then the preference chain — de-duplicated,
    retired ids stripped out."""
    ordered: List[str] = []
    if CONFIGURED_MODEL and CONFIGURED_MODEL not in RETIRED_MODEL_IDS:
        ordered.append(CONFIGURED_MODEL)
    for m in MODEL_CHAIN:
        if m not in ordered and m not in RETIRED_MODEL_IDS:
            ordered.append(m)
    return ordered


async def resolve_model(force: bool = False) -> Optional[str]:
    """Decide which model to use. Cached for MODEL_CACHE_TTL (default 6h)."""
    if not ANTHROPIC_API_KEY:
        return None

    fresh = (time.time() - _state["resolved_at"]) < MODEL_CACHE_TTL
    if _state["active_model"] and fresh and not force:
        return _state["active_model"]

    async with _resolve_lock:
        # Another coroutine may have resolved while we waited on the lock.
        if (
            _state["active_model"]
            and not force
            and (time.time() - _state["resolved_at"]) < MODEL_CACHE_TTL
        ):
            return _state["active_model"]

        if CONFIGURED_MODEL and CONFIGURED_MODEL in RETIRED_MODEL_IDS:
            log.error(
                "[ai] CLAUDE_MODEL=%s is a RETIRED model id. Ignoring it and "
                "auto-selecting a live model. Fix the CLAUDE_MODEL environment "
                "variable to silence this.",
                CONFIGURED_MODEL,
            )
            _state["configured_model_ok"] = False

        available = await _list_models()
        _state["available_models"] = available
        candidates = _candidate_order()

        chosen = None
        if available:
            for cand in candidates:
                if cand in available:
                    chosen = cand
                    break
            if not chosen:
                # Nothing from our chain is served by this key — take the
                # newest/strongest thing the key CAN serve. Still ships.
                chosen = sorted(available, key=_tier_rank, reverse=True)[0]
                log.warning(
                    "[ai] none of the preferred models are available to this key; "
                    "auto-selected %s from %s", chosen, available,
                )
        else:
            # Discovery unavailable (offline, older key scope). Optimistically
            # take the first non-retired candidate; call-time failover covers us.
            chosen = candidates[0] if candidates else None

        _state["active_model"] = chosen
        _state["resolved_at"] = time.time()
        _state["degraded"] = bool(CONFIGURED_MODEL and chosen and chosen != CONFIGURED_MODEL)
        if _state["configured_model_ok"] is None and CONFIGURED_MODEL:
            _state["configured_model_ok"] = chosen == CONFIGURED_MODEL

        log.info(
            "[ai] active model: %s | configured: %s | %d models visible to this key",
            chosen, CONFIGURED_MODEL or "(unset)", len(available),
        )
        return chosen


async def warmup() -> Dict[str, Any]:
    """Call once on FastAPI startup so a broken key or a retired CLAUDE_MODEL
    shows up in the Railway boot log — not in front of a client."""
    if not ANTHROPIC_API_KEY:
        log.error("[ai] ANTHROPIC_API_KEY is not set — Claude is unavailable.")
        return {"ok": False, "reason": "no_api_key"}
    try:
        model = await resolve_model(force=True)
    except Exception as exc:  # startup must never be the thing that fails
        log.error("[ai] warmup failed: %s", exc)
        return {"ok": False, "reason": "resolve_failed"}
    if not model:
        log.error("[ai] could not resolve any usable Claude model.")
        return {"ok": False, "reason": "no_model"}
    log.info("[ai] warmup complete — Stairs AI is live on %s", model)
    return {"ok": True, "model": model, "available": list(_state["available_models"])}


# ─────────────────────────────────────────────────────────────────
# THE CALL
# ─────────────────────────────────────────────────────────────────

def _envelope(kind: str, *, model: str = "", lang: str = "en") -> Dict[str, Any]:
    """A failure in the exact shape the rest of Stairs already expects.

    content[0].text holds client-safe copy only — callers that render it
    blindly still show something presentable.
    """
    text = user_message(kind, lang)
    return {
        "content": [{"type": "text", "text": text}],
        "usage": {"input_tokens": 0, "output_tokens": 0},
        "ok": False,
        "error_kind": kind,
        "user_message": text,
        "user_message_ar": user_message(kind, "ar"),
        "model": model or None,
    }


def _is_model_error(status: int, body: str) -> bool:
    """404 == unknown/retired model id. A 400 that mentions the model is the
    same thing wearing a different hat."""
    if status == 404:
        return True
    if status == 400 and "model" in body.lower():
        return True
    return False


def _is_too_long(status: int, body: str) -> bool:
    lowered = body.lower()
    return status == 413 or "max_tokens" in lowered or "too long" in lowered


def _retry_delay(resp: httpx.Response, attempt: int) -> float:
    """Honour Retry-After when the server sends a sane one, else exponential."""
    retry_after = (resp.headers.get("retry-after") or "").strip()
    try:
        if retry_after:
            return min(float(retry_after), MAX_BACKOFF_SECONDS)
    except ValueError:
        pass  # Retry-After can be an HTTP-date; fall through to exponential
    return min(1.5 * (2 ** attempt), MAX_BACKOFF_SECONDS)


def _default_system() -> str:
    """Reuse the Knowledge Engine system prompt when the app has one."""
    try:
        from app.main import _knowledge_cache, _build_basic_system_prompt
        return _knowledge_cache.get("system_prompt") or _build_basic_system_prompt()
    except Exception:
        return DEFAULT_SYSTEM_PROMPT


async def call_claude(
    messages: list,
    system: Optional[str] = None,
    max_tokens: int = 1024,
    lang: str = "en",
) -> Dict[str, Any]:
    """Drop-in replacement for the old call_claude().

    On success returns the Anthropic response dict (so
    result["content"][0]["text"] and result["usage"][...] keep working) with
    ok=True, error_kind=None and model added.

    On failure returns the SAME shape with client-safe copy in
    content[0].text, ok=False and an error_kind of
    no_key | unavailable | busy | too_long | offline.
    """
    if system is None:
        system = _default_system()

    if not ANTHROPIC_API_KEY:
        log.error("[ai] request rejected: ANTHROPIC_API_KEY is not set")
        _state["calls_failed"] += 1
        _state["last_error"] = "ANTHROPIC_API_KEY is not set"
        return _envelope("no_key", lang=lang)

    model = await resolve_model()
    if not model:
        _state["calls_failed"] += 1
        return _envelope("unavailable", lang=lang)

    # Try the active model, then walk the chain if it turns out to be dead.
    tried: List[str] = []
    chain = [model] + [m for m in _candidate_order() if m != model]
    last_kind = "unavailable"

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        for candidate in chain:
            if candidate in tried or candidate in RETIRED_MODEL_IDS:
                continue
            tried.append(candidate)

            for attempt in range(MAX_TRANSIENT_RETRIES + 1):
                try:
                    resp = await client.post(
                        f"{ANTHROPIC_BASE_URL}/v1/messages",
                        headers=_headers(),
                        json={
                            "model": candidate,
                            "max_tokens": max_tokens,
                            "system": system,
                            "messages": messages,
                        },
                    )
                except (httpx.TimeoutException, httpx.TransportError) as exc:
                    _state["last_error"] = f"{type(exc).__name__}: {exc}"
                    _state["last_status"] = 0
                    last_kind = "offline"
                    log.warning(
                        "[ai] %s on %s (attempt %d/%d)",
                        type(exc).__name__, candidate, attempt + 1, MAX_TRANSIENT_RETRIES + 1,
                    )
                    if attempt < MAX_TRANSIENT_RETRIES:
                        await asyncio.sleep(min(1.5 * (2 ** attempt), MAX_BACKOFF_SECONDS))
                        continue
                    break  # next model

                if resp.status_code == 200:
                    if candidate != _state["active_model"]:
                        log.warning("[ai] failed over to %s — pinning it as active", candidate)
                        _state["active_model"] = candidate
                        _state["resolved_at"] = time.time()
                        _state["degraded"] = bool(
                            CONFIGURED_MODEL and candidate != CONFIGURED_MODEL
                        )
                    _state["calls_ok"] += 1
                    _state["last_success_at"] = time.time()
                    _state["last_error"] = None
                    _state["last_status"] = 200
                    data = resp.json()
                    data["ok"] = True
                    data["error_kind"] = None
                    data["model"] = candidate
                    return data

                body = resp.text[:800]
                _state["last_error"] = f"HTTP {resp.status_code} on {candidate}: {body}"
                _state["last_status"] = resp.status_code

                # ── dead / unknown model → heal to the next one ──
                if _is_model_error(resp.status_code, body):
                    log.error(
                        "[ai] model '%s' rejected (HTTP %s). It is most likely RETIRED. "
                        "Failing over to the next model. Upstream said: %s",
                        candidate, resp.status_code, body,
                    )
                    RETIRED_MODEL_IDS.add(candidate)  # don't try it again this process
                    if _state["active_model"] == candidate:
                        _state["active_model"] = None
                    _state["resolved_at"] = 0  # force a fresh resolve next call
                    last_kind = "unavailable"
                    break  # next model in chain

                # ── auth / billing → no amount of retrying helps ──
                if resp.status_code in (401, 403):
                    log.error(
                        "[ai] auth/permission failure (HTTP %s) — check ANTHROPIC_API_KEY "
                        "and its billing status. Upstream said: %s",
                        resp.status_code, body,
                    )
                    _state["calls_failed"] += 1
                    return _envelope("unavailable", model=candidate, lang=lang)

                # ── payload too large → asking again changes nothing ──
                if _is_too_long(resp.status_code, body):
                    log.warning("[ai] request too large on %s: %s", candidate, body)
                    _state["calls_failed"] += 1
                    return _envelope("too_long", model=candidate, lang=lang)

                # ── rate limit / overloaded / server error → backoff ──
                if resp.status_code in (429, 500, 502, 503, 504, 529):
                    last_kind = "busy" if resp.status_code == 429 else "unavailable"
                    log.warning(
                        "[ai] transient HTTP %s on %s (attempt %d/%d): %s",
                        resp.status_code, candidate, attempt + 1,
                        MAX_TRANSIENT_RETRIES + 1, body,
                    )
                    if attempt < MAX_TRANSIENT_RETRIES:
                        await asyncio.sleep(_retry_delay(resp, attempt))
                        continue
                    break  # next model

                # ── anything else ──
                log.error("[ai] unexpected HTTP %s on %s: %s", resp.status_code, candidate, body)
                last_kind = "unavailable"
                break  # next model

    _state["calls_failed"] += 1
    log.error("[ai] all models exhausted. Tried: %s. Last error: %s", tried, _state["last_error"])
    return _envelope(last_kind, lang=lang)


# ─────────────────────────────────────────────────────────────────
# DIAGNOSTICS
# ─────────────────────────────────────────────────────────────────

def status_snapshot() -> Dict[str, Any]:
    total = _state["calls_ok"] + _state["calls_failed"]
    return {
        "ai_enabled": bool(ANTHROPIC_API_KEY),
        "active_model": _state["active_model"],
        "configured_model": CONFIGURED_MODEL or None,
        "configured_model_is_retired": (
            CONFIGURED_MODEL in RETIRED_MODEL_IDS if CONFIGURED_MODEL else False
        ),
        "degraded": _state["degraded"],
        "models_available_to_key": list(_state["available_models"]),
        "preference_chain": _candidate_order(),
        "calls_ok": _state["calls_ok"],
        "calls_failed": _state["calls_failed"],
        "success_rate": round(_state["calls_ok"] / total * 100, 1) if total else None,
        "last_success_at": _state["last_success_at"],
        "last_error": _state["last_error"],
        "resolved_at": _state["resolved_at"],
    }


try:
    from fastapi import APIRouter

    router = APIRouter(prefix="/api/v1/ai", tags=["ai-health"])

    @router.get("/status")
    async def ai_status():
        """Is the strategy assistant actually alive? One call, straight answer."""
        if ANTHROPIC_API_KEY and not _state["active_model"]:
            await resolve_model()
        snap = status_snapshot()
        snap["healthy"] = bool(snap["ai_enabled"] and snap["active_model"])
        return snap

    @router.post("/status/refresh")
    async def ai_status_refresh():
        """Force re-discovery after changing CLAUDE_MODEL — no redeploy needed."""
        reload_config()
        model = await resolve_model(force=True)
        snap = status_snapshot()
        snap["healthy"] = bool(snap["ai_enabled"] and snap["active_model"])
        return {"refreshed": True, "active_model": model, **snap}

except ImportError:  # pragma: no cover — module stays usable without FastAPI
    router = None
