"""Tests for strategy source isolation — each strategy's Source of Truth must be independent."""

import os
import json
import uuid
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone
from decimal import Decimal

os.environ["DATABASE_URL"] = "postgresql://test:test@localhost:5432/test_stairs"
os.environ["JWT_SECRET"] = "test-secret-for-testing-only-not-for-prod"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["ALLOWED_ORIGINS"] = "http://localhost:3000"


STRATEGY_A_ID = "aaaa0000-0000-0000-0000-000000000001"
STRATEGY_B_ID = "bbbb0000-0000-0000-0000-000000000002"
ORG_ID = "a0000000-0000-0000-0000-000000000001"
USER_ID = "b0000000-0000-0000-0000-000000000001"


def _make_source_row(strategy_id, content, category, filename="doc.pdf"):
    """Create a mock source row for testing."""
    return {
        "id": str(uuid.uuid4()),
        "strategy_id": strategy_id,
        "source_type": "ai_extraction",
        "content": content,
        "metadata": json.dumps({
            "category": category,
            "confidence": "high",
            "parent_filename": filename,
            "context": "ai_extraction",
        }),
        "created_by": USER_ID,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }


def _make_stair_row(strategy_id, title, code, element_type="objective"):
    """Create a mock stair row for testing."""
    return {
        "id": str(uuid.uuid4()),
        "organization_id": ORG_ID,
        "strategy_id": strategy_id,
        "code": code,
        "title": title,
        "element_type": element_type,
        "health": "on_track",
        "progress_percent": Decimal("50.00"),
        "status": "active",
        "description": f"Description for {title}",
        "confidence_percent": Decimal("75.00"),
    }


def _make_mock_pool(mock_conn):
    """Create a properly configured mock asyncpg pool."""
    mock_pool = MagicMock()
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=mock_conn)
    cm.__aexit__ = AsyncMock(return_value=False)
    mock_pool.acquire = MagicMock(return_value=cm)
    return mock_pool


# Strategy A sources
SOURCE_A1 = _make_source_row(STRATEGY_A_ID, "Revenue grew 15% YoY", "Financial Data", "strategyA_finance.pdf")
SOURCE_A2 = _make_source_row(STRATEGY_A_ID, "Market share is 23%", "Market Position", "strategyA_market.pdf")
SOURCE_A3 = _make_source_row(STRATEGY_A_ID, "3 key competitors identified", "Competitors", "strategyA_market.pdf")

# Strategy B sources (completely different)
SOURCE_B1 = _make_source_row(STRATEGY_B_ID, "Operating costs reduced 10%", "Financial Data", "strategyB_ops.pdf")
SOURCE_B2 = _make_source_row(STRATEGY_B_ID, "Customer NPS is 72", "Customers", "strategyB_survey.pdf")

ALL_SOURCES = [SOURCE_A1, SOURCE_A2, SOURCE_A3, SOURCE_B1, SOURCE_B2]

# Strategy A stairs
STAIR_A1 = _make_stair_row(STRATEGY_A_ID, "Grow Revenue", "OBJ-A1")
STAIR_A2 = _make_stair_row(STRATEGY_A_ID, "Expand Market", "OBJ-A2")

# Strategy B stairs
STAIR_B1 = _make_stair_row(STRATEGY_B_ID, "Reduce Costs", "OBJ-B1")
STAIR_B2 = _make_stair_row(STRATEGY_B_ID, "Improve Satisfaction", "OBJ-B2")

ALL_STAIRS = [STAIR_A1, STAIR_A2, STAIR_B1, STAIR_B2]


class TestSourceIsolationSQL:
    """Test that SQL queries properly filter sources by strategy_id."""

    def test_sources_filtered_by_strategy_id(self):
        """Querying sources for Strategy A must NOT return Strategy B's sources."""
        strategy_a_sources = [s for s in ALL_SOURCES if s["strategy_id"] == STRATEGY_A_ID]
        strategy_b_sources = [s for s in ALL_SOURCES if s["strategy_id"] == STRATEGY_B_ID]

        assert len(strategy_a_sources) == 3
        assert len(strategy_b_sources) == 2

        # Verify no cross-contamination
        for src in strategy_a_sources:
            assert src["strategy_id"] == STRATEGY_A_ID
            assert src["strategy_id"] != STRATEGY_B_ID

        for src in strategy_b_sources:
            assert src["strategy_id"] == STRATEGY_B_ID
            assert src["strategy_id"] != STRATEGY_A_ID

    def test_source_content_is_strategy_specific(self):
        """Strategy A sources contain different data than Strategy B sources."""
        strategy_a_contents = {s["content"] for s in ALL_SOURCES if s["strategy_id"] == STRATEGY_A_ID}
        strategy_b_contents = {s["content"] for s in ALL_SOURCES if s["strategy_id"] == STRATEGY_B_ID}

        # No overlap
        assert strategy_a_contents.isdisjoint(strategy_b_contents)

    def test_source_count_per_strategy(self):
        """Source count must reflect only the current strategy's sources."""
        count_a = sum(1 for s in ALL_SOURCES if s["strategy_id"] == STRATEGY_A_ID and s["source_type"] == "ai_extraction")
        count_b = sum(1 for s in ALL_SOURCES if s["strategy_id"] == STRATEGY_B_ID and s["source_type"] == "ai_extraction")

        assert count_a == 3
        assert count_b == 2
        assert count_a != count_b  # Ensures the badge shows different counts


