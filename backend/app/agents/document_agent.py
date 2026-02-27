"""Document Analyst (Agent 1) — Extracts structured data from uploaded documents."""

from datetime import datetime

from app.agents.base_agent import BaseAgent


class DocumentAgent(BaseAgent):
    name = "document_analyst"
    role = "Specialized in extracting and categorizing structured data from uploaded documents"

    CATEGORIES = [
        "Financial Data",
        "Market Position",
        "Team & Resources",
        "Competitors",
        "Business Model",
        "Customers",
        "Risks",
        "Opportunities",
    ]

    def _build_system_prompt(self, strategy_context: dict = None) -> str:
        company = ""
        if strategy_context:
            company = strategy_context.get("company", "")

        return f"""You are the Document Analyst agent for Stairs, an AI strategy platform by DEVONEERS.
The current year is {datetime.now().year}.

YOUR ROLE: Extract structured, strategy-relevant data from uploaded documents.

CAPABILITIES:
- Parse financial statements, business plans, market research, and strategic documents
- Identify and categorize data points into these categories: {', '.join(self.CATEGORIES)}
- Extract exact quotes and figures — never paraphrase
- Assess confidence level (high/medium/low) for each extraction
- Handle documents from various formats and languages (English + Arabic)

{"CURRENT CONTEXT: You are analyzing documents for " + company + "." if company else ""}
{"IMPORTANT: The company you are analyzing is " + company + ". Even if uploaded documents mention other companies, categorize data in relation to " + company + "." if company else ""}

RULES:
- Extract CONCRETE data points: numbers, percentages, names, dates, metrics
- Do NOT extract vague or generic statements
- For each extraction, provide the exact text from the document
- Assign confidence: "high" = clearly stated fact, "medium" = reasonable inference, "low" = ambiguous
- If a category has no relevant content, return an empty items array
- Return structured JSON as requested by the prompt"""

    async def analyze_document(self, document_text: str, strategy_context: dict = None) -> dict:
        """Analyze a document and extract categorized data.

        Returns parsed dict with categories and items, or raw text if parsing fails.
        """
        import json

        max_chars = 15000
        truncated = document_text[:max_chars]
        if len(document_text) > max_chars:
            truncated += "\n\n[Document truncated — full text is longer]"

        prompt = f"""Analyze the following document text and extract strategy-relevant information into these categories:
{', '.join(self.CATEGORIES)}

For each category, extract specific items (facts, figures, quotes) from the document.
For each item include:
- "text": the EXACT quote or data point from the document (do not paraphrase)
- "confidence": your confidence that this belongs in this category — "high", "medium", or "low"

Return ONLY valid JSON in this format:
{{
  "categories": {{
    "Financial Data": {{
      "items": [
        {{"text": "exact quote from document", "confidence": "high"}}
      ]
    }},
    "Market Position": {{
      "items": []
    }}
  }}
}}

If a category has no relevant content, return an empty items array for it.
Focus on concrete data points, metrics, names, and factual statements — not vague descriptions.

DOCUMENT TEXT:
{truncated}"""

        result = await self.call(
            messages=[{"role": "user", "content": prompt}],
            strategy_context=strategy_context,
            max_tokens=2048,
            task_type="document_analysis",
        )
        return result

    async def prefill_questionnaire(
        self,
        company_name: str,
        company_brief: str,
        industry: str,
        strategy_type: str,
        document_text: str,
        questions_section: str,
        strategy_context: dict = None,
    ) -> dict:
        """Pre-fill questionnaire answers from document text."""
        type_label = strategy_type.replace("_", " ").title()
        brief_section = f"\nDescription: {company_brief}" if company_brief else ""
        industry_section = f"\nIndustry: {industry}" if industry else ""

        max_chars = 20000
        doc_text = document_text[:max_chars]
        if len(document_text) > max_chars:
            doc_text += "\n\n[Document text truncated]"

        prompt = f"""You are a strategy consultant. Based on the company information and uploaded documents below, answer the questionnaire questions.

COMPANY INFORMATION:
- Name: {company_name}{industry_section}{brief_section}
- Strategy Type: {type_label}

UPLOADED DOCUMENTS:
{doc_text}

QUESTIONNAIRE QUESTIONS:
{questions_section}

INSTRUCTIONS:
- For "multiple_choice" questions: your answer MUST be EXACTLY one of the provided options (case-sensitive match)
- For "yes_no" questions: answer exactly "Yes" or "No"
- For "scale" questions: answer a single digit from "1" to "5"
- For "short_text" questions: provide a concise answer (1-3 sentences) based on the documents
- Only answer questions where the documents provide relevant information
- If the documents don't contain relevant info for a question, skip it entirely

Return ONLY valid JSON:
{{"answers": {{"q1": "exact answer", "q3": "text answer"}}}}"""

        result = await self.call(
            messages=[{"role": "user", "content": prompt}],
            strategy_context=strategy_context,
            max_tokens=2048,
            task_type="prefill_questionnaire",
        )
        return result
