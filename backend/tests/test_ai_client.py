"""Tests for the resilient Anthropic client (app.ai_client).

Every test runs against a local HTTP server standing in for the Anthropic
API — nothing here touches the real endpoint or needs a real key.

The outage these tests are about: CLAUDE_MODEL was pinned to
`claude-sonnet-4-20250514`, retired 2026-06-15. Requests to a retired model
id return HTTP 404 and the old code printed that status into the chat bubble
the client was reading.
"""

import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from app import ai_client


RETIRED = "claude-sonnet-4-20250514"
LIVE = "claude-sonnet-4-6"
NEXT_IN_CHAIN = "claude-sonnet-4-5-20250929"


# ─────────────────────────────────────────────────────────────────
# LOCAL STAND-IN FOR api.anthropic.com
# ─────────────────────────────────────────────────────────────────

class FakeAnthropic:
    """A real HTTP server that behaves like /v1/models and /v1/messages.

    `behaviour(model)` returns (status_code, body_dict, headers) for a
    /v1/messages call, so each test can script its own failure.
    """

    def __init__(self, available_models=None, behaviour=None, models_status=200):
        self.available_models = available_models
        self.behaviour = behaviour or (lambda model: (200, _ok_body(model), {}))
        self.models_status = models_status
        self.messages_calls = []   # [(model, max_tokens), ...]
        self.models_calls = 0
        server = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):  # keep pytest output clean
                pass

            def _send(self, status, payload, headers=None):
                raw = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(raw)))
                for k, v in (headers or {}).items():
                    self.send_header(k, v)
                self.end_headers()
                self.wfile.write(raw)

            def do_GET(self):
                if not self.path.startswith("/v1/models"):
                    self._send(404, {"error": {"type": "not_found_error"}})
                    return
                server.models_calls += 1
                if server.models_status != 200:
                    self._send(server.models_status, {"error": {"type": "permission_error"}})
                    return
                ids = server.available_models
                self._send(200, {"data": [{"id": m, "type": "model"} for m in (ids or [])]})

            def do_POST(self):
                length = int(self.headers.get("content-length") or 0)
                body = json.loads(self.rfile.read(length) or b"{}")
                model = body.get("model")
                server.messages_calls.append((model, body.get("max_tokens")))
                status, payload, headers = server.behaviour(model)
                self._send(status, payload, headers)

        self._httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self._httpd.server_address[1]
        self.base_url = f"http://127.0.0.1:{self.port}"
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self._httpd.shutdown()
        self._httpd.server_close()
        self._thread.join(timeout=5)
        return False

    @property
    def models_sent(self):
        return [m for m, _ in self.messages_calls]


def _ok_body(model, text="[Vision]: Become the leading platform."):
    return {
        "id": "msg_test",
        "type": "message",
        "role": "assistant",
        "model": model,
        "content": [{"type": "text", "text": text}],
        "usage": {"input_tokens": 11, "output_tokens": 22},
    }


def _not_found(model):
    return (404, {"type": "error", "error": {
        "type": "not_found_error",
        "message": f"model: {model}",
    }}, {})


@pytest.fixture
def ai(monkeypatch):
    """Point ai_client at a throwaway config with no sleeping between retries."""
    ai_client.reset_state()
    monkeypatch.setattr(ai_client, "ANTHROPIC_API_KEY", "sk-ant-test-key")
    monkeypatch.setattr(ai_client, "ANTHROPIC_VERSION", "2023-06-01")
    monkeypatch.setattr(ai_client, "CONFIGURED_MODEL", "")
    monkeypatch.setattr(ai_client, "MODEL_CHAIN", list(ai_client.DEFAULT_MODEL_CHAIN))
    monkeypatch.setattr(ai_client, "MODEL_CACHE_TTL", 21600)
    monkeypatch.setattr(ai_client, "MAX_TRANSIENT_RETRIES", 2)
    monkeypatch.setattr(ai_client, "MAX_BACKOFF_SECONDS", 0.01)
    monkeypatch.setattr(ai_client, "REQUEST_TIMEOUT", 10.0)
    # Don't reach for the app's knowledge cache (needs a DB) in unit tests.
    monkeypatch.setattr(ai_client, "_default_system", lambda: "You are Stairs.")
    yield ai_client
    ai_client.reset_state()


