"""Tests for the main FastAPI app (root endpoints, middleware)."""

import os
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

os.environ["DATABASE_URL"] = "postgresql://test:test@localhost:5432/test_stairs"
os.environ["JWT_SECRET"] = "test-secret-for-testing-only-not-for-prod"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["ALLOWED_ORIGINS"] = "http://localhost:3000"
os.environ["RATE_LIMIT_MAX"] = "100"
os.environ["RATE_LIMIT_WINDOW"] = "60"


class TestBuildSystemPrompt:
    def test_basic_system_prompt(self):
        from app.main import _build_basic_system_prompt
        prompt = _build_basic_system_prompt()
        assert "Stairs" in prompt
        assert "DEVONEERS" in prompt
        assert "Human IS the Loop" in prompt

    def test_enriched_system_prompt(self):
        from app.main import _build_enriched_system_prompt, _knowledge_cache
        _knowledge_cache["frameworks"] = [
            {"name": "OKR", "originator": "Intel", "year_introduced": 1983, "phase": "execution", "description": "Objectives and Key Results"}
        ]
        _knowledge_cache["failure_patterns"] = [
            {"name": "Hockey Stick", "severity": "high", "description": "Unrealistic growth projection", "detection_signals": ["Late start"], "statistic": "63%"}
        ]
        _knowledge_cache["measurement_tools"] = [
            {"name": "IFE Matrix", "stage": "analysis", "description": "Internal Factor Evaluation"}
        ]
        _knowledge_cache["books_summary"] = "200 books"

        prompt = _build_enriched_system_prompt()
        assert "OKR" in prompt
        assert "Hockey Stick" in prompt
        assert "IFE Matrix" in prompt
        assert "200 books" in prompt

        # Reset
        _knowledge_cache["frameworks"] = []
        _knowledge_cache["failure_patterns"] = []
        _knowledge_cache["measurement_tools"] = []
        _knowledge_cache["books_summary"] = ""


class TestKnowledgeCache:
    def test_cache_structure(self):
        from app.main import _knowledge_cache
        assert "frameworks" in _knowledge_cache
        assert "failure_patterns" in _knowledge_cache
        assert "system_prompt" in _knowledge_cache
        assert "loaded_at" in _knowledge_cache
