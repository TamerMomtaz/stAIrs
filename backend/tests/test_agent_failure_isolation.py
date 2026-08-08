"""A failed AI call must not contaminate anything downstream of it.

base_agent injects strategy_context["previous_outputs"][].summary verbatim into
the next agent's system prompt under "Previous Analysis from Other Agents". When
the assistant is down, an agent's `text` is client-safe failure copy — "The
strategy assistant is taking a moment..." — not analysis. Letting that through
would have the next agent reason about our outage, and would persist it as
insight.

These tests pin the whole path: what reaches the next prompt, what reaches
agent_logs, and what reaches the client as a confidence score.
"""

import pytest

from app import ai_client
from app.agents import base_agent as base_agent_module
from app.agents.base_agent import BaseAgent
from app.agents.orchestrator import (
    Orchestrator, _failed, _should_regenerate, _validation_feedback,
)
from app.agents.validation_agent import ValidationAgent


FAILURE_COPY = ai_client.user_message("unavailable")
FAILURE_COPY_AR = ai_client.user_message("unavailable", "ar")
REAL_ANSWER = "[Vision]: Become the leading tailored-AI partner in the GCC."


def _failure_envelope(kind="unavailable"):
    """What call_ai_with_fallback returns when every provider is down."""
    return {
        "text": ai_client.user_message(kind),
        "tokens": 0,
        "provider": "none",
        "fallback_used": True,
        "ok": False,
        "error_kind": kind,
    }


def _success_envelope(text=REAL_ANSWER):
    return {
        "text": text,
        "tokens": 42,
        "provider": "claude",
        "fallback_used": False,
        "ok": True,
        "error_kind": None,
    }


class RecordingAgent(BaseAgent):
    """An agent that records the system prompt it was handed."""

    name = "recorder"

    def __init__(self):
        self.prompts = []


@pytest.fixture
def captured(monkeypatch):
    """Capture every system prompt sent and every agent_logs row written."""
    sent = {"prompts": [], "logs": []}

    async def fake_log(self, **kwargs):
        sent["logs"].append({"agent": self.name, **kwargs})

    monkeypatch.setattr(BaseAgent, "_log", fake_log)

    def install(envelope):
        async def fake_call(messages, system=None, max_tokens=1024, **kw):
            sent["prompts"].append(system or "")
            return envelope() if callable(envelope) else envelope
        monkeypatch.setattr(base_agent_module, "call_ai_with_fallback", fake_call)

    sent["install"] = install
    return sent


# ─────────────────────────────────────────────────────────────────
# THE CONTAMINATION PATH
# ─────────────────────────────────────────────────────────────────

class TestFailureNeverReachesTheNextPrompt:
    async def test_agent_b_prompt_contains_no_part_of_agent_a_failure(self, captured):
        """Agent A fails; agent B runs; B's prompt must be clean."""
        captured["install"](_failure_envelope())
        agent_a = RecordingAgent()
        context = {"strategy_id": "s1", "source_of_truth": "", "previous_outputs": []}

        result_a = await agent_a.call([{"role": "user", "content": "Analyse this"}], context)
        assert result_a["ok"] is False

        # However the caller wires A's result forward, B must not read it.
        context["previous_outputs"] = _validation_feedback(
            {"ok": False, "warnings": [result_a["text"]], "confidence_score": None}
        )
        assert context["previous_outputs"] == []

        captured["install"](_success_envelope())
        agent_b = RecordingAgent()
        await agent_b.call([{"role": "user", "content": "Continue"}], context)

        prompt_b = captured["prompts"][-1]
        assert "Previous Analysis" not in prompt_b
        for fragment in FAILURE_COPY.split(". "):
            assert fragment.strip() not in prompt_b
        for fragment in ("taking a moment", "inputs are saved", "continue manually"):
            assert fragment not in prompt_b.lower()

    async def test_a_hand_planted_failure_entry_is_filtered_out(self, captured):
        """Defence in depth: even if something upstream forgets, base_agent drops it."""
        captured["install"](_success_envelope())
        agent = RecordingAgent()
        await agent.call(
            [{"role": "user", "content": "Continue"}],
            {
                "strategy_id": "s1",
                "source_of_truth": "",
                "previous_outputs": [
                    {"agent": "advisor", "summary": FAILURE_COPY, "ok": False},
                    {"agent": "advisor", "summary": FAILURE_COPY_AR, "ok": False},
                ],
            },
        )
        prompt = captured["prompts"][-1]
        assert "Previous Analysis" not in prompt
        assert "taking a moment" not in prompt
        assert "مساعد الاستراتيجية" not in prompt

    async def test_genuine_previous_output_still_reaches_the_next_prompt(self, captured):
        captured["install"](_success_envelope())
        agent = RecordingAgent()
        await agent.call(
            [{"role": "user", "content": "Continue"}],
            {
                "strategy_id": "s1",
                "source_of_truth": "",
                "previous_outputs": [
                    {"agent": "validation", "summary": "Targets look unrealistic for Q4", "ok": True},
                ],
            },
        )
        prompt = captured["prompts"][-1]
        assert "Previous Analysis from Other Agents" in prompt
        assert "Targets look unrealistic for Q4" in prompt

    async def test_a_malformed_previous_output_cannot_kill_the_call(self, captured):
        """p['agent'] used to KeyError the whole agent call."""
        captured["install"](_success_envelope())
        agent = RecordingAgent()
        result = await agent.call(
            [{"role": "user", "content": "Continue"}],
            {
                "strategy_id": "s1",
                "source_of_truth": "",
                "previous_outputs": [
                    {"summary": "No agent key here"},   # missing 'agent'
                    {"agent": "orphan"},                 # missing 'summary'
                    {"agent": "blank", "summary": "  "},  # whitespace only
                    "not even a dict",
                    None,
                ],
            },
        )
        assert result["ok"] is True
        prompt = captured["prompts"][-1]
        assert "No agent key here" in prompt   # salvaged, labelled generically
        assert "[agent]:" in prompt
        assert "orphan" not in prompt          # nothing to say, so not injected