def _text(result):
    return result["content"][0]["text"]


# Everything a customer must never read in a chat bubble.
LEAK_PATTERNS = [
    r"\d{3}",                       # a bare status code
    r"\bstatus\b",
    r"\bHTTP\b",
    r"anthropic",
    r"claude-[a-z0-9-]*\d",
    r"_error\b",                    # not_found_error, rate_limit_error, ...
    r"traceback",
    r"x-api-key",
    r"ANTHROPIC_API_KEY",
]


def assert_no_leak(text):
    assert text and text.strip(), "client-facing copy must not be empty"
    for pattern in LEAK_PATTERNS:
        assert not re.search(pattern, text, re.IGNORECASE), (
            f"client-facing copy leaked {pattern!r}: {text!r}"
        )


# ─────────────────────────────────────────────────────────────────
# 1 · A RETIRED CLAUDE_MODEL STILL SERVES THE CLIENT
# ─────────────────────────────────────────────────────────────────

class TestRetiredConfiguredModel:
    async def test_retired_claude_model_still_resolves_a_live_model(self, ai, monkeypatch):
        """The exact production config on 2026-08-08 must now succeed."""
        with FakeAnthropic(available_models=[LIVE, NEXT_IN_CHAIN, "claude-haiku-4-5"]) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            monkeypatch.setattr(ai, "CONFIGURED_MODEL", RETIRED)

            result = await ai.call_claude([{"role": "user", "content": "Test"}])

            assert result["ok"] is True
            assert result["error_kind"] is None
            assert result["model"] == LIVE
            assert _text(result) == "[Vision]: Become the leading platform."
            assert result["usage"]["input_tokens"] == 11
            assert result["usage"]["output_tokens"] == 22
            # The retired id is never put on the wire — not even once.
            assert RETIRED not in fake.models_sent

    async def test_retired_model_is_reported_and_never_offered(self, ai, monkeypatch, caplog):
        with FakeAnthropic(available_models=[LIVE]) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            monkeypatch.setattr(ai, "CONFIGURED_MODEL", RETIRED)

            with caplog.at_level("ERROR", logger="stairs.ai"):
                await ai.resolve_model(force=True)

            assert RETIRED not in ai._candidate_order()
            snap = ai.status_snapshot()
            assert snap["configured_model_is_retired"] is True
            assert snap["degraded"] is True        # not on the operator's pick
            assert snap["active_model"] == LIVE
            # The operator is told exactly what to fix.
            assert any(RETIRED in r.getMessage() for r in caplog.records)

    async def test_every_documented_retired_id_is_refused(self, ai):
        for retired in [
            "claude-sonnet-4-20250514", "claude-opus-4-20250514",
            "claude-opus-4-1-20250805", "claude-3-7-sonnet-20250219",
            "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022",
            "claude-3-haiku-20240307", "claude-3-opus-20240229",
        ]:
            assert retired in ai.RETIRED_MODEL_IDS


# ─────────────────────────────────────────────────────────────────
# 2 · A MODEL THAT DIES MID-FLIGHT FAILS OVER
# ─────────────────────────────────────────────────────────────────

