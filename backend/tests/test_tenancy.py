"""Tenancy and signing-key tests.

Covers the four things that made organization isolation decorative:

  1. JWT_SECRET had a public default, so the "org" claim every filter trusts
     was forgeable by anyone who read this repository.
  2. Registration put every new user in DEFAULT_ORG_ID, so the filters never
     engaged.
  3. Four sources handlers filtered on (source_id, strategy_id) without
     checking who owned the strategy — cross-org overwrite and delete.
  4. stair_relationships had no organization_id and no filter at all.
"""

import re
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import app.helpers as helpers
from app.helpers import (
    jwt_secret_problem, require_jwt_secret, AuthContext, get_auth,
    DEFAULT_ORG_ID, DEFAULT_USER_ID, MIN_JWT_SECRET_LENGTH,
)
from app.main import app, _is_origin_allowed, VERCEL_PREVIEW_RE, PRODUCTION_ORIGINS


ORG_A = "a0000000-0000-0000-0000-00000000000a"
ORG_B = "a0000000-0000-0000-0000-00000000000b"
STAIR_A = "c0000000-0000-0000-0000-00000000000a"
STRAT_A = "d0000000-0000-0000-0000-00000000000a"


@pytest.fixture
def mock_pool():
    conn = AsyncMock()
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=conn)
    cm.__aexit__ = AsyncMock(return_value=False)
    pool = MagicMock()
    pool.acquire = MagicMock(return_value=cm)
    return pool, conn


@pytest.fixture
def as_org_b():
    """Authenticated as an organization that owns none of the fixtures below."""
    app.dependency_overrides[get_auth] = lambda: AuthContext(DEFAULT_USER_ID, ORG_B, "admin")
    yield
    app.dependency_overrides.pop(get_auth, None)


# ─── 1. THE SIGNING KEY ───

class TestJwtSecret:
    def test_unset_is_rejected(self):
        assert jwt_secret_problem("") == "JWT_SECRET is not set"

    def test_the_published_repo_default_is_rejected(self):
        # This exact string shipped as the default in this repository, so it is
        # public forever. Entropy alone would pass it — the ban is what stops it.
        problem = jwt_secret_problem("stairs-dev-secret-change-in-production-2026")
        assert problem and "publicly known" in problem

    @pytest.mark.parametrize("weak", ["changeme", "secret", "change-me", "your-secret-key"])
    def test_common_placeholders_are_rejected(self, weak):
        assert jwt_secret_problem(weak) is not None

    def test_short_secrets_are_rejected(self):
        problem = jwt_secret_problem("a1B2c3D4!" * 2)  # 18 chars
        assert problem and "characters" in problem

    def test_repeated_padding_is_rejected(self):
        # Long enough to pass the length check, but only two distinct characters.
        problem = jwt_secret_problem("ab" * 40)
        assert problem and "distinct characters" in problem

    def test_a_generated_secret_passes(self):
        import secrets
        assert jwt_secret_problem(secrets.token_urlsafe(48)) is None

    def test_minimum_length_is_at_least_32(self):
        assert MIN_JWT_SECRET_LENGTH >= 32

    def test_require_raises_and_explains_the_stakes(self, monkeypatch):
        monkeypatch.setattr(helpers, "JWT_SECRET", "")
        with pytest.raises(RuntimeError) as exc:
            require_jwt_secret()
        assert "any organization" in str(exc.value)

    def test_signing_fails_closed(self, monkeypatch):
        """Even if startup validation were bypassed, no token gets minted."""
        monkeypatch.setattr(helpers, "JWT_SECRET", "")
        with pytest.raises(RuntimeError):
            helpers.create_jwt(DEFAULT_USER_ID, ORG_A, "admin")

    def test_verification_fails_closed(self, monkeypatch):
        """A misconfigured server must not authenticate anyone, since every
        signature would verify against an empty key."""
        from fastapi import HTTPException
        monkeypatch.setattr(helpers, "JWT_SECRET", "")
        with pytest.raises(HTTPException) as exc:
            helpers.decode_jwt("any.token.here")
        assert exc.value.status_code == 500


