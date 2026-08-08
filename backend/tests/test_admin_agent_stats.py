"""/api/v1/admin/agents must separate dead calls from real ones.

failure_rate per agent is the number that shows an outage before a client
reports one, so it has to be computed from rows that actually failed — not
inferred from a confidence average that a dead call quietly dragged down.

Rules pinned here:
  - total_calls counts every attempt
  - failed_calls / failure_rate come from ok IS FALSE
  - avg_confidence and the rejection rate exclude ok IS FALSE
  - ok IS NULL is counted as neither (those rows pre-date the column)
"""

import pytest

from app.routers import admin


def _rows(*specs):
    """Fake asyncpg rows for the GROUP BY agent_name query."""
    return [dict(s) for s in specs]


class FakeConn:
    """Answers the endpoint's queries from a scripted agent_logs table."""

    def __init__(self, log_rows, *, has_ok=True, usage_table=False):
        self.log_rows = log_rows
        self.has_ok = has_ok
        self.usage_table = usage_table
        self.queries = []

    async def fetchval(self, sql, *args):
        self.queries.append(sql)
        if "information_schema.tables" in sql and "agent_logs" in sql:
            return True
        if "information_schema.columns" in sql:
            return self.has_ok
        if "information_schema.tables" in sql and "ai_usage_logs" in sql:
            return self.usage_table
        return None

    async def fetch(self, sql, *args):
        self.queries.append(sql)
        if "GROUP BY agent_name" in sql:
            return self._aggregate()
        if "ORDER BY created_at DESC LIMIT 20" in sql:
            return [
                {
                    "agent_name": r["agent_name"], "task_type": "chat",
                    "confidence_score": r["confidence_score"],
                    "model_used": r["model_used"],
                    "ok": r["ok"] if self.has_ok else None,
                    "created_at": None,
                }
                for r in self.log_rows
            ]
        return []

    def _aggregate(self):
        out = {}
        for r in self.log_rows:
            a = out.setdefault(r["agent_name"], {
                "agent_name": r["agent_name"], "total_calls": 0, "failed_calls": 0,
                "scored_calls": 0, "low_confidence_count": 0, "_scores": [],
            })
            a["total_calls"] += 1
            ok = r["ok"] if self.has_ok else None
            if ok is False:
                a["failed_calls"] += 1
                continue                      # excluded from every quality figure
            if r["confidence_score"] is not None:
                a["scored_calls"] += 1
                a["_scores"].append(r["confidence_score"])
                if r["confidence_score"] < 60:
                    a["low_confidence_count"] += 1
        rows = []
        for a in out.values():
            scores = a.pop("_scores")
            a["avg_confidence"] = (sum(scores) / len(scores)) if scores else None
            rows.append(a)
        return sorted(rows, key=lambda r: -r["total_calls"])


class FakePool:
    def __init__(self, conn): self.conn = conn
    def acquire(self):
        conn = self.conn
        class Acquire:
            async def __aenter__(self): return conn
            async def __aexit__(self, *a): return False
        return Acquire()


@pytest.fixture(autouse=True)
def reset_column_cache():
    admin._agent_logs_has_ok = False
    yield
    admin._agent_logs_has_ok = False


async def _stats(monkeypatch, conn):
    async def get_pool():
        return FakePool(conn)
    monkeypatch.setattr(admin, "get_pool", get_pool)
    monkeypatch.setattr(admin, "get_ai_status", lambda: {"providers": {}})
    return await admin.agent_stats(auth=None)


def _row(agent, ok, score=None, model="Claude"):
    return {"agent_name": agent, "ok": ok, "confidence_score": score, "model_used": model}


class TestFailureRate:
    async def test_failed_calls_and_rate_are_reported_per_agent(self, monkeypatch):
        conn = FakeConn([
            _row("strategy_advisor", True, 90),
            _row("strategy_advisor", False, None, "unavailable"),
            _row("strategy_advisor", False, None, "unavailable"),
            _row("strategy_advisor", True, 80),
            _row("execution_planner", True, 70),
        ])
        stats = await _stats(monkeypatch, conn)

        advisor = stats["agents"]["strategy_advisor"]
        assert advisor["total_calls"] == 4          # every attempt
        assert advisor["failed_calls"] == 2
        assert advisor["failure_rate"] == 50.0
        assert stats["agents"]["execution_planner"]["failure_rate"] == 0

    async def test_a_total_outage_reads_as_100_percent(self, monkeypatch):
        conn = FakeConn([_row("strategy_advisor", False) for _ in range(6)])
        stats = await _stats(monkeypatch, conn)
        assert stats["agents"]["strategy_advisor"]["failure_rate"] == 100.0
        assert stats["failure_rate"] == 100.0
        assert stats["failed_calls"] == 6

    async def test_overall_rate_rolls_up_across_agents(self, monkeypatch):
        conn = FakeConn([
            _row("a", True, 90), _row("a", False),
            _row("b", True, 90), _row("b", True, 90),
        ])
        stats = await _stats(monkeypatch, conn)
        assert stats["total_calls"] == 4
        assert stats["failed_calls"] == 1
        assert stats["failure_rate"] == 25.0