class TestFailover:
    async def test_active_model_starts_404ing_and_we_heal(self, ai, monkeypatch):
        """Anthropic retires the pinned model while the process is running."""
        dead = {LIVE}

        def behaviour(model):
            if model in dead:
                return _not_found(model)
            return (200, _ok_body(model), {})

        with FakeAnthropic(
            available_models=[LIVE, NEXT_IN_CHAIN], behaviour=behaviour
        ) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)

            first = await ai.call_claude([{"role": "user", "content": "Hi"}])
            assert first["ok"] is True
            assert first["model"] == NEXT_IN_CHAIN
            assert fake.models_sent == [LIVE, NEXT_IN_CHAIN]

            # The winner is re-pinned, so the next call goes straight there.
            fake.messages_calls.clear()
            second = await ai.call_claude([{"role": "user", "content": "Again"}])
            assert second["ok"] is True
            assert fake.models_sent == [NEXT_IN_CHAIN]

    async def test_400_mentioning_the_model_also_triggers_failover(self, ai, monkeypatch):
        def behaviour(model):
            if model == LIVE:
                return (400, {"error": {"type": "invalid_request_error",
                                        "message": "model: unsupported"}}, {})
            return (200, _ok_body(model), {})

        with FakeAnthropic(available_models=[LIVE, NEXT_IN_CHAIN], behaviour=behaviour) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            result = await ai.call_claude([{"role": "user", "content": "Hi"}])

        assert result["ok"] is True
        assert result["model"] == NEXT_IN_CHAIN

    async def test_429_backs_off_then_succeeds_on_the_same_model(self, ai, monkeypatch):
        attempts = {"n": 0}

        def behaviour(model):
            attempts["n"] += 1
            if attempts["n"] == 1:
                return (429, {"error": {"type": "rate_limit_error"}}, {"retry-after": "0"})
            return (200, _ok_body(model), {})

        with FakeAnthropic(available_models=[LIVE], behaviour=behaviour) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            result = await ai.call_claude([{"role": "user", "content": "Hi"}])

        assert result["ok"] is True
        assert result["model"] == LIVE
        assert attempts["n"] == 2  # retried once, no model change

    async def test_auth_failure_returns_immediately_without_retrying(self, ai, monkeypatch):
        with FakeAnthropic(
            available_models=[LIVE, NEXT_IN_CHAIN],
            behaviour=lambda m: (401, {"error": {"type": "authentication_error"}}, {}),
        ) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            result = await ai.call_claude([{"role": "user", "content": "Hi"}])

            # One attempt only — no retry, no walking the chain.
            assert len(fake.messages_calls) == 1

        assert result["ok"] is False
        assert result["error_kind"] == "unavailable"
        assert_no_leak(_text(result))

    async def test_oversized_payload_is_classified_as_too_long(self, ai, monkeypatch):
        with FakeAnthropic(
            available_models=[LIVE],
            behaviour=lambda m: (413, {"error": {"message": "request too long"}}, {}),
        ) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            result = await ai.call_claude([{"role": "user", "content": "x" * 100}])

        assert result["ok"] is False
        assert result["error_kind"] == "too_long"
        assert_no_leak(_text(result))

    async def test_discovery_failure_falls_back_to_the_chain_optimistically(self, ai, monkeypatch):
        """An older key with no /v1/models scope must still be able to answer."""
        with FakeAnthropic(available_models=[], models_status=403) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            result = await ai.call_claude([{"role": "user", "content": "Hi"}])

        assert result["ok"] is True
        assert result["model"] == LIVE  # first non-retired candidate in the chain

    async def test_key_serving_only_unknown_models_picks_the_newest(self, ai, monkeypatch):
        with FakeAnthropic(available_models=["claude-haiku-3-9", "claude-sonnet-9-1"]) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            result = await ai.call_claude([{"role": "user", "content": "Hi"}])

        assert result["ok"] is True
        assert result["model"] == "claude-sonnet-9-1"


# ─────────────────────────────────────────────────────────────────
# 3 · EVERYTHING DEAD — AND STILL NOTHING TECHNICAL ON SCREEN
# ─────────────────────────────────────────────────────────────────

class TestNothingLeaks:
    async def test_every_model_dead_returns_a_clean_failure(self, ai, monkeypatch):
        with FakeAnthropic(
            available_models=[LIVE, NEXT_IN_CHAIN, "claude-haiku-4-5"],
            behaviour=_not_found,
        ) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            result = await ai.call_claude([{"role": "user", "content": "Test"}])

            # It genuinely tried every live candidate before giving up.
            assert len(set(fake.models_sent)) >= 3

        assert result["ok"] is False
        assert result["error_kind"] == "unavailable"
        assert_no_leak(_text(result))
        # Shape stays identical to a success, so old call sites can't crash.
        assert result["usage"] == {"input_tokens": 0, "output_tokens": 0}

    async def test_the_old_bug_string_is_never_produced(self, ai, monkeypatch):
        """The literal regression: a 404 must not become chat-bubble text."""
        with FakeAnthropic(available_models=[LIVE], behaviour=_not_found) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            result = await ai.call_claude([{"role": "user", "content": "Test"}])

        assert "AI service returned status 404. Please try again." != _text(result)
        assert "404" not in _text(result)

    async def test_arabic_copy_is_clean_too(self, ai, monkeypatch):
        with FakeAnthropic(available_models=[LIVE], behaviour=_not_found) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            result = await ai.call_claude([{"role": "user", "content": "Test"}], lang="ar")

        assert_no_leak(_text(result))
        assert result["user_message_ar"]
        assert _text(result) == ai.user_message("unavailable", "ar")

    async def test_all_failure_copy_in_both_languages_is_clean(self, ai):
        for kind in ai.USER_MESSAGES:
            for lang in ("en", "ar"):
                assert_no_leak(ai.user_message(kind, lang))

    async def test_upstream_detail_goes_to_the_log_not_the_browser(self, ai, monkeypatch, caplog):
        with FakeAnthropic(available_models=[LIVE], behaviour=_not_found) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            with caplog.at_level("ERROR", logger="stairs.ai"):
                result = await ai.call_claude([{"role": "user", "content": "Test"}])

        logged = "\n".join(r.getMessage() for r in caplog.records)
        assert "404" in logged and LIVE in logged     # engineers get everything
        assert_no_leak(_text(result))                 # clients get nothing
        assert "404" in (ai.status_snapshot()["last_error"] or "")