# ─── 2. CORS ───

class TestCorsOrigins:
    def test_wildcard_is_not_honoured(self, monkeypatch):
        """allow_credentials=True with a wildcard origin is invalid per the CORS
        spec and would let any site read 500 bodies with the victim's cookies.
        The middleware never receives "*"; this helper must agree."""
        monkeypatch.setattr("app.main.ALLOWED_ORIGINS_ENV", "*")
        assert _is_origin_allowed("https://attacker.example") is False

    def test_configured_origin_is_allowed(self, monkeypatch):
        monkeypatch.setattr("app.main.ALLOWED_ORIGINS_ENV", "https://app.example.com")
        assert _is_origin_allowed("https://app.example.com") is True
        assert _is_origin_allowed("https://attacker.example") is False

    def test_empty_origin_is_rejected(self):
        assert _is_origin_allowed("") is False

    # Real deployment URLs, taken from the Vercel bot comments on PRs #58, #60
    # and #61 — both front-end projects. Vercel emits
    #   <project>-git-<branch-slug>[-<6 hex>]-<team-slug>.vercel.app
    # where the hash appears only when the label would exceed 63 characters,
    # so it cannot be required by the pattern.
    @pytest.mark.parametrize("origin", [
        "https://st-a-irs-git-claude-stairs-retired-d0d223-tamermomtazs-projects.vercel.app",
        "https://st-a-irs-git-claude-content-persis-7ed966-tamermomtazs-projects.vercel.app",
        "https://st-a-irs-git-claude-tenancy-hardening-tamermomtazs-projects.vercel.app",
        "https://st-a-irs-coh3-git-claude-stairs-re-f345e9-tamermomtazs-projects.vercel.app",
        "https://st-a-irs-coh3-git-claude-content-p-6b96c2-tamermomtazs-projects.vercel.app",
        "https://st-a-irs-coh3-git-claude-tenancy-h-7a19ba-tamermomtazs-projects.vercel.app",
    ])
    def test_real_preview_urls_are_allowed(self, origin):
        assert _is_origin_allowed(origin) is True, origin

    @pytest.mark.parametrize("origin", [
        # The old pattern, `https://.*\.vercel\.app`, allowed every one of these
        # with allow_credentials on.
        "https://attacker.vercel.app",
        "https://phishing.vercel.app",
        "https://st-a-irs.attacker.vercel.app",
        # Project prefix but no team slug — anyone can name a project this.
        "https://st-a-irs-attacker.vercel.app",
        "https://st-a-irs-git-evil-someone-elses-projects.vercel.app",
        # Right team slug, wrong project family.
        "https://unrelated-project-tamermomtazs-projects.vercel.app",
        # Suffix games.
        "https://st-a-irs-git-x-tamermomtazs-projects.vercel.app.evil.com",
        "https://evil.com/st-a-irs-git-x-tamermomtazs-projects.vercel.app",
    ])
    def test_everything_else_on_vercel_is_now_rejected(self, origin):
        assert _is_origin_allowed(origin) is False, origin

    @pytest.mark.parametrize("origin", PRODUCTION_ORIGINS)
    def test_every_pinned_production_origin_is_allowed(self, origin):
        """Pinned exactly, not by pattern — stairs-app-orcin and the bare
        project aliases do not match the preview regex at all."""
        assert _is_origin_allowed(origin) is True, origin

    def test_the_coh3_alias_is_pinned(self):
        assert "https://st-a-irs-coh3.vercel.app" in PRODUCTION_ORIGINS

    def test_the_pattern_is_anchored_at_both_ends(self):
        assert VERCEL_PREVIEW_RE.startswith("^") and VERCEL_PREVIEW_RE.endswith("$")


