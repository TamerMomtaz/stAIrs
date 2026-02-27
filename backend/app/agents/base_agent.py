"""Base Agent — Foundation for all specialized agents in the ensemble."""

import json
import logging
import uuid
from datetime import datetime, timezone

from app.ai_providers import call_ai_with_fallback, PROVIDER_DISPLAY
from app.db.connection import get_pool

logger = logging.getLogger("stairs.agents")


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
    ) -> dict:
        """Call the AI with the agent's specialized system prompt.

        Uses the existing multi-AI fallback chain (Claude -> GPT-4o -> Gemini).
        Logs the call to agent_logs for traceability.

        Returns:
            {
                "text": str,
                "tokens": int,
                "provider": str,
                "provider_display": str,
                "fallback_used": bool,
                "agent": str,
            }
        """
        system_prompt = self._build_system_prompt(strategy_context)

        # Inject Source of Truth context if available
        if strategy_context:
            sot = strategy_context.get("source_of_truth")
            if sot:
                system_prompt += "\n\n=== Verified Strategy Data (Source of Truth) ===\n"
                system_prompt += sot
                system_prompt += "\n=== End Verified Data ===\n"

            # Inject previous agent outputs for chain context
            prev = strategy_context.get("previous_outputs")
            if prev:
                system_prompt += "\n\n=== Previous Analysis from Other Agents ===\n"
                for p in prev:
                    system_prompt += f"\n[{p['agent']}]: {p['summary']}\n"
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

        # Log to agent_logs table
        strategy_id = strategy_context.get("strategy_id") if strategy_context else None
        input_summary = ""
        if messages:
            content = messages[-1].get("content", "")
            input_summary = content[:500] if isinstance(content, str) else str(content)[:500]
        output_summary = text[:500] if text else ""

        await self._log(
            strategy_id=strategy_id,
            task_type=task_type or self.name,
            input_summary=input_summary,
            output_summary=output_summary,
            tokens_used=tokens,
            model_used=provider_display,
        )

        return {
            "text": text,
            "tokens": tokens,
            "provider": provider,
            "provider_display": provider_display,
            "fallback_used": result.get("fallback_used", False),
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
    ):
        """Log agent call to the agent_logs database table."""
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                table_exists = await conn.fetchval(
                    "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_logs')"
                )
                if table_exists:
                    await conn.execute(
                        "INSERT INTO agent_logs (id, strategy_id, agent_name, task_type, "
                        "input_summary, output_summary, tokens_used, model_used, confidence_score) "
                        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
                        str(uuid.uuid4()),
                        strategy_id,
                        self.name,
                        task_type,
                        input_summary[:500],
                        output_summary[:500],
                        tokens_used,
                        model_used,
                        confidence_score,
                    )
        except Exception as e:
            logger.warning("Failed to log agent call: %s", e)
