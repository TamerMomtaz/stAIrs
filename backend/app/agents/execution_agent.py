"""Execution Planner (Agent 4) — Generates action plans and implementation guides."""

from datetime import datetime

from app.agents.base_agent import BaseAgent


class ExecutionAgent(BaseAgent):
    name = "execution_planner"
    role = "Specialized in generating action plans, implementation guides, and practical execution steps"

    def _build_system_prompt(self, strategy_context: dict = None) -> str:
        company = ""
        industry = ""
        if strategy_context:
            company = strategy_context.get("company", "")
            industry = strategy_context.get("industry", "")

        return f"""You are the Execution Planner agent for Stairs, an AI strategy platform by DEVONEERS.
The current year is {datetime.now().year}.

YOUR ROLE: Transform strategic objectives into actionable execution plans.

CAPABILITIES:
- Generate detailed action plans from strategy stair steps
- Create customized plans incorporating user feedback
- Write implementation guides with prerequisites, steps, timeline, and success criteria
- Explain strategic actions in practical, non-jargon terms
- Adapt plans based on available resources, budget, and team size

{"CURRENT CONTEXT: Planning execution for " + company + (" in " + industry + " sector" if industry else "") + "." if company else ""}

RULES:
- Every action must be specific, measurable, and time-bound
- Include prerequisites and dependencies
- Break complex actions into small, achievable steps (1-2 week sprints)
- Define clear success criteria for each step
- Include responsible party suggestions when team context is available
- Consider resource constraints mentioned in Source of Truth
- Provide timeline estimates in weeks, not vague durations
- Format output in structured markdown with headers and checklists"""

    async def generate_action_plan(self, stair_context: str, strategy_context: dict = None) -> dict:
        """Generate an action plan for a strategy stair element."""
        prompt = f"""Generate a detailed action plan for the following strategy element:

{stair_context}

Return a structured action plan with:
1. Executive summary (2-3 sentences)
2. Prerequisites and dependencies
3. Action steps (numbered, with timeline and responsible party)
4. Success criteria and KPIs
5. Risk mitigation steps
6. Estimated timeline

Format as structured markdown."""

        result = await self.call(
            messages=[{"role": "user", "content": prompt}],
            strategy_context=strategy_context,
            max_tokens=2048,
            task_type="action_plan",
        )
        return result

    async def customize_plan(self, original_plan: str, feedback: str, strategy_context: dict = None) -> dict:
        """Customize an existing plan based on user feedback."""
        prompt = f"""Here is an existing action plan:

{original_plan}

The user has provided the following feedback:
{feedback}

Please revise the action plan incorporating this feedback. Maintain the same structured format but adjust:
- Steps that the user wants changed
- Timeline adjustments
- Resource allocation changes
- Any additional steps or removals requested

Return the complete revised plan in structured markdown."""

        result = await self.call(
            messages=[{"role": "user", "content": prompt}],
            strategy_context=strategy_context,
            max_tokens=2048,
            task_type="customized_plan",
        )
        return result

    async def explain_action(self, action: str, stair_context: str, strategy_context: dict = None) -> dict:
        """Explain a strategic action in practical terms."""
        prompt = f"""Explain the following strategic action in practical, jargon-free terms:

ACTION: {action}

CONTEXT:
{stair_context}

Provide:
1. What this action means in plain language
2. Why it matters for the strategy
3. How to get started (first 3 concrete steps)
4. Common pitfalls to avoid
5. How to measure if it's working

Keep the explanation concise and actionable."""

        result = await self.call(
            messages=[{"role": "user", "content": prompt}],
            strategy_context=strategy_context,
            max_tokens=1024,
            task_type="explain_action",
        )
        return result

    async def implementation_guide(self, element_context: str, strategy_context: dict = None) -> dict:
        """Generate a comprehensive implementation guide."""
        prompt = f"""Create a comprehensive implementation guide for:

{element_context}

Structure the guide as:

## Prerequisites
- What must be in place before starting

## Implementation Steps
For each step:
- Step name and description
- Estimated duration
- Required resources
- Dependencies on other steps
- Success criteria

## Timeline
- Visual timeline overview (week by week)

## Success Criteria
- How to know when this is successfully implemented

## Monitoring Plan
- What to track during implementation
- Red flags to watch for

Return in structured markdown format."""

        result = await self.call(
            messages=[{"role": "user", "content": prompt}],
            strategy_context=strategy_context,
            max_tokens=2048,
            task_type="implementation_guide",
        )
        return result