# ─── 3. SOURCES: cross-org write was live ───

class TestSourceHandlersCheckTheOrg:
    """Each of these filtered on (source_id, strategy_id) only. A caller who
    knew both ids could overwrite or delete another organization's source."""

    @pytest.mark.parametrize("method,path,body", [
        ("put",    f"/api/v1/strategies/{STRAT_A}/sources/{STAIR_A}", {"content": "HIJACKED"}),
        ("delete", f"/api/v1/strategies/{STRAT_A}/sources/{STAIR_A}", None),
        ("get",    f"/api/v1/strategies/{STRAT_A}/sources/{STAIR_A}/download-url", None),
        ("delete", f"/api/v1/strategies/{STRAT_A}/sources/{STAIR_A}/with-file", None),
    ])
    def test_refuses_a_strategy_from_another_org(self, mock_pool, as_org_b, method, path, body):
        pool, conn = mock_pool
        conn.fetchrow = AsyncMock(return_value=None)   # strategy not in this org
        with patch("app.routers.sources.get_pool", AsyncMock(return_value=pool)):
            client = TestClient(app)
            r = getattr(client, method)(path, **({"json": body} if body else {}))
        assert r.status_code == 404
        # The ownership check must run before any mutation.
        conn.execute.assert_not_called()

    def test_the_guard_filters_on_organization(self, mock_pool, as_org_b):
        pool, conn = mock_pool
        conn.fetchrow = AsyncMock(return_value=None)
        with patch("app.routers.sources.get_pool", AsyncMock(return_value=pool)):
            TestClient(app).delete(f"/api/v1/strategies/{STRAT_A}/sources/{STAIR_A}")
        sql, sid, org = conn.fetchrow.call_args.args[:3]
        assert "FROM strategies" in sql and "organization_id = $2" in sql
        assert org == ORG_B


# ─── 4. RELATIONSHIPS: no tenancy column, no filter ───

class TestRelationshipsAreOrgScoped:
    def test_reading_another_orgs_graph_404s(self, mock_pool, as_org_b):
        pool, conn = mock_pool
        conn.fetchrow = AsyncMock(return_value=None)   # stair not in this org
        with patch("app.routers.stairs.get_pool", AsyncMock(return_value=pool)):
            r = TestClient(app).get(f"/api/v1/stairs/{STAIR_A}/relationships")
        assert r.status_code == 404
        conn.fetch.assert_not_called()

    def test_writing_into_another_orgs_graph_404s(self, mock_pool, as_org_b):
        pool, conn = mock_pool
        conn.fetchval = AsyncMock(return_value=0)      # neither stair is ours
        with patch("app.routers.stairs.get_pool", AsyncMock(return_value=pool)):
            r = TestClient(app).post("/api/v1/relationships", json={
                "source_stair_id": STAIR_A,
                "target_stair_id": "c0000000-0000-0000-0000-00000000000b",
                "relationship_type": "blocks",
            })
        assert r.status_code == 404
        conn.execute.assert_not_called()

    def test_an_edge_may_not_span_two_organizations(self, mock_pool, as_org_b):
        """Owning one endpoint is not enough — the count must match both."""
        pool, conn = mock_pool
        conn.fetchval = AsyncMock(return_value=1)      # we own exactly one of two
        with patch("app.routers.stairs.get_pool", AsyncMock(return_value=pool)):
            r = TestClient(app).post("/api/v1/relationships", json={
                "source_stair_id": STAIR_A,
                "target_stair_id": "c0000000-0000-0000-0000-00000000000b",
                "relationship_type": "supports",
            })
        assert r.status_code == 404
        conn.execute.assert_not_called()

    def test_a_created_edge_records_the_organization(self, mock_pool, as_org_b):
        pool, conn = mock_pool
        conn.fetchval = AsyncMock(return_value=2)      # both stairs are ours
        conn.fetchrow = AsyncMock(return_value={
            "id": "e0000000-0000-0000-0000-000000000001",
            "source_stair_id": STAIR_A,
            "target_stair_id": "c0000000-0000-0000-0000-00000000000b",
            "relationship_type": "supports", "strength": 1.0, "description": None,
            "created_by": None, "created_at": None,
        })
        with patch("app.routers.stairs.get_pool", AsyncMock(return_value=pool)):
            r = TestClient(app).post("/api/v1/relationships", json={
                "source_stair_id": STAIR_A,
                "target_stair_id": "c0000000-0000-0000-0000-00000000000b",
                "relationship_type": "supports",
            })
        assert r.status_code == 201
        sql = conn.execute.call_args.args[0]
        assert "organization_id" in sql
        assert conn.execute.call_args.args[2] == ORG_B