class TestValidationFeedbackBuilder:
    def test_drops_feedback_from_a_validator_that_never_ran(self):
        assert _validation_feedback({"ok": False, "warnings": ["anything"]}) == []
        assert _validation_feedback(None) == []
        assert _validation_feedback({}) == []

    def test_drops_empty_feedback(self):
        assert _validation_feedback({"ok": True, "warnings": [], "contradictions": []}) == []

    def test_keeps_real_feedback_and_marks_it_ok(self):
        out = _validation_feedback({
            "ok": True,
            "warnings": ["Targets are optimistic"],
            "contradictions": ["Revenue figure conflicts with the deck"],
        })
        assert len(out) == 1
        assert out[0]["ok"] is True
        assert "Targets are optimistic" in out[0]["summary"]
        assert "Revenue figure conflicts with the deck" in out[0]["summary"]

    def test_regeneration_only_fires_on_a_measured_score(self):
        assert _should_regenerate({"confidence_score": 42}) is True
        assert _should_regenerate({"confidence_score": 90}) is False
        # unknown is not zero — a failed validator must not trigger a second pass
        assert _should_regenerate({"confidence_score": None}) is False
        assert _should_regenerate({}) is False
        assert _should_regenerate(None) is False


class TestValidatorDoesNotFabricateConfidence:
    async def test_failed_validator_reports_unknown_not_75(self, captured):
        captured["install"](_failure_envelope())
        validation = await ValidationAgent().validate(
            agent_name="strategy_advisor",
            agent_output=REAL_ANSWER,
            task_type="advisor_chat",
            strategy_context={"strategy_id": "s1"},
        )
        assert validation["ok"] is False
        assert validation["confidence_score"] is None   # not a fabricated 75
        assert validation["validated"] is None
        assert validation["warnings"] == []
        assert _should_regenerate(validation) is False
        assert _validation_feedback(validation) == []

    async def test_working_validator_still_scores_normally(self, captured):
        captured["install"](_success_envelope('{"confidence_score": 88, "validated": true}'))
        validation = await ValidationAgent().validate(
            agent_name="strategy_advisor",
            agent_output=REAL_ANSWER,
            task_type="advisor_chat",
            strategy_context={"strategy_id": "s1"},
        )
        assert validation["ok"] is True
        assert validation["confidence_score"] == 88


# ─────────────────────────────────────────────────────────────────
# WHAT GETS RECORDED
# ─────────────────────────────────────────────────────────────────

