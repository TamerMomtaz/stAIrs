"""Base Agent — Foundation for all specialized agents in the ensemble."""

import logging
import uuid
from datetime import datetime

from app.ai_providers import call_ai_with_fallback, PROVIDER_DISPLAY
from app.db.connection import get_pool

logger = logging.getLogger("stairs.agents")

# True once agent_logs has been seen to exist. Deliberately one-way: a table
# that exists cannot stop existing under us, so the positive is cached and the
# information_schema round-trip (once per agent per request, over the public
# Postgres proxy) disappears. The negative is NOT cached, because
# ensure_agent_logs_table() warns and continues on failure like every other
# startup migration — so "missing" is a state the process can recover from, and
# latching it would silently disable agent logging for the life of the process.
# A missing table therefore costs one query per call, in an already-broken state.
_agent_logs_table: bool = False


def _reset_agent_logs_table_cache():
    """Test hook — forget that we have seen the table."""
    global _agent_logs_table
    _agent_logs_table = False


class BaseAgent:
    """Base class for all specialized agents.

    Each agent has:
    - A name and role description
    - A specialized system prompt
    - A call method that uses the existing multi-AI fallback
    - Logging of every call to the agent_logs table
    - Source of Truth context injection
    """

    name: str = "base"
    role: str = "General purpose AI agent"

    def _build_system_prompt(self, strategy_context: dict = None) -> str:
        """Build the agent's specialized system prompt.

        Subclasses override this to provide their own prompt.
        strategy_context may include verified Source of Truth data.
        """
        return (
            "You are Stairs, an AI strategy assistant created by DEVONEERS.\n"
            f"The current year is {datetime.now().year}.\n"
            'Philosophy: "Human IS the Loop" — you suggest, humans decide.'
        )

    async def call(
        self,
        messages: list,
        strategy_context: dict = None,
        max_tokens: int = 1024,
        task_type: str = "",
        log: bool = True,
    ) -> dict:
        """Call the AI with the agent's specialized system prompt.

        Uses the existing multi-AI fallback chain (Claude -> GPT-4o -> Gemini).
        Logs the call to agent_logs for traceability unless log=False.

        Returns:
            {
                "text": str,           # the answer — OR, when ok is False,
                                       # client-safe failure copy in its place
                                       # ("The strategy assistant is taking a
                                       # moment..."). Never a status code.
                "tokens": int,
                "provider": str,
                "provider_display": str,
                "fallback_used": bool,
                "ok": bool,            # False when no provider produced an
                                       # answer. Callers MUST branch on this
                                       # before treating `text` as output:
                                       # persisting, validating, chaining into
                                       # another agent's prompt or showing it as
                                       # analysis are all wrong when ok is False.
                "error_kind": str|None, # no_key | unavailable | busy |
                                        # too_long | offline; None when ok.
                "agent": str,
            }

        Args:
            log: write a row to agent_logs. Pass False when the caller logs a
                 richer row itself, so one AI call does not become two rows.
        """
        system_prompt = self._build_system_prompt(strategy_context)

        # Inject Source of Truth context if available
        if strategy_context:
            sot = strategy_context.get("source_of_truth")
            if sot:
                system_prompt += "\n\n=== Verified Strategy Data (Source of Truth) ===\n"
                system_prompt += sot
                system_prompt += "\n=== End Verified Data ===\n"

            # Inject previous agent outputs for chain context.
            # A failed call carries client-safe failure copy in place of an
            # answer — injecting that would have the next agent reason about
            # our outage. Drop anything marked failed or empty, and read the
            # fields defensively so one malformed entry can't kill the call.
            prev = [
                p for p in (strategy_context.get("previous_outputs") or [])
                if isinstance(p, dict) and p.get("ok") is not False and str(p.get("summary") or "").strip()
            ]
            if prev:
                system_prompt += "\n\n=== Previous Analysis from Other Agents ===\n"
                for p in prev:
                    system_prompt += f"\n[{p.get('agent', 'agent')}]: {p.get('summary')}\n"
                system_prompt += "=== End Previous Analysis ===\n"

        result = await call_ai_with_fallback(
            messages=messages,
            system=system_prompt,
            max_tokens=max_tokens,
        )

        text = result.get("text", "")
        tokens = result.get("tokens", 0)
        provider = result.get("provider", "none")
        provider_display = PROVIDER_DISPLAY.get(provider, provider)
        ok = result.get("ok", True)
        error_kind = result.get("error_kind")

        # Log to agent_logs table
        strategy_id = strategy_context.get("strategy_id") if strategy_context else None
        input_summary = ""
        if messages:
            content = messages[-1].get("content", "")
            input_summary = content[:500] if isinstance(content, str) else str(content)[:500]

        if ok:
            output_summary = text[:500] if text else ""
            model_used = provider_display
        else:
            # `text` is client-safe failure copy, not something an agent said.
            # Recording it as output_summary makes a dead call look like an
            # answer to anything that later reads the log — and naming a model
            # credits one for work it never did.
            output_summary = f"[unavailable: {error_kind or 'unknown'}]"
            model_used = "unavailable"

        if log:
            await self._log(
                strategy_id=strategy_id,
                task_type=task_type or self.name,
                input_summary=input_summary,
                output_summary=output_summary,
                tokens_used=tokens,
                model_used=model_used,
                ok=ok,
            )

        return {
            "text": text,
            "tokens": tokens,
            "provider": provider,
            "provider_display": provider_display,
            "fallback_used": result.get("fallback_used", False),
            # ok=False means `text` is client-safe failure copy, not an answer.
            "ok": ok,
            "error_kind": error_kind,
            "agent": self.name,
        }

    async def _log(
        self,
        strategy_id: str = None,
        task_type: str = "",
        input_summary: str = "",
        output_summary: str = "",
        tokens_used: int = 0,
        model_used: str = "",
        confidence_score: int = None,
        ok: bool = None,
    ):
        """Log agent call to the agent_logs database table.

        ok is nullable: True/False for calls that went through call(), NULL for
        rows written before the column existed, so the transparency panel can
        separate dead calls from real ones instead of averaging them together.
        """
        global _agent_logs_table
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                if not _agent_logs_table:
                    # Re-checked every call until it succeeds once; see the note
                    # on _agent_logs_table for why the negative isn't cached.
                    if await conn.fetchval(
                        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_logs')"
                    ):
                        _agent_logs_table = True
                if _agent_logs_table:
                    await conn.execute(
                        "INSERT INTO agent_logs (id, strategy_id, agent_name, task_type, "
                        "input_summary, output_summary, tokens_used, model_used, confidence_score, ok) "
                        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
                        str(uuid.uuid4()),
                        strategy_id,
                        self.name,
                        task_type,
                        input_summary[:500],
                        output_summary[:500],
                        tokens_used,
                        model_used,
                        confidence_score,
                        ok,
                    )
        except Exception as e:
            logger.warning("Failed to log agent call: %s", e)