# ─── 5. REGISTRATION no longer defaults into a shared organization ───

class TestRegistrationCreatesAnOrganization:
    def test_default_org_is_gone_from_the_auth_router(self):
        """The whole leak was this constant being the signup fallback."""
        import app.routers.auth as auth_mod
        source = open(auth_mod.__file__).read()
        code = re.sub(r'(?s)""".*?"""', "", source)      # drop docstrings
        code = re.sub(r'#.*', "", code)                   # drop comments
        assert "DEFAULT_ORG_ID" not in code

    def test_signup_creates_a_new_org_with_the_registrant_as_admin(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchrow = AsyncMock(side_effect=[
            None,                                        # email not taken
            {"id": DEFAULT_USER_ID, "email": "new@x.test", "full_name": "New",
             "role": "admin", "language": "en", "organization_id": ORG_A},
        ])
        with patch("app.routers.auth.get_pool", AsyncMock(return_value=pool)):
            r = TestClient(app).post("/api/v1/auth/signup", json={
                "name": "New", "email": "new@x.test",
                "password": "stairs2026!", "confirm_password": "stairs2026!",
                "org_name": "New Client Ltd",
            })
        assert r.status_code == 201
        assert r.json()["user"]["role"] == "admin"
        # The organisation is named by the registrant, not after them.
        assert conn.execute.call_args_list[0].args[2] == "New Client Ltd"
        statements = [c.args[0] for c in conn.execute.call_args_list]
        assert any("INSERT INTO organizations" in s for s in statements), \
            "signup must create an organization, not join a shared one"

    def test_an_invalid_invite_is_refused_rather_than_falling_back(self, mock_pool):
        """A bad token must not quietly drop the user into some default org."""
        pool, conn = mock_pool
        conn.fetchrow = AsyncMock(side_effect=[None, None])  # email free, invite invalid
        with patch("app.routers.auth.get_pool", AsyncMock(return_value=pool)):
            r = TestClient(app).post("/api/v1/auth/signup", json={
                "name": "Thief", "email": "thief@evil.test",
                "password": "stairs2026!", "confirm_password": "stairs2026!",
                "invite_token": "made-up",
            })
        assert r.status_code == 400
        statements = [c.args[0] for c in conn.execute.call_args_list]
        assert not any("INSERT INTO users" in s for s in statements)


class TestInvitesAreAdminOnly:
    @pytest.fixture
    def as_member(self):
        app.dependency_overrides[get_auth] = lambda: AuthContext(DEFAULT_USER_ID, ORG_A, "member")
        yield
        app.dependency_overrides.pop(get_auth, None)

    def test_a_member_cannot_mint_an_invite(self, as_member):
        # require_auth is a separate dependency; drive it with a real token.
        import app.helpers as h
        token = h.create_jwt(DEFAULT_USER_ID, ORG_A, "member")
        r = TestClient(app).post("/api/v1/auth/invites",
                                 headers={"Authorization": f"Bearer {token}"},
                                 json={"role": "admin"})
        assert r.status_code == 403

    def test_listing_never_returns_live_tokens(self, mock_pool):
        """Handing a token out twice turns the list endpoint into a harvester."""
        import app.helpers as h
        pool, conn = mock_pool
        conn.fetch = AsyncMock(return_value=[{
            "id": "e0000000-0000-0000-0000-000000000001", "organization_id": ORG_A,
            "email": "x@y.test", "role": "member", "token": None,
            "created_by": None, "created_at": None, "expires_at": None,
            "accepted_at": None, "accepted_by": None, "revoked_at": None,
        }])
        token = h.create_jwt(DEFAULT_USER_ID, ORG_A, "admin")
        with patch("app.routers.auth.get_pool", AsyncMock(return_value=pool)):
            r = TestClient(app).get("/api/v1/auth/invites",
                                    headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert all(i["token"] is None for i in r.json())
        assert "NULL::text AS token" in conn.fetch.call_args.args[0]


# ─── 6. INVITE FAILURE PATHS ───
# An invitation that cannot be used must say why and must never fall through to
# creating a new organization — that is how an invited colleague lands alone in
# an empty workspace wondering where their team's data went.

import asyncio
from datetime import datetime, timedelta, timezone

from app.routers.auth import _lookup_invite


def _invite(**over):
    row = {
        "id": "f0000000-0000-0000-0000-000000000001",
        "organization_id": ORG_A,
        "org_name": "Acme Corp",
        "email": None,
        "role": "member",
        "token": "tok",
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "accepted_at": None,
        "revoked_at": None,
    }
    row.update(over)
    return row


def _lookup(row, email=None):
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value=row)
    return asyncio.run(_lookup_invite(conn, "tok", email))


class TestInviteFailurePaths:
    def test_a_usable_invite_reports_no_problem(self):
        invite, problem = _lookup(_invite())
        assert problem is None and invite["org_name"] == "Acme Corp"

    def test_unknown_token_says_it_is_not_recognised(self):
        _, problem = _lookup(None)
        assert "isn't recognised" in problem

    def test_revoked_says_revoked(self):
        _, problem = _lookup(_invite(revoked_at=datetime.now(timezone.utc)))
        assert "revoked" in problem.lower()

    def test_already_used_says_already_used(self):
        _, problem = _lookup(_invite(accepted_at=datetime.now(timezone.utc)))
        assert "already been used" in problem

    def test_expired_says_expired(self):
        _, problem = _lookup(_invite(expires_at=datetime.now(timezone.utc) - timedelta(hours=1)))
        assert "expired" in problem.lower()

    def test_wrong_recipient_names_the_right_address(self):
        _, problem = _lookup(_invite(email="right@acme.test"), email="wrong@evil.test")
        assert "right@acme.test" in problem

    def test_the_right_recipient_is_accepted_case_insensitively(self):
        _, problem = _lookup(_invite(email="Right@Acme.test"), email="right@acme.TEST")
        assert problem is None

    def test_each_failure_gives_a_distinct_message(self):
        """"Invalid" for everything leaves the invitee with nothing to act on."""
        messages = {
            _lookup(None)[1],
            _lookup(_invite(revoked_at=datetime.now(timezone.utc)))[1],
            _lookup(_invite(accepted_at=datetime.now(timezone.utc)))[1],
            _lookup(_invite(expires_at=datetime.now(timezone.utc) - timedelta(hours=1)))[1],
        }
        assert len(messages) == 4


class TestSignupRefusesRatherThanDiverting:
    @pytest.mark.parametrize("row,label", [
        (None, "unknown"),
        (_invite(revoked_at=datetime.now(timezone.utc)), "revoked"),
        (_invite(accepted_at=datetime.now(timezone.utc)), "used"),
        (_invite(expires_at=datetime.now(timezone.utc) - timedelta(hours=1)), "expired"),
    ])
    def test_a_broken_invite_creates_nothing(self, mock_pool, row, label):
        pool, conn = mock_pool
        conn.fetchrow = AsyncMock(side_effect=[None, row])   # email free, then the invite
        with patch("app.routers.auth.get_pool", AsyncMock(return_value=pool)):
            r = TestClient(app).post("/api/v1/auth/signup", json={
                "name": "Invitee", "email": "invitee@acme.test",
                "password": "stairs2026!", "confirm_password": "stairs2026!",
                "invite_token": "tok",
            })
        assert r.status_code == 400, label
        statements = [c.args[0] for c in conn.execute.call_args_list]
        assert not any("INSERT INTO organizations" in s for s in statements), \
            f"a {label} invite silently created a new organization"
        assert not any("INSERT INTO users" in s for s in statements)


class TestOrganisationNameIsRequired:
    def test_signup_without_an_org_name_is_refused(self, mock_pool):
        """Falling back to the registrant's own name left every client
        organisation named after a person."""
        pool, conn = mock_pool
        conn.fetchrow = AsyncMock(return_value=None)
        with patch("app.routers.auth.get_pool", AsyncMock(return_value=pool)):
            r = TestClient(app).post("/api/v1/auth/signup", json={
                "name": "Solo", "email": "solo@acme.test",
                "password": "stairs2026!", "confirm_password": "stairs2026!",
            })
        assert r.status_code == 400
        assert "organisation name" in r.json()["detail"].lower()

    def test_whitespace_is_not_a_name(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchrow = AsyncMock(return_value=None)
        with patch("app.routers.auth.get_pool", AsyncMock(return_value=pool)):
            r = TestClient(app).post("/api/v1/auth/signup", json={
                "name": "Solo", "email": "solo@acme.test",
                "password": "stairs2026!", "confirm_password": "stairs2026!",
                "org_name": "   ",
            })
        assert r.status_code == 400

    def test_an_invitee_needs_no_org_name(self, mock_pool):
        """They're joining one, not naming one."""
        pool, conn = mock_pool
        conn.fetchrow = AsyncMock(side_effect=[
            None, _invite(),
            {"id": DEFAULT_USER_ID, "email": "invitee@acme.test", "full_name": "Invitee",
             "role": "member", "language": "en", "organization_id": ORG_A},
        ])
        with patch("app.routers.auth.get_pool", AsyncMock(return_value=pool)):
            r = TestClient(app).post("/api/v1/auth/signup", json={
                "name": "Invitee", "email": "invitee@acme.test",
                "password": "stairs2026!", "confirm_password": "stairs2026!",
                "invite_token": "tok",
            })
        assert r.status_code == 201
        assert r.json()["user"]["role"] == "member"
        statements = [c.args[0] for c in conn.execute.call_args_list]
        assert not any("INSERT INTO organizations" in s for s in statements)
        assert any("accepted_at = NOW()" in s for s in statements), "the invite must be consumed"


class TestInvitePreview:
    def test_preview_describes_a_valid_invitation(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchrow = AsyncMock(return_value=_invite())
        with patch("app.routers.auth.get_pool", AsyncMock(return_value=pool)):
            r = TestClient(app).get("/api/v1/auth/invites/preview/tok")
        body = r.json()
        assert body["valid"] is True
        assert body["organization_name"] == "Acme Corp"
        assert body["role"] == "member"

    def test_preview_explains_a_broken_one(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchrow = AsyncMock(return_value=_invite(expires_at=datetime.now(timezone.utc) - timedelta(days=1)))
        with patch("app.routers.auth.get_pool", AsyncMock(return_value=pool)):
            r = TestClient(app).get("/api/v1/auth/invites/preview/tok")
        body = r.json()
        assert body["valid"] is False and "expired" in body["reason"].lower()

    def test_preview_never_returns_the_token(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchrow = AsyncMock(return_value=_invite())
        with patch("app.routers.auth.get_pool", AsyncMock(return_value=pool)):
            r = TestClient(app).get("/api/v1/auth/invites/preview/tok")
        assert "token" not in r.json()