class TestFailuresAreLoggedAsFailures:
    async def test_failure_row_records_no_output_and_no_model(self, captured):
        captured["install"](_failure_envelope("busy"))
        await RecordingAgent().call([{"role": "user", "content": "Analyse"}], {"strategy_id": "s1"})

        row = captured["logs"][-1]
        assert row["ok"] is False
        assert row["output_summary"] == "[unavailable: busy]"
        assert row["model_used"] == "unavailable"
        # The client copy must not be filed as though an agent produced it.
        assert FAILURE_COPY not in row["output_summary"]
        assert "Claude" not in row["model_used"]

    async def test_success_row_is_unchanged(self, captured):
        captured["install"](_success_envelope())
        await RecordingAgent().call([{"role": "user", "content": "Analyse"}], {"strategy_id": "s1"})

        row = captured["logs"][-1]
        assert row["ok"] is True
        assert row["output_summary"] == REAL_ANSWER
        assert row["model_used"] == "Claude"

    async def test_failed_validator_row_is_also_marked(self, captured):
        captured["install"](_failure_envelope())
        await ValidationAgent().validate(
            agent_name="strategy_advisor", agent_output=REAL_ANSWER,
            task_type="advisor_chat", strategy_context={"strategy_id": "s1"},
        )
        rows = [r for r in captured["logs"] if r.get("ok") is False]
        assert rows, "the validator's own failure must be recorded as a failure"
        assert all(r["model_used"] == "unavailable" for r in rows)
        # Neither the inner call() row nor validate()'s own row may claim a score.
        assert all(r.get("confidence_score") is None for r in rows)


class TestAgentLogsTableCheckIsCached:
    async def test_information_schema_is_queried_once_not_per_call(self, monkeypatch):
        """This ran once per agent per request over the public Postgres proxy."""
        base_agent_module._reset_agent_logs_table_cache()
        checks = {"n": 0}

        class Conn:
            async def fetchval(self, *a, **kw):
                checks["n"] += 1
                return True
            async def execute(self, *a, **kw):
                return "INSERT 0 1"

        class Acquire:
            async def __aenter__(self): return Conn()
            async def __aexit__(self, *a): return False

        class Pool:
            def acquire(self): return Acquire()

        async def fake_pool():
            return Pool()

        monkeypatch.setattr(base_agent_module, "get_pool", fake_pool)

        agent = RecordingAgent()
        for _ in range(5):
            await agent._log(task_type="t", ok=True)

        assert checks["n"] == 1
        base_agent_module._reset_agent_logs_table_cache()

    async def test_a_logging_failure_still_warns_rather_than_raising(self, monkeypatch, caplog):
        base_agent_module._reset_agent_logs_table_cache()

        async def exploding_pool():
            raise RuntimeError("connection refused")

        monkeypatch.setattr(base_agent_module, "get_pool", exploding_pool)
        with caplog.at_level("WARNING", logger="stairs.agents"):
            await RecordingAgent()._log(task_type="t", ok=True)   # must not raise
        assert any("Failed to log agent call" in r.getMessage() for r in caplog.records)
        base_agent_module._reset_agent_logs_table_cache()


# ─────────────────────────────────────────────────────────────────
# END TO END THROUGH THE ORCHESTRATOR
# ─────────────────────────────────────────────────────────────────

class TestOrchestratorEndToEnd:
    async def test_a_dead_assistant_produces_one_call_and_no_validation(self, captured):
        captured["install"](_failure_envelope())
        result = await Orchestrator().process(
            task_type="chat",
            payload={"message": "How do we grow?", "context_parts": []},
            strategy_context={"strategy_id": "s1", "source_of_truth": "", "previous_outputs": []},
        )

        assert _failed(result)
        assert result["validation"] is None
        assert result["agent_chain"] == ["strategy_advisor"]
        # One call: no validation pass, no regeneration pass.
        assert len(captured["prompts"]) == 1

    async def test_no_prompt_in_the_whole_flow_carries_failure_copy(self, captured):
        """Advisor fails, then the validator is asked about a *working* answer."""
        calls = {"n": 0}

        def envelope():
            calls["n"] += 1
            return _failure_envelope() if calls["n"] == 1 else _success_envelope()

        captured["install"](envelope)
        await Orchestrator().process(
            task_type="chat",
            payload={"message": "How do we grow?", "context_parts": []},
            strategy_context={"strategy_id": "s1", "source_of_truth": "", "previous_outputs": []},
        )

        for prompt in captured["prompts"]:
            assert "taking a moment" not in prompt.lower()
            assert "Previous Analysis" not in prompt