class TestQualityAveragesExcludeDeadCalls:
    async def test_avg_confidence_ignores_failed_rows(self, monkeypatch):
        conn = FakeConn([
            _row("validation", True, 90),
            _row("validation", True, 80),
            _row("validation", False, None),   # must not drag the average
        ])
        stats = await _stats(monkeypatch, conn)
        v = stats["agents"]["validation"]
        assert v["avg_confidence"] == 85.0
        assert v["scored_calls"] == 2
        assert v["total_calls"] == 3

    async def test_rejection_rate_is_out_of_scored_calls_not_all_calls(self, monkeypatch):
        conn = FakeConn([
            _row("validation", True, 40),      # a rejection
            _row("validation", True, 90),
            _row("validation", False, None),   # never ran — not a rejection
            _row("validation", True, None),    # succeeded but carries no score
        ])
        stats = await _stats(monkeypatch, conn)
        v = stats["agents"]["validation"]
        assert v["low_confidence_count"] == 1
        assert v["scored_calls"] == 2
        assert v["validation_rejection_rate"] == 50.0   # 1 of 2 scored, not 1 of 4

    async def test_an_agent_that_never_carries_a_score_reports_none_not_zero(self, monkeypatch):
        conn = FakeConn([_row("strategy_advisor", True, None) for _ in range(3)])
        stats = await _stats(monkeypatch, conn)
        a = stats["agents"]["strategy_advisor"]
        assert a["avg_confidence"] is None      # never measured
        assert a["scored_calls"] == 0
        assert a["validation_rejection_rate"] == 0
        assert a["failure_rate"] == 0


class TestNullOkIsNeither:
    async def test_legacy_rows_count_as_attempts_but_never_as_failures(self, monkeypatch):
        conn = FakeConn([
            _row("strategy_advisor", None, 90),   # pre-dates the column
            _row("strategy_advisor", None, 70),
            _row("strategy_advisor", False, None),
            _row("strategy_advisor", True, 80),
        ])
        stats = await _stats(monkeypatch, conn)
        a = stats["agents"]["strategy_advisor"]
        assert a["total_calls"] == 4
        assert a["failed_calls"] == 1            # only the explicit False
        assert a["failure_rate"] == 25.0
        assert a["scored_calls"] == 3            # legacy rows keep their scores
        assert a["avg_confidence"] == 80.0

    async def test_recent_activity_carries_ok_through(self, monkeypatch):
        conn = FakeConn([_row("a", True, 90), _row("a", False), _row("a", None, 50)])
        stats = await _stats(monkeypatch, conn)
        assert [e["ok"] for e in stats["recent_activity"]] == [True, False, None]


class TestDegradesWithoutTheColumn:
    async def test_an_unmigrated_database_does_not_500(self, monkeypatch):
        conn = FakeConn([_row("a", True, 90), _row("a", True, 50)], has_ok=False)
        stats = await _stats(monkeypatch, conn)

        assert stats["ok_column_available"] is False
        assert stats["agents"]["a"]["total_calls"] == 2
        assert stats["agents"]["a"]["failed_calls"] == 0
        assert stats["agents"]["a"]["failure_rate"] == 0
        assert stats["agents"]["a"]["avg_confidence"] == 70.0
        assert all(e["ok"] is None for e in stats["recent_activity"])
        # The FILTER-on-ok query must never have been sent.
        assert not any("ok IS FALSE" in q for q in conn.queries)

    async def test_the_column_check_is_cached_once_seen(self, monkeypatch):
        conn = FakeConn([_row("a", True, 90)])
        await _stats(monkeypatch, conn)
        await _stats(monkeypatch, conn)
        column_checks = [q for q in conn.queries if "information_schema.columns" in q]
        assert len(column_checks) == 1


class TestEmptyTable:
    async def test_no_rows_reports_zero_not_a_division_error(self, monkeypatch):
        conn = FakeConn([])
        stats = await _stats(monkeypatch, conn)
        assert stats["total_calls"] == 0
        assert stats["failed_calls"] == 0
        assert stats["failure_rate"] == 0
        assert stats["agents"] == {}