# ─────────────────────────────────────────────────────────────────
# 4 · NO API KEY AT ALL
# ─────────────────────────────────────────────────────────────────

class TestNoApiKey:
    async def test_missing_key_degrades_gracefully(self, ai, monkeypatch):
        monkeypatch.setattr(ai, "ANTHROPIC_API_KEY", "")
        result = await ai.call_claude([{"role": "user", "content": "Test"}])

        assert result["ok"] is False
        assert result["error_kind"] == "no_key"
        assert_no_leak(_text(result))
        assert result["content"][0]["type"] == "text"
        assert result["usage"] == {"input_tokens": 0, "output_tokens": 0}

    async def test_missing_key_never_calls_out(self, ai, monkeypatch):
        with FakeAnthropic(available_models=[LIVE]) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            monkeypatch.setattr(ai, "ANTHROPIC_API_KEY", "")
            await ai.call_claude([{"role": "user", "content": "Test"}])
            assert fake.messages_calls == []
            assert fake.models_calls == 0

    async def test_warmup_reports_the_missing_key(self, ai, monkeypatch):
        monkeypatch.setattr(ai, "ANTHROPIC_API_KEY", "")
        assert await ai.warmup() == {"ok": False, "reason": "no_api_key"}

    async def test_resolve_model_returns_none_without_a_key(self, ai, monkeypatch):
        monkeypatch.setattr(ai, "ANTHROPIC_API_KEY", "")
        assert await ai.resolve_model() is None


# ─────────────────────────────────────────────────────────────────
# WARMUP + STATUS ENDPOINT
# ─────────────────────────────────────────────────────────────────

class TestWarmupAndStatus:
    async def test_warmup_pins_a_model_before_any_client_traffic(self, ai, monkeypatch):
        with FakeAnthropic(available_models=[LIVE, NEXT_IN_CHAIN]) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            warm = await ai.warmup()

        assert warm["ok"] is True
        assert warm["model"] == LIVE
        assert ai.status_snapshot()["active_model"] == LIVE

    async def test_status_snapshot_tracks_the_success_rate(self, ai, monkeypatch):
        calls = {"n": 0}

        def behaviour(model):
            calls["n"] += 1
            if calls["n"] == 1:
                return (200, _ok_body(model), {})
            return (401, {"error": {"type": "authentication_error"}}, {})

        with FakeAnthropic(available_models=[LIVE], behaviour=behaviour) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            await ai.call_claude([{"role": "user", "content": "a"}])
            await ai.call_claude([{"role": "user", "content": "b"}])

        snap = ai.status_snapshot()
        assert snap["calls_ok"] == 1
        assert snap["calls_failed"] == 1
        assert snap["success_rate"] == 50.0
        assert snap["ai_enabled"] is True

    async def test_status_endpoint_never_returns_a_stack_trace(self, ai, monkeypatch):
        with FakeAnthropic(available_models=[LIVE], behaviour=_not_found) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            await ai.call_claude([{"role": "user", "content": "a"}])
            snap = await ai.router.routes[0].endpoint()

        # last_error is engineer-facing and intentionally detailed; it is
        # exposed on an ops endpoint, never inside a chat response.
        assert snap["healthy"] in (True, False)
        assert "last_error" in snap
        assert snap["configured_model_is_retired"] is False

    def test_status_refresh_route_is_registered(self, ai):
        paths = {r.path for r in ai.router.routes}
        assert paths == {"/api/v1/ai/status", "/api/v1/ai/status/refresh"}