class TestTableCacheRecoversFromAMissingTable:
    """The positive is cached; the negative deliberately is not.

    ensure_agent_logs_table() warns and continues on failure like every other
    startup migration, so "table missing" is a state the process can recover
    from. Latching it would silently disable agent logging for the life of the
    process — worse than one wasted query per call in an already-broken state.
    """

    def _pool(self, exists_sequence, record):
        class Conn:
            async def fetchval(self, *a, **kw):
                record["checks"] += 1
                return exists_sequence.pop(0) if exists_sequence else True
            async def execute(self, *a, **kw):
                record["inserts"] += 1
                return "INSERT 0 1"

        class Acquire:
            async def __aenter__(self): return Conn()
            async def __aexit__(self, *a): return False

        class Pool:
            def acquire(self): return Acquire()

        async def get_pool():
            return Pool()
        return get_pool

    async def test_table_missing_then_present_still_inserts(self, monkeypatch):
        base_agent_module._reset_agent_logs_table_cache()
        record = {"checks": 0, "inserts": 0}
        monkeypatch.setattr(base_agent_module, "get_pool",
                            self._pool([False, True], record))

        agent = RecordingAgent()
        await agent._log(task_type="t", ok=True)      # table not there yet
        assert record["inserts"] == 0

        await agent._log(task_type="t", ok=True)      # migration has since run
        assert record["inserts"] == 1, "a missing table must not latch off permanently"
        assert record["checks"] == 2

        # ...and now that it has been seen, stop asking.
        await agent._log(task_type="t", ok=True)
        assert record["checks"] == 2
        assert record["inserts"] == 2
        base_agent_module._reset_agent_logs_table_cache()

    async def test_the_positive_is_still_cached_after_the_first_hit(self, monkeypatch):
        base_agent_module._reset_agent_logs_table_cache()
        record = {"checks": 0, "inserts": 0}
        monkeypatch.setattr(base_agent_module, "get_pool", self._pool([True], record))

        agent = RecordingAgent()
        for _ in range(5):
            await agent._log(task_type="t", ok=True)

        assert record["checks"] == 1
        assert record["inserts"] == 5
        base_agent_module._reset_agent_logs_table_cache()


class TestOneAiCallIsOneLogRow:
    async def test_validate_writes_a_single_row_carrying_the_score(self, captured):
        captured["install"](_success_envelope('{"confidence_score": 88, "validated": true}'))
        await ValidationAgent().validate(
            agent_name="strategy_advisor", agent_output=REAL_ANSWER,
            task_type="advisor_chat", strategy_context={"strategy_id": "s1"},
        )
        rows = [r for r in captured["logs"] if r["agent"] == "validation"]
        assert len(rows) == 1, "call() must not log when validate() logs a richer row"
        assert rows[0]["confidence_score"] == 88
        assert rows[0]["ok"] is True

    async def test_a_failed_validate_also_writes_exactly_one_row(self, captured):
        captured["install"](_failure_envelope())
        await ValidationAgent().validate(
            agent_name="strategy_advisor", agent_output=REAL_ANSWER,
            task_type="advisor_chat", strategy_context={"strategy_id": "s1"},
        )
        rows = [r for r in captured["logs"] if r["agent"] == "validation"]
        assert len(rows) == 1
        assert rows[0]["ok"] is False
        assert rows[0]["confidence_score"] is None

    async def test_ordinary_agents_still_log_themselves(self, captured):
        captured["install"](_success_envelope())
        await RecordingAgent().call([{"role": "user", "content": "x"}], {"strategy_id": "s1"})
        assert len(captured["logs"]) == 1

    async def test_log_false_writes_nothing(self, captured):
        captured["install"](_success_envelope())
        await RecordingAgent().call([{"role": "user", "content": "x"}], {"strategy_id": "s1"}, log=False)
        assert captured["logs"] == []


class TestEveryFallbackReturnPathSetsOk:
    """base_agent defaults ok to True, so a return path that forgets to set it
    would make a failure read as success — the exact inversion this work exists
    to prevent. Lock every exit of call_ai_with_fallback."""

    def test_no_return_path_omits_ok_or_error_kind(self):
        import ast, inspect
        from app import ai_providers

        tree = ast.parse(inspect.getsource(ai_providers))
        fn = next(n for n in ast.walk(tree)
                  if isinstance(n, ast.AsyncFunctionDef) and n.name == "call_ai_with_fallback")
        returns = [n for n in ast.walk(fn) if isinstance(n, ast.Return)]
        assert returns, "expected explicit returns"

        for r in returns:
            assert isinstance(r.value, ast.Dict), f"line {r.lineno} returns a non-dict"
            keys = [k.value for k in r.value.keys]
            assert "ok" in keys, f"return at line {r.lineno} omits 'ok'"
            assert "error_kind" in keys, f"return at line {r.lineno} omits 'error_kind'"

        # No implicit `return None` off the end, and no handler returning bare.
        assert isinstance(fn.body[-1], ast.Return), "function must end in an explicit return"
        assert not [r for r in returns if r.value is None]

    async def test_a_result_without_ok_is_read_as_success_not_failure(self, captured):
        """Documents the default: a legacy envelope keeps working as an answer."""
        captured["install"]({"text": REAL_ANSWER, "tokens": 1, "provider": "claude"})
        result = await RecordingAgent().call([{"role": "user", "content": "x"}], {"strategy_id": "s1"})
        assert result["ok"] is True
        assert result["text"] == REAL_ANSWER
