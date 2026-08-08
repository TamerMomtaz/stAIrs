"""Tests for the generated-artifacts router.

These cover the contract the frontend relies on to stop regenerating content:
a write is an upsert on (org, artifact_type, scope_key), a read returns what
was written, and generated_at is set so the client can show when it was saved.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.helpers import DEFAULT_ORG_ID, DEFAULT_USER_ID, AuthContext, get_auth


STAIR_ID = "c0000000-0000-0000-0000-000000000003"
ARTIFACT_ID = "e0000000-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def _authenticated():
    """Every artifact endpoint is behind get_auth; stand in a fixed context."""
    app.dependency_overrides[get_auth] = lambda: AuthContext(DEFAULT_USER_ID, DEFAULT_ORG_ID, "admin")
    yield
    app.dependency_overrides.pop(get_auth, None)


@pytest.fixture
def mock_pool():
    """asyncpg pool whose `async with pool.acquire()` yields a mock connection."""
    conn = AsyncMock()
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=conn)
    cm.__aexit__ = AsyncMock(return_value=False)
    pool = MagicMock()
    pool.acquire = MagicMock(return_value=cm)
    return pool, conn


def _artifact_row(**overrides):
    row = {
        "id": ARTIFACT_ID,
        "organization_id": DEFAULT_ORG_ID,
        "strategy_id": "d0000000-0000-0000-0000-000000000001",
        "stair_id": STAIR_ID,
        "artifact_type": "solutions",
        "scope_key": STAIR_ID,
        "content": "## Solutions\n\nQuick wins...",
        "payload": {},
        "generated_at": "2026-08-08T10:00:00+00:00",
        "updated_at": "2026-08-08T10:00:00+00:00",
        "created_by": DEFAULT_USER_ID,
    }
    row.update(overrides)
    return row


def _client(pool):
    """TestClient without running lifespan (no DB in tests)."""
    return TestClient(app, raise_server_exceptions=True)


def test_upsert_artifact_persists_and_returns_generated_at(mock_pool):
    pool, conn = mock_pool
    conn.fetchrow = AsyncMock(side_effect=[{"id": STAIR_ID}, _artifact_row()])
    with patch("app.routers.artifacts.get_pool", AsyncMock(return_value=pool)):
        r = _client(pool).put("/api/v1/artifacts", json={
            "artifact_type": "solutions",
            "scope_key": STAIR_ID,
            "stair_id": STAIR_ID,
            "content": "## Solutions\n\nQuick wins...",
        })
    assert r.status_code == 200
    body = r.json()
    assert body["artifact_type"] == "solutions"
    assert body["scope_key"] == STAIR_ID
    assert body["content"].startswith("## Solutions")
    # The client shows this so saved content reads as saved.
    assert body["generated_at"] is not None


def test_upsert_uses_on_conflict_so_regenerating_replaces(mock_pool):
    """Re-generating must not pile up rows — one artifact per scope_key."""
    pool, conn = mock_pool
    conn.fetchrow = AsyncMock(side_effect=[{"id": STAIR_ID}, _artifact_row()])
    with patch("app.routers.artifacts.get_pool", AsyncMock(return_value=pool)):
        _client(pool).put("/api/v1/artifacts", json={
            "artifact_type": "solutions", "scope_key": STAIR_ID, "stair_id": STAIR_ID,
            "content": "second run",
        })
    sql = conn.fetchrow.call_args_list[-1].args[0]
    assert "ON CONFLICT (organization_id, artifact_type, scope_key) DO UPDATE" in sql


def test_upsert_rejects_unknown_stair(mock_pool):
    pool, conn = mock_pool
    conn.fetchrow = AsyncMock(return_value=None)
    with patch("app.routers.artifacts.get_pool", AsyncMock(return_value=pool)):
        r = _client(pool).put("/api/v1/artifacts", json={
            "artifact_type": "solutions", "scope_key": STAIR_ID,
            "stair_id": "c0000000-0000-0000-0000-0000000000ff", "content": "x",
        })
    assert r.status_code == 404


def test_list_stair_artifacts_returns_saved_content(mock_pool):
    pool, conn = mock_pool
    conn.fetch = AsyncMock(return_value=[
        _artifact_row(),
        _artifact_row(id="e0000000-0000-0000-0000-000000000002",
                      artifact_type="impl_guide",
                      scope_key=f"{STAIR_ID}:task_0",
                      content="## Prerequisites",
                      payload={"steps": [{"id": "s1", "label": "Do the thing", "done": False}]}),
    ])
    with patch("app.routers.artifacts.get_pool", AsyncMock(return_value=pool)):
        r = _client(pool).get(f"/api/v1/stairs/{STAIR_ID}/artifacts")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 2
    types = {a["artifact_type"] for a in body}
    assert types == {"solutions", "impl_guide"}
    guide = next(a for a in body if a["artifact_type"] == "impl_guide")
    # Step checklists round-trip through payload, so progress isn't lost.
    assert guide["payload"]["steps"][0]["label"] == "Do the thing"


def test_list_stair_artifacts_filters_by_type(mock_pool):
    pool, conn = mock_pool
    conn.fetch = AsyncMock(return_value=[_artifact_row()])
    with patch("app.routers.artifacts.get_pool", AsyncMock(return_value=pool)):
        r = _client(pool).get(f"/api/v1/stairs/{STAIR_ID}/artifacts?artifact_type=solutions")
    assert r.status_code == 200
    sql = conn.fetch.call_args.args[0]
    assert "a.artifact_type = $3" in sql
    assert conn.fetch.call_args.args[3] == "solutions"


def test_list_stair_artifacts_is_org_scoped(mock_pool):
    """An artifact must never be readable from another organization."""
    pool, conn = mock_pool
    conn.fetch = AsyncMock(return_value=[])
    with patch("app.routers.artifacts.get_pool", AsyncMock(return_value=pool)):
        _client(pool).get(f"/api/v1/stairs/{STAIR_ID}/artifacts")
    sql = conn.fetch.call_args.args[0]
    assert "a.organization_id = $2" in sql
    assert conn.fetch.call_args.args[2] == DEFAULT_ORG_ID


def test_list_strategy_artifacts(mock_pool):
    pool, conn = mock_pool
    conn.fetch = AsyncMock(return_value=[
        _artifact_row(artifact_type="matrix",
                      scope_key="d0000000-0000-0000-0000-000000000001:ife",
                      content="Strong internal position (3.10/4.00)"),
    ])
    with patch("app.routers.artifacts.get_pool", AsyncMock(return_value=pool)):
        r = _client(pool).get("/api/v1/strategies/d0000000-0000-0000-0000-000000000001/artifacts?artifact_type=matrix")
    assert r.status_code == 200
    assert r.json()[0]["scope_key"].endswith(":ife")


def test_delete_missing_artifact_404s(mock_pool):
    pool, conn = mock_pool
    conn.execute = AsyncMock(return_value="DELETE 0")
    with patch("app.routers.artifacts.get_pool", AsyncMock(return_value=pool)):
        r = _client(pool).delete(f"/api/v1/artifacts/solutions/{STAIR_ID}")
    assert r.status_code == 404


# ─── ACTION PLAN UPSERT ───
# Regenerating a plan used to INSERT a new row each time. Reads take the newest
# so the Execution Room looked right, but Action Plans and the Manifest Room
# showed the same plan repeated.

def _plan_row(**overrides):
    row = {
        "id": "f0000000-0000-0000-0000-000000000001",
        "stair_id": STAIR_ID,
        "organization_id": DEFAULT_ORG_ID,
        "plan_type": "recommended",
        "raw_text": "## Action Plan",
        "tasks": [{"id": "t1", "name": "Build the pipeline", "done": False}],
        "feedback": None,
        "created_by": DEFAULT_USER_ID,
        "created_at": "2026-08-08T10:00:00+00:00",
    }
    row.update(overrides)
    return row


def test_saving_a_plan_upserts_on_stair_and_type(mock_pool):
    pool, conn = mock_pool
    conn.fetchrow = AsyncMock(side_effect=[{"id": STAIR_ID}, _plan_row()])
    with patch("app.routers.stairs.get_pool", AsyncMock(return_value=pool)):
        r = _client(pool).post(f"/api/v1/stairs/{STAIR_ID}/action-plans", json={
            "plan_type": "recommended",
            "raw_text": "## Action Plan",
            "tasks": [{"id": "t1", "name": "Build the pipeline", "done": False}],
        })
    assert r.status_code == 201
    sql = conn.fetchrow.call_args_list[-1].args[0]
    assert "ON CONFLICT (stair_id, plan_type) DO UPDATE" in sql
    # created_at moves forward so the client's "Saved <when>" stamp is honest.
    assert "created_at = NOW()" in sql


def test_recommended_and_customized_plans_coexist(mock_pool):
    """The constraint is per plan_type — customizing must not evict the
    recommended plan it was derived from."""
    pool, conn = mock_pool
    conn.fetchrow = AsyncMock(side_effect=[{"id": STAIR_ID}, _plan_row(plan_type="customized")])
    with patch("app.routers.stairs.get_pool", AsyncMock(return_value=pool)):
        r = _client(pool).post(f"/api/v1/stairs/{STAIR_ID}/action-plans", json={
            "plan_type": "customized", "raw_text": "## Your Customized Action Plan", "tasks": [],
        })
    assert r.status_code == 201
    assert r.json()["plan_type"] == "customized"
    assert conn.fetchrow.call_args_list[-1].args[4] == "customized"


def test_saving_a_plan_for_an_unknown_stair_404s(mock_pool):
    pool, conn = mock_pool
    conn.fetchrow = AsyncMock(return_value=None)
    with patch("app.routers.stairs.get_pool", AsyncMock(return_value=pool)):
        r = _client(pool).post(f"/api/v1/stairs/{STAIR_ID}/action-plans", json={
            "plan_type": "recommended", "raw_text": "x", "tasks": [],
        })
    assert r.status_code == 404