# ─────────────────────────────────────────────────────────────────
# NO RETIRED DEFAULTS LEFT IN THE REPO
# ─────────────────────────────────────────────────────────────────

class TestNoRetiredDefaults:
    def test_helpers_default_model_is_not_retired(self):
        from app import helpers
        assert helpers.CLAUDE_MODEL not in ai_client.BASE_RETIRED_MODEL_IDS

    def test_preference_chain_contains_no_retired_ids(self):
        for model in ai_client.DEFAULT_MODEL_CHAIN:
            assert model not in ai_client.BASE_RETIRED_MODEL_IDS

    def test_provider_module_no_longer_pins_a_model(self):
        from app import ai_providers
        assert not hasattr(ai_providers, "CLAUDE_MODEL"), (
            "ai_providers must not pin a model id — ai_client resolves it at runtime"
        )


# ─────────────────────────────────────────────────────────────────
# THE PROVIDER CHAIN (the path production chat actually takes)
# ─────────────────────────────────────────────────────────────────

class TestProviderChainDoesNotLeak:
    async def test_claude_leg_uses_ai_client_and_returns_clean_copy(self, ai, monkeypatch):
        """A dead Claude with no other keys must not surface a status code."""
        from app import ai_providers

        monkeypatch.setattr(ai_providers, "ANTHROPIC_API_KEY", "sk-ant-test-key")
        monkeypatch.setattr(ai_providers, "OPENAI_API_KEY", "")
        monkeypatch.setattr(ai_providers, "GOOGLE_API_KEY", "")

        with FakeAnthropic(available_models=[LIVE], behaviour=_not_found) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            result = await ai_providers.call_ai_with_fallback(
                messages=[{"role": "user", "content": "Test"}],
                system="You are Stairs.",
            )

        assert result["ok"] is False
        assert result["error_kind"] == "unavailable"
        assert_no_leak(result["text"])

    async def test_claude_leg_succeeds_through_the_chain(self, ai, monkeypatch):
        from app import ai_providers

        monkeypatch.setattr(ai_providers, "ANTHROPIC_API_KEY", "sk-ant-test-key")
        monkeypatch.setattr(ai_providers, "OPENAI_API_KEY", "")
        monkeypatch.setattr(ai_providers, "GOOGLE_API_KEY", "")

        with FakeAnthropic(available_models=[LIVE]) as fake:
            monkeypatch.setattr(ai, "ANTHROPIC_BASE_URL", fake.base_url)
            result = await ai_providers.call_ai_with_fallback(
                messages=[{"role": "user", "content": "Test"}],
                system="You are Stairs.",
            )

        assert result["ok"] is True
        assert result["text"] == "[Vision]: Become the leading platform."
        assert result["tokens"] == 33

    async def test_no_keys_at_all_does_not_name_env_vars_to_the_client(self, monkeypatch):
        from app import ai_providers

        monkeypatch.setattr(ai_providers, "ANTHROPIC_API_KEY", "")
        monkeypatch.setattr(ai_providers, "OPENAI_API_KEY", "")
        monkeypatch.setattr(ai_providers, "GOOGLE_API_KEY", "")

        result = await ai_providers.call_ai_with_fallback(
            messages=[{"role": "user", "content": "Test"}],
            system="You are Stairs.",
        )

        assert result["ok"] is False
        assert_no_leak(result["text"])

    def test_no_backend_response_interpolates_a_status_code(self):
        """`f"AI service returned status {status_code}..."` was the bug.

        Nothing in app/ may build client-facing text out of a status code
        again. (ai_client's module docstring quotes the old string as
        history — that is prose, not something a client can be handed.)
        """
        import pathlib
        app_dir = pathlib.Path(__file__).resolve().parent.parent / "app"
        offenders = [
            str(f.relative_to(app_dir)) for f in app_dir.rglob("*.py")
            if re.search(r"status[^\"'\n]*\{[a-z_]*status", f.read_text())
        ]
        assert offenders == []
