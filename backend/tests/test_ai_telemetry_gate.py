"""
#65 gated six screens and the exported PDF so a client never learns which
vendor answered them. It gated the screens.

The endpoints those screens read stayed open. GET /api/v1/ai/status took no
Authorization header at all and answered 200 with `active_model`,
`configured_model` and a `preference_chain` naming four Claude model ids;
POST /api/v1/ai/status/refresh was equally open and makes live outbound
calls, so it also spent the account's API budget on request. GET
/api/v1/ai/provider asked for a login and nothing more, and every member has
a login.

These pin all three to the same two roles as canSeeAgentTelemetry(), so the
screen and the API cannot drift apart again.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.helpers import create_jwt, AGENT_TELEMETRY_ROLES
from app import ai_client
from app.routers.ai import router as ai_router


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(ai_client.router)
    app.include_router(ai_router)
    return TestClient(app)


def token_for(role):
    return create_jwt("u-1", "org-1", role)


def auth(role):
    return {"Authorization": f"Bearer {token_for(role)}"}


# Every route that names the vendor, the model, or the failure counts.
TELEMETRY_ROUTES = [
    ("GET", "/api/v1/ai/status"),
    ("POST", "/api/v1/ai/status/refresh"),
    ("GET", "/api/v1/ai/provider"),
    ("GET", "/api/v1/ai/health"),
]


class TestAgentTelemetryIsGated:
    @pytest.mark.parametrize("method,path", TELEMETRY_ROUTES)
    def test_anonymous_is_refused(self, client, method, path):
        """No token at all. This is how /ai/status shipped."""
        r = client.request(method, path)
        assert r.status_code == 401, f"{method} {path} answered {r.status_code} to an anonymous caller"

    @pytest.mark.parametrize("method,path", TELEMETRY_ROUTES)
    @pytest.mark.parametrize("role", ["member", "viewer"])
    def test_a_client_is_refused(self, client, method, path, role):
        r = client.request(method, path, headers=auth(role))
        assert r.status_code == 403, f"{method} {path} answered {r.status_code} to a {role}"

    @pytest.mark.parametrize("method,path", TELEMETRY_ROUTES)
    @pytest.mark.parametrize("role", AGENT_TELEMETRY_ROLES)
    def test_an_operator_is_admitted(self, client, method, path, role):
        r = client.request(method, path, headers=auth(role))
        assert r.status_code == 200, f"{method} {path} refused a {role}: {r.status_code}"

    def test_no_model_id_reaches_a_member(self, client):
        """The specific leak: the body, not just the status code."""
        body = client.get("/api/v1/ai/status", headers=auth("member")).text
        assert "claude" not in body.lower()
        assert "preference_chain" not in body

    def test_the_gate_matches_the_frontend_helper(self):
        """canSeeAgentTelemetry() admits exactly these two."""
        assert AGENT_TELEMETRY_ROLES == ("admin", "owner")


class TestHealthPayload:
    """What the header chip opens onto."""

    def test_health_answers_the_questions_the_chip_asks(self, client):
        body = client.get("/api/v1/ai/health", headers=auth("admin")).json()
        for key in ("provider_display", "healthy", "degraded", "active_model",
                    "success_rate", "fallback_switches_today", "providers"):
            assert key in body, f"/ai/health omits {key}"

    def test_health_reports_the_key_state_without_the_key(self, client):
        """ANTHROPIC_API_KEY is empty in tests, which is the unconfigured case."""
        body = client.get("/api/v1/ai/health", headers=auth("admin")).json()
        assert body["ai_enabled"] is False
        assert body["healthy"] is False
        # has_key is a boolean per provider, never the key itself.
        for provider in body["providers"].values():
            assert isinstance(provider["has_key"], bool)
            assert not any(len(str(v)) > 60 for v in provider.values())
