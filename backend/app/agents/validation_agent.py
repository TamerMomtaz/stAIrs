"""Risk & Validation Agent (Agent 5) — Reviews other agents' outputs for accuracy."""

import json
from datetime import datetime

from app.agents.base_agent import BaseAgent


class ValidationAgent(BaseAgent):
    name = "validation"
    role = "Reviews and validates other agents' outputs for accuracy, consistency, and alignment with Source of Truth"

    def _build_system_prompt(self, strategy_context: dict = None) -> str:
        company = ""
        if strategy_context:
            company = strategy_context.get("company", "")

        return f"""You are the Validation Agent for Stairs, an AI strategy platform by DEVONEERS.
The current year is {datetime.now().year}.

YOUR ROLE: Quality assurance for all AI-generated strategy outputs.

RESPONSIBILITIES:
- Review outputs from other agents for factual accuracy
- Cross-check recommendations against Source of Truth data
- Flag contradictions between analysis and verified data
- Identify unrealistic targets or missing data
- Score confidence level of each output (0-100)
- Detect internal inconsistencies

{"CURRENT CONTEXT: Validating outputs for " + company + "." if company else ""}

VALIDATION CRITERIA:
1. Data Accuracy: Do numbers and facts match Source of Truth?
2. Logical Consistency: Do recommendations follow from the analysis?
3. Completeness: Are there obvious gaps in the analysis?
4. Realism: Are targets and timelines achievable?
5. Alignment: Does the output align with stated strategy goals?

OUTPUT FORMAT:
Always return ONLY valid JSON:
{{
  "confidence_score": <0-100>,
  "validated": <true|false>,
  "warnings": ["list of potential issues"],
  "contradictions": ["list of conflicts with Source of Truth"],
  "suggestions": ["list of improvements"]
}}

Score interpretation:
- 80-100: High confidence, output is reliable
- 60-79: Moderate confidence, minor issues noted
- 40-59: Low confidence, significant issues — recommend revision
- 0-39: Very low confidence, major problems — requires regeneration"""

    async def validate(
        self,
        agent_name: str,
        agent_output: str,
        task_type: str,
        strategy_context: dict = None,
    ) -> dict:
        """Validate another agent's output.

        Returns:
            {
                "confidence_score": int (0-100),
                "validated": bool,
                "warnings": list[str],
                "contradictions": list[str],
                "suggestions": list[str],
            }
        """
        sot_summary = ""
        if strategy_context:
            sot = strategy_context.get("source_of_truth", "")
            if sot:
                sot_summary = f"\n\nVERIFIED SOURCE OF TRUTH DATA:\n{sot[:3000]}"

        prompt = f"""Review and validate the following output from the {agent_name} agent.

TASK TYPE: {task_type}

AGENT OUTPUT:
{agent_output[:4000]}
{sot_summary}

Evaluate the output against the validation criteria and return your assessment as JSON.
Check for:
1. Factual accuracy against Source of Truth data
2. Internal logical consistency
3. Completeness of analysis
4. Realism of recommendations and targets
5. Any contradictions with verified data

Return ONLY valid JSON with: confidence_score, validated, warnings, contradictions, suggestions."""

        result = await self.call(
            messages=[{"role": "user", "content": prompt}],
            strategy_context=strategy_context,
            max_tokens=1024,
            task_type=f"validate_{task_type}",
        )

        # Parse the validation result
        text = result.get("text", "")
        try:
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                parsed = json.loads(text[start:end])
            else:
                parsed = {}
        except Exception:
            parsed = {}

        validation = {
            "confidence_score": parsed.get("confidence_score", 75),
            "validated": parsed.get("validated", True),
            "warnings": parsed.get("warnings", []),
            "contradictions": parsed.get("contradictions", []),
            "suggestions": parsed.get("suggestions", []),
        }

        # Log with confidence score
        strategy_id = strategy_context.get("strategy_id") if strategy_context else None
        await self._log(
            strategy_id=strategy_id,
            task_type=f"validate_{task_type}",
            input_summary=f"Validating {agent_name} output for {task_type}"[:500],
            output_summary=f"Score: {validation['confidence_score']}, Warnings: {len(validation['warnings'])}, Contradictions: {len(validation['contradictions'])}"[:500],
            tokens_used=result.get("tokens", 0),
            model_used=result.get("provider_display", ""),
            confidence_score=validation["confidence_score"],
        )

        return validation