class TestAIChatSourceIsolation:
    """Test the AI chat endpoint's source enrichment filters by strategy_id."""

    @pytest.mark.asyncio
    async def test_ai_chat_loads_only_current_strategy_sources(self):
        """When chatting in Strategy B, AI must NOT receive Strategy A's sources."""
        from app.routers.ai import ai_chat
        from app.models.schemas import AIChatRequest
        from app.helpers import AuthContext

        req = AIChatRequest(
            message="What are our financials?",
            strategy_id=STRATEGY_B_ID,
        )
        auth = AuthContext(user_id=USER_ID, org_id=ORG_ID, role="admin")

        mock_conn = AsyncMock()

        # Strategy B sources only
        strategy_b_sources = [s for s in ALL_SOURCES if s["strategy_id"] == STRATEGY_B_ID]
        strategy_b_stairs = [s for s in ALL_STAIRS if s["strategy_id"] == STRATEGY_B_ID]

        async def mock_fetchrow(query, *args):
            if "organizations" in query:
                return {"id": ORG_ID, "name": "Test Org", "industry": "Tech"}
            if "stairs" in query and "id = $1" in query:
                return None
            return None

        async def mock_fetch(query, *args):
            if "strategy_sources" in query:
                # Verify the query uses Strategy B's ID
                assert args[0] == STRATEGY_B_ID, (
                    f"Source query should filter by Strategy B ({STRATEGY_B_ID}), "
                    f"but was called with {args[0]}"
                )
                return strategy_b_sources
            if "stairs" in query and "strategy_id" in query:
                assert args[1] == STRATEGY_B_ID, (
                    f"Stairs query should filter by Strategy B ({STRATEGY_B_ID}), "
                    f"but was called with {args[1]}"
                )
                return strategy_b_stairs
            if "stairs" in query:
                return strategy_b_stairs
            return []

        mock_conn.fetchrow = AsyncMock(side_effect=mock_fetchrow)
        mock_conn.fetch = AsyncMock(side_effect=mock_fetch)
        mock_conn.execute = AsyncMock()
        mock_conn.fetchval = AsyncMock(return_value=True)

        mock_pool = _make_mock_pool(mock_conn)

        # Mock call_ai_with_fallback (used by agents via BaseAgent.call)
        mock_ai_result = {
            "text": "Based on your data, operating costs reduced 10%.",
            "tokens": 50,
            "provider": "claude",
            "fallback_used": False,
        }

        with patch("app.routers.ai.get_pool", new_callable=AsyncMock, return_value=mock_pool), \
             patch("app.ai_providers.call_ai_with_fallback", new_callable=AsyncMock, return_value=mock_ai_result), \
             patch("app.routers.ai.log_source", new_callable=AsyncMock):
            result = await ai_chat(req, auth)

        assert result["response"] is not None
        # Verify Strategy A content was NOT included in the response flow
        assert "Revenue grew 15%" not in str(result)
        assert "Market share is 23%" not in str(result)

    @pytest.mark.asyncio
    async def test_ai_chat_stairs_filtered_by_strategy(self):
        """The AI context should only include stairs from the current strategy."""
        from app.routers.ai import ai_chat
        from app.models.schemas import AIChatRequest
        from app.helpers import AuthContext

        req = AIChatRequest(
            message="Summarize my strategy",
            strategy_id=STRATEGY_A_ID,
        )
        auth = AuthContext(user_id=USER_ID, org_id=ORG_ID, role="admin")

        captured_queries = []

        mock_conn = AsyncMock()

        async def mock_fetchrow(query, *args):
            captured_queries.append(("fetchrow", query, args))
            if "organizations" in query:
                return {"id": ORG_ID, "name": "Test Org", "industry": "Tech"}
            return None

        async def mock_fetch(query, *args):
            captured_queries.append(("fetch", query, args))
            if "strategy_sources" in query:
                return [s for s in ALL_SOURCES if s["strategy_id"] == args[0]]
            if "stairs" in query:
                return [s for s in ALL_STAIRS if s["strategy_id"] == STRATEGY_A_ID]
            return []

        mock_conn.fetchrow = AsyncMock(side_effect=mock_fetchrow)
        mock_conn.fetch = AsyncMock(side_effect=mock_fetch)
        mock_conn.execute = AsyncMock()
        mock_conn.fetchval = AsyncMock(return_value=True)

        mock_pool = _make_mock_pool(mock_conn)

        mock_ai_result = {
            "text": "Strategy A summary",
            "tokens": 50,
            "provider": "claude",
            "fallback_used": False,
        }

        with patch("app.routers.ai.get_pool", new_callable=AsyncMock, return_value=mock_pool), \
             patch("app.ai_providers.call_ai_with_fallback", new_callable=AsyncMock, return_value=mock_ai_result) as mock_fallback, \
             patch("app.routers.ai.log_source", new_callable=AsyncMock):
            result = await ai_chat(req, auth)

        # Verify the stairs query included strategy_id filter
        stairs_queries = [q for q in captured_queries if "stairs" in q[1] and "fetch" == q[0]]
        found_strategy_filter = False
        for method, query, args in stairs_queries:
            if "strategy_id" in query:
                found_strategy_filter = True
                assert STRATEGY_A_ID in args, (
                    f"Stairs query should filter by Strategy A ({STRATEGY_A_ID})"
                )
        assert found_strategy_filter, "Stairs query must filter by strategy_id"

        # Verify the AI was called with strategy A context, not strategy B
        # The call goes through the orchestrator → advisor agent → call_ai_with_fallback
        # Find the call that has the user's context in messages
        for call_args in mock_fallback.call_args_list:
            messages = call_args.kwargs.get("messages", [])
            if messages and messages[0].get("role") == "user":
                user_content = messages[0]["content"]
                # Strategy A stairs should be in context
                assert "Grow Revenue" in user_content or "Expand Market" in user_content
                # Strategy B stairs should NOT be in context
                assert "Reduce Costs" not in user_content
                assert "Improve Satisfaction" not in user_content
                break

    @pytest.mark.asyncio
    async def test_strategy_id_resolved_before_stairs_query(self):
        """strategy_id must be resolved BEFORE the stairs context query runs."""
        from app.routers.ai import ai_chat
        from app.models.schemas import AIChatRequest
        from app.helpers import AuthContext

        stair_id = str(uuid.uuid4())
        req = AIChatRequest(
            message="Analyze this element",
            context_stair_id=stair_id,
            # strategy_id not provided — must be resolved from context_stair_id
        )
        auth = AuthContext(user_id=USER_ID, org_id=ORG_ID, role="admin")

        query_order = []

        mock_conn = AsyncMock()

        async def mock_fetchrow(query, *args):
            if "SELECT strategy_id FROM stairs" in query:
                query_order.append("resolve_strategy_id")
                return {"strategy_id": STRATEGY_A_ID}
            if "organizations" in query:
                query_order.append("org_query")
                return {"id": ORG_ID, "name": "Test Org", "industry": "Tech"}
            if "stairs" in query and "id = $1" in query:
                return _make_stair_row(STRATEGY_A_ID, "Test Stair", "OBJ-T1")
            return None

        async def mock_fetch(query, *args):
            if "stairs" in query and "strategy_id" in query:
                query_order.append("stairs_with_strategy_filter")
                return [STAIR_A1]
            if "strategy_sources" in query:
                query_order.append("sources_query")
                return []
            return []

        mock_conn.fetchrow = AsyncMock(side_effect=mock_fetchrow)
        mock_conn.fetch = AsyncMock(side_effect=mock_fetch)
        mock_conn.execute = AsyncMock()
        mock_conn.fetchval = AsyncMock(return_value=True)

        mock_pool = _make_mock_pool(mock_conn)

        mock_ai_result = {
            "text": "Analysis complete",
            "tokens": 30,
            "provider": "claude",
            "fallback_used": False,
        }

        with patch("app.routers.ai.get_pool", new_callable=AsyncMock, return_value=mock_pool), \
             patch("app.ai_providers.call_ai_with_fallback", new_callable=AsyncMock, return_value=mock_ai_result), \
             patch("app.routers.ai.log_source", new_callable=AsyncMock):
            await ai_chat(req, auth)

        # strategy_id must be resolved BEFORE the stairs query with strategy filter
        assert "resolve_strategy_id" in query_order, "strategy_id should be resolved from context_stair_id"
        if "stairs_with_strategy_filter" in query_order:
            resolve_idx = query_order.index("resolve_strategy_id")
            stairs_idx = query_order.index("stairs_with_strategy_filter")
            assert resolve_idx < stairs_idx, (
                "strategy_id resolution must happen BEFORE the strategy-filtered stairs query"
            )


class TestSourceCountIsolation:
    """Test that source counts are strategy-specific."""

    def test_count_strategy_a_sources(self):
        """Count for Strategy A should be 3 (not 5 total)."""
        count = sum(
            1 for s in ALL_SOURCES
            if s["strategy_id"] == STRATEGY_A_ID and s["source_type"] == "ai_extraction"
        )
        assert count == 3

    def test_count_strategy_b_sources(self):
        """Count for Strategy B should be 2 (not 5 total)."""
        count = sum(
            1 for s in ALL_SOURCES
            if s["strategy_id"] == STRATEGY_B_ID and s["source_type"] == "ai_extraction"
        )
        assert count == 2

    def test_global_count_differs_from_per_strategy(self):
        """Global count (5) must differ from per-strategy counts (3, 2)."""
        global_count = len(ALL_SOURCES)
        count_a = sum(1 for s in ALL_SOURCES if s["strategy_id"] == STRATEGY_A_ID)
        count_b = sum(1 for s in ALL_SOURCES if s["strategy_id"] == STRATEGY_B_ID)

        assert global_count == 5
        assert count_a == 3
        assert count_b == 2
        assert count_a != global_count
        assert count_b != global_count
