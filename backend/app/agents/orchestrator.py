"""Orchestrator Agent (Agent 6) — Routes requests to specialist agents and manages shared context."""

import json
import logging

from app.agents.base_agent import BaseAgent
from app.agents.document_agent import DocumentAgent
from app.agents.strategy_agent import StrategyAgent
from app.agents.advisor_agent import AdvisorAgent
from app.agents.execution_agent import ExecutionAgent
from app.agents.validation_agent import ValidationAgent
from app.db.connection import get_pool

logger = logging.getLogger("stairs.orchestrator")

# Matrix/framework keywords that trigger the Strategy Agent
_FRAMEWORK_KEYWORDS = [
    "ife matrix", "efe matrix", "space matrix", "bcg matrix",
    "porter", "five forces", "swot", "pestel", "pestle",
    "cpm matrix", "ie matrix", "grand strategy", "qspm",
    "competitive profile", "internal factor", "external factor",
    "value chain", "blue ocean", "ansoff",
    "مصفوفة", "تحليل", "بورتر",  # Arabic keywords
]


def _is_framework_request(message: str) -> bool:
    """Detect if a user message is asking for a strategic framework analysis."""
    lower = message.lower()
    return any(kw in lower for kw in _FRAMEWORK_KEYWORDS)


class Orchestrator:
    """Routes incoming requests to the correct specialist agent.

    Maintains shared context between agents and chains them when needed.
    Exposes a single entry point: process(task_type, strategy_id, payload).
    """

    def __init__(self):
        self.document_agent = DocumentAgent()
        self.strategy_agent = StrategyAgent()
        self.advisor_agent = AdvisorAgent()
        self.execution_agent = ExecutionAgent()
        self.validation_agent = ValidationAgent()

    async def _build_strategy_context(self, strategy_id: str = None) -> dict:
        """Build a shared strategy context object for agents.

        Includes strategy metadata and verified Source of Truth data.
        """
        context = {
            "strategy_id": strategy_id,
            "company": "",
            "industry": "",
            "strategy_name": "",
            "source_of_truth": "",
            "previous_outputs": [],
        }
        if not strategy_id:
            return context

        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                # Fetch strategy metadata
                strat = await conn.fetchrow(
                    "SELECT name, company, industry FROM strategies WHERE id = $1",
                    strategy_id,
                )
                if strat:
                    context["company"] = strat.get("company") or ""
                    context["industry"] = strat.get("industry") or ""
                    context["strategy_name"] = strat.get("name") or ""

                # Fetch approved Source of Truth extractions
                sot_rows = await conn.fetch(
                    "SELECT content, metadata FROM strategy_sources "
                    "WHERE strategy_id = $1 AND source_type = 'ai_extraction' "
                    "ORDER BY created_at DESC LIMIT 100",
                    strategy_id,
                )
                if sot_rows:
                    sot_parts = []
                    for row in sot_rows:
                        meta = row["metadata"] if isinstance(row["metadata"], dict) else json.loads(row["metadata"] or "{}")
                        cat = meta.get("category", "General")
                        fname = meta.get("parent_filename", "")
                        text = row["content"][:500]
                        src = f" [from: {fname}]" if fname else ""
                        sot_parts.append(f"[{cat}] {text}{src}")
                    context["source_of_truth"] = "\n".join(sot_parts)
        except Exception as e:
            logger.warning("Failed to build strategy context: %s", e)

        return context

    async def _validate_output(
        self,
        agent_name: str,
        output_text: str,
        task_type: str,
        strategy_context: dict,
    ) -> dict:
        """Run the Validation Agent on an agent's output.

        Returns validation result with confidence_score.
        If confidence < 60, returns a flag for regeneration.
        """
        validation = await self.validation_agent.validate(
            agent_name=agent_name,
            agent_output=output_text,
            task_type=task_type,
            strategy_context=strategy_context,
        )
        return validation

    async def process(
        self,
        task_type: str,
        strategy_id: str = None,
        payload: dict = None,
        strategy_context: dict = None,
    ) -> dict:
        """Single entry point for all AI requests.

        Routes to the correct specialist agent based on task_type.

        Args:
            task_type: The type of task (chat, document_analysis, questionnaire, etc.)
            strategy_id: Optional strategy UUID for context
            payload: Task-specific data
            strategy_context: Optional pre-built context (skips DB queries if provided)

        Returns:
            Agent result dict with text, tokens, provider, plus validation data
        """
        payload = payload or {}
        if strategy_context is None:
            strategy_context = await self._build_strategy_context(strategy_id)

        if task_type == "chat":
            return await self._handle_chat(payload, strategy_context)
        elif task_type == "document_analysis":
            return await self._handle_document_analysis(payload, strategy_context)
        elif task_type == "questionnaire":
            return await self._handle_questionnaire(payload, strategy_context)
        elif task_type == "prefill_questionnaire":
            return await self._handle_prefill_questionnaire(payload, strategy_context)
        elif task_type == "action_plan":
            return await self._handle_action_plan(payload, strategy_context)
        elif task_type == "customized_plan":
            return await self._handle_customized_plan(payload, strategy_context)
        elif task_type == "explain_action":
            return await self._handle_explain_action(payload, strategy_context)
        elif task_type == "implementation_guide":
            return await self._handle_implementation_guide(payload, strategy_context)
        else:
            # Default to advisor for unknown task types
            return await self._handle_chat(payload, strategy_context)

    async def _handle_chat(self, payload: dict, strategy_context: dict) -> dict:
        """Handle chat requests — routes to Advisor, may chain to Strategy Agent."""
        message = payload.get("message", "")
        context_parts = payload.get("context_parts", [])

        # Check if user is asking for a framework analysis
        if _is_framework_request(message):
            # Chain: Strategy Agent first, then Advisor presents results
            framework_result = await self.strategy_agent.run_framework(
                framework="auto",
                user_message=f"CONTEXT:\n{chr(10).join(context_parts)}\n\nUSER REQUEST:\n{message}",
                strategy_context=strategy_context,
            )

            # Validate strategy output
            validation = await self._validate_output(
                agent_name=self.strategy_agent.name,
                output_text=framework_result["text"],
                task_type="framework_analysis",
                strategy_context=strategy_context,
            )

            # If low confidence, regenerate with feedback
            if validation["confidence_score"] < 60:
                strategy_context["previous_outputs"] = [{
                    "agent": "validation",
                    "summary": f"Validation feedback: {'; '.join(validation.get('warnings', [])[:3])}. "
                               f"Contradictions: {'; '.join(validation.get('contradictions', [])[:3])}",
                }]
                framework_result = await self.strategy_agent.run_framework(
                    framework="auto",
                    user_message=f"CONTEXT:\n{chr(10).join(context_parts)}\n\nUSER REQUEST:\n{message}",
                    strategy_context=strategy_context,
                )
                # Re-validate
                validation = await self._validate_output(
                    agent_name=self.strategy_agent.name,
                    output_text=framework_result["text"],
                    task_type="framework_analysis",
                    strategy_context=strategy_context,
                )

            framework_result["validation"] = validation
            framework_result["agent_chain"] = ["strategy_analyst", "validation"]
            return framework_result

        # Regular chat — Advisor Agent
        result = await self.advisor_agent.chat(
            user_message=message,
            context_parts=context_parts,
            strategy_context=strategy_context,
        )

        # Validate advisor output
        validation = await self._validate_output(
            agent_name=self.advisor_agent.name,
            output_text=result["text"],
            task_type="advisor_chat",
            strategy_context=strategy_context,
        )

        if validation["confidence_score"] < 60:
            strategy_context["previous_outputs"] = [{
                "agent": "validation",
                "summary": f"Validation feedback: {'; '.join(validation.get('warnings', [])[:3])}",
            }]
            result = await self.advisor_agent.chat(
                user_message=message,
                context_parts=context_parts,
                strategy_context=strategy_context,
            )
            validation = await self._validate_output(
                agent_name=self.advisor_agent.name,
                output_text=result["text"],
                task_type="advisor_chat",
                strategy_context=strategy_context,
            )

        result["validation"] = validation
        result["agent_chain"] = ["strategy_advisor", "validation"]
        return result

    async def _handle_document_analysis(self, payload: dict, strategy_context: dict) -> dict:
        """Handle document analysis requests."""
        document_text = payload.get("document_text", "")

        result = await self.document_agent.analyze_document(
            document_text=document_text,
            strategy_context=strategy_context,
        )

        validation = await self._validate_output(
            agent_name=self.document_agent.name,
            output_text=result["text"],
            task_type="document_analysis",
            strategy_context=strategy_context,
        )

        if validation["confidence_score"] < 60:
            strategy_context["previous_outputs"] = [{
                "agent": "validation",
                "summary": f"Validation feedback: {'; '.join(validation.get('warnings', [])[:3])}",
            }]
            result = await self.document_agent.analyze_document(
                document_text=document_text,
                strategy_context=strategy_context,
            )
            validation = await self._validate_output(
                agent_name=self.document_agent.name,
                output_text=result["text"],
                task_type="document_analysis",
                strategy_context=strategy_context,
            )

        result["validation"] = validation
        result["agent_chain"] = ["document_analyst", "validation"]
        return result

    async def _handle_questionnaire(self, payload: dict, strategy_context: dict) -> dict:
        """Handle questionnaire generation."""
        result = await self.strategy_agent.generate_questionnaire(
            company_name=payload.get("company_name", ""),
            company_brief=payload.get("company_brief"),
            industry=payload.get("industry"),
            strategy_type=payload.get("strategy_type", "general"),
            strategy_context=strategy_context,
        )

        # Questionnaire validation is lighter — skip regeneration loop
        validation = await self._validate_output(
            agent_name=self.strategy_agent.name,
            output_text=result["text"],
            task_type="questionnaire",
            strategy_context=strategy_context,
        )

        result["validation"] = validation
        result["agent_chain"] = ["strategy_analyst", "validation"]
        return result

    async def _handle_prefill_questionnaire(self, payload: dict, strategy_context: dict) -> dict:
        """Handle questionnaire pre-fill — chains Document Agent + Advisor Agent."""
        result = await self.document_agent.prefill_questionnaire(
            company_name=payload.get("company_name", ""),
            company_brief=payload.get("company_brief"),
            industry=payload.get("industry"),
            strategy_type=payload.get("strategy_type", "general"),
            document_text=payload.get("document_text", ""),
            questions_section=payload.get("questions_section", ""),
            strategy_context=strategy_context,
        )

        result["agent_chain"] = ["document_analyst"]
        return result

    async def _handle_action_plan(self, payload: dict, strategy_context: dict) -> dict:
        """Handle action plan generation."""
        result = await self.execution_agent.generate_action_plan(
            stair_context=payload.get("stair_context", ""),
            strategy_context=strategy_context,
        )

        validation = await self._validate_output(
            agent_name=self.execution_agent.name,
            output_text=result["text"],
            task_type="action_plan",
            strategy_context=strategy_context,
        )

        if validation["confidence_score"] < 60:
            strategy_context["previous_outputs"] = [{
                "agent": "validation",
                "summary": f"Validation feedback: {'; '.join(validation.get('warnings', [])[:3])}",
            }]
            result = await self.execution_agent.generate_action_plan(
                stair_context=payload.get("stair_context", ""),
                strategy_context=strategy_context,
            )
            validation = await self._validate_output(
                agent_name=self.execution_agent.name,
                output_text=result["text"],
                task_type="action_plan",
                strategy_context=strategy_context,
            )

        result["validation"] = validation
        result["agent_chain"] = ["execution_planner", "validation"]
        return result

    async def _handle_customized_plan(self, payload: dict, strategy_context: dict) -> dict:
        """Handle plan customization with feedback."""
        result = await self.execution_agent.customize_plan(
            original_plan=payload.get("original_plan", ""),
            feedback=payload.get("feedback", ""),
            strategy_context=strategy_context,
        )

        validation = await self._validate_output(
            agent_name=self.execution_agent.name,
            output_text=result["text"],
            task_type="customized_plan",
            strategy_context=strategy_context,
        )

        result["validation"] = validation
        result["agent_chain"] = ["execution_planner", "validation"]
        return result

    async def _handle_explain_action(self, payload: dict, strategy_context: dict) -> dict:
        """Handle action explanation."""
        result = await self.execution_agent.explain_action(
            action=payload.get("action", ""),
            stair_context=payload.get("stair_context", ""),
            strategy_context=strategy_context,
        )

        result["agent_chain"] = ["execution_planner"]
        return result

    async def _handle_implementation_guide(self, payload: dict, strategy_context: dict) -> dict:
        """Handle implementation guide generation."""
        result = await self.execution_agent.implementation_guide(
            element_context=payload.get("element_context", ""),
            strategy_context=strategy_context,
        )

        validation = await self._validate_output(
            agent_name=self.execution_agent.name,
            output_text=result["text"],
            task_type="implementation_guide",
            strategy_context=strategy_context,
        )

        if validation["confidence_score"] < 60:
            strategy_context["previous_outputs"] = [{
                "agent": "validation",
                "summary": f"Validation feedback: {'; '.join(validation.get('warnings', [])[:3])}",
            }]
            result = await self.execution_agent.implementation_guide(
                element_context=payload.get("element_context", ""),
                strategy_context=strategy_context,
            )
            validation = await self._validate_output(
                agent_name=self.execution_agent.name,
                output_text=result["text"],
                task_type="implementation_guide",
                strategy_context=strategy_context,
            )

        result["validation"] = validation
        result["agent_chain"] = ["execution_planner", "validation"]
        return result
