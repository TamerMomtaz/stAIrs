"""Strategy Advisor (Agent 3) — Conversational chat agent for strategy questions."""

from datetime import datetime

from app.agents.base_agent import BaseAgent


class AdvisorAgent(BaseAgent):
    name = "strategy_advisor"
    role = "Conversational strategy advisor answering questions, providing insights, and citing Source of Truth data"

    def _build_system_prompt(self, strategy_context: dict = None) -> str:
        company = ""
        industry = ""
        strategy_name = ""
        if strategy_context:
            company = strategy_context.get("company", "")
            industry = strategy_context.get("industry", "")
            strategy_name = strategy_context.get("strategy_name", "")

        # Load knowledge cache for enriched prompt
        enrichment = ""
        try:
            from app.main import _knowledge_cache
            cached_prompt = _knowledge_cache.get("system_prompt", "")
            if cached_prompt:
                enrichment = cached_prompt
        except Exception:
            pass

        base = enrichment or f"""You are Stairs, an AI strategy assistant created by DEVONEERS.
The current year is {datetime.now().year}.
You help organizations build, execute, and monitor their strategic plans.
Expert in: OKR, Balanced Scorecard, OGSM, Hoshin Kanri, Blue Ocean Strategy, Porter's frameworks.
Philosophy: "Human IS the Loop" — you suggest, humans decide.
Keep responses concise and actionable. Use Arabic when the user writes in Arabic.
Format measurable items with clear targets, units, and timeframes."""

        advisor_role = f"""

YOUR ROLE: Strategy Advisor — the primary conversational interface for strategy questions.

CAPABILITIES:
- Answer strategy questions with data-driven insights
- Reference and cite Source of Truth documents when available
- Identify when a user is asking for a matrix/framework analysis and flag it
- Provide actionable recommendations grounded in the company's data
- Support both English and Arabic responses

{"CURRENT CONTEXT: You are advising " + company + (" in the " + industry + " sector" if industry else "") + "." if company else ""}
{"Strategy: " + strategy_name if strategy_name else ""}
{"IMPORTANT: The company you are advising is " + company + ". Do NOT use any other company name, even if uploaded documents mention other companies." if company else ""}

CITATION RULES:
- When your answer uses data from uploaded documents, cite the source document name in parentheses, e.g. (Source: filename.pdf)
- Prefer verified Source of Truth data over assumptions
- If you lack data to answer confidently, say so and suggest what data would help"""

        return base + advisor_role

    async def chat(self, user_message: str, context_parts: list, strategy_context: dict = None) -> dict:
        """Handle a conversational chat message.

        context_parts: list of context strings (stairs, focused element, etc.)
        """
        full_content = f"CONTEXT:\n{chr(10).join(context_parts)}\n\nUSER QUESTION:\n{user_message}"
        result = await self.call(
            messages=[{"role": "user", "content": full_content}],
            strategy_context=strategy_context,
            max_tokens=1024,
            task_type="advisor_chat",
        )
        return result
