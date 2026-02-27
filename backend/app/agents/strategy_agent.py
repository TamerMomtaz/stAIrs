"""Strategy Analyst (Agent 2) — Runs strategic frameworks and generates analyses."""

from datetime import datetime

from app.agents.base_agent import BaseAgent


class StrategyAgent(BaseAgent):
    name = "strategy_analyst"
    role = "Specialized in running strategic frameworks (IFE, EFE, SPACE, BCG, Porter's) and generating structured analyses"

    def _build_system_prompt(self, strategy_context: dict = None) -> str:
        company = ""
        industry = ""
        if strategy_context:
            company = strategy_context.get("company", "")
            industry = strategy_context.get("industry", "")

        # Load knowledge cache for frameworks if available
        frameworks_section = ""
        try:
            from app.main import _knowledge_cache
            fw = _knowledge_cache.get("frameworks", [])
            if fw:
                frameworks_section = f"\nYou have access to {len(fw)} strategy frameworks:\n"
                for f in fw[:20]:
                    frameworks_section += f"• {f['name']} ({f.get('originator', 'N/A')}, {f.get('year_introduced', 'N/A')}) [{f.get('phase', '')}]\n"

            mt = _knowledge_cache.get("measurement_tools", [])
            if mt:
                frameworks_section += f"\nYou can apply {len(mt)} measurement tools:\n"
                for t in mt[:15]:
                    frameworks_section += f"• {t['name']} (Stage: {t.get('stage', '')}): {t.get('description', '')[:80]}...\n"
        except Exception:
            pass

        return f"""You are the Strategy Analyst agent for Stairs, an AI strategy platform by DEVONEERS.
The current year is {datetime.now().year}.

YOUR ROLE: Run strategic analysis frameworks and generate structured, quantitative outputs.

METHODOLOGY REFERENCE (David's Strategic Management):
- IFE Matrix: Internal Factor Evaluation — weight factors (0.0-1.0, sum=1.0), rate (1-4), compute weighted scores
- EFE Matrix: External Factor Evaluation — same structure for external factors
- SPACE Matrix: Strategic Position & Action Evaluation — 4 dimensions (FS, CA, ES, IS)
- BCG Matrix: Boston Consulting Group growth-share matrix
- Porter's Five Forces: Competitive environment analysis
- CPM: Competitive Profile Matrix
- IE Matrix: Internal-External positioning
- Grand Strategy Matrix: Market growth vs competitive position
- QSPM: Quantitative Strategic Planning Matrix
{frameworks_section}
{"CURRENT CONTEXT: Analyzing strategy for " + company + (" in " + industry + " sector" if industry else "") + "." if company else ""}

STRUCTURED TABLE OUTPUT RULES:
When performing a SPACE Matrix analysis, ALWAYS include a markdown table:
| Dimension | Factor | Score |
|-----------|--------|-------|
Scores: Financial Strength and Industry Strength use +1 to +6. Competitive Advantage and Environmental Stability use -1 to -6.

When performing a BCG Matrix analysis, ALWAYS include a markdown table:
| Product/Unit | Market Growth Rate (%) | Relative Market Share | Quadrant |
|--------------|----------------------|----------------------|----------|

When performing a Porter's Five Forces analysis, ALWAYS include a markdown table:
| Force | Intensity (1-5) | Key Factors |
|-------|----------------|-------------|

When performing an IFE/EFE Matrix, ALWAYS include a markdown table:
| Factor | Weight | Rating | Weighted Score |
|--------|--------|--------|----------------|
Weights must sum to 1.0. Ratings: 1=major weakness, 2=minor weakness, 3=minor strength, 4=major strength (IFE) or 1=poor response, 4=superior response (EFE).

RULES:
- Always produce quantitative analysis with specific scores and ratings
- Include both the structured table AND prose interpretation
- Cite Source of Truth data when available
- Be specific to the company context — avoid generic analysis
- Include actionable recommendations based on framework results"""

    async def run_framework(self, framework: str, user_message: str, strategy_context: dict = None) -> dict:
        """Run a specific strategic framework analysis."""
        result = await self.call(
            messages=[{"role": "user", "content": user_message}],
            strategy_context=strategy_context,
            max_tokens=2048,
            task_type=f"framework_{framework}",
        )
        return result

    async def generate_questionnaire(
        self,
        company_name: str,
        company_brief: str,
        industry: str,
        strategy_type: str,
        strategy_context: dict = None,
    ) -> dict:
        """Generate a tailored questionnaire for strategy creation."""
        type_label = strategy_type.replace("_", " ").title()
        brief_section = f"\nCompany Brief: {company_brief}" if company_brief else ""
        industry_section = f"\nIndustry: {industry}" if industry else ""

        prompt = f"""You are an expert strategy consultant. Generate a tailored questionnaire for creating a {type_label} strategy.

Company: {company_name}{industry_section}{brief_section}

Generate 8-15 questions that are SPECIFIC to {type_label} strategy planning.

IMPORTANT RULES:
1. Do NOT ask about anything already stated in the company brief above — read it carefully first
2. Questions must gather information that is MISSING but essential for a {type_label} strategy
3. Mix question types: multiple_choice, short_text, yes_no, scale
4. Group questions into 3-5 logical themes with descriptive group names
5. Include 2-3 conditional questions that only apply based on a prior answer
6. Each question must have a one-line explanation of WHY it matters

Return ONLY valid JSON in this exact format:
{{
  "groups": [
    {{
      "name": "Theme Name",
      "questions": [
        {{
          "id": "q1",
          "question": "The question?",
          "type": "multiple_choice",
          "explanation": "Why this question matters for the strategy",
          "options": ["Option A", "Option B", "Option C"],
          "conditional_on": null
        }},
        {{
          "id": "q2",
          "question": "Follow-up question?",
          "type": "short_text",
          "explanation": "Why this matters",
          "options": null,
          "conditional_on": {{"question_id": "q1", "expected_answer": "Option A"}}
        }}
      ]
    }}
  ]
}}

Question type rules:
- "scale": options must be ["1", "2", "3", "4", "5"]
- "yes_no": options must be ["Yes", "No"]
- "multiple_choice": provide 3-5 specific, relevant options
- "short_text": options must be null

Use conditional_on sparingly (2-3 questions). The expected_answer must exactly match one of the parent question's options."""

        result = await self.call(
            messages=[{"role": "user", "content": prompt}],
            strategy_context=strategy_context,
            max_tokens=2048,
            task_type="generate_questionnaire",
        )
        return result
