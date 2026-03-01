"""Tests for Data Quality Assurance system."""

import os
import json
import pytest

os.environ["JWT_SECRET"] = "test-secret-for-testing-only-not-for-prod"

from app.routers.data_qa import (
    _compute_confidence,
    _source_label,
    SOURCE_TYPE_RELIABILITY,
)


class TestComputeConfidence:
    def test_high_confidence_verified_document(self):
        source = {
            "source_type": "document",
            "metadata": {
                "relevance_score": 90,
                "user_verified": True,
                "dispute_count": 0,
                "quarantined": False,
            },
        }
        result = _compute_confidence(source, [])
        assert result["confidence_level"] == "high"
        assert result["confidence_score"] >= 70

    def test_low_confidence_disputed_source(self):
        source = {
            "source_type": "questionnaire",
            "metadata": {
                "relevance_score": 40,
                "user_verified": False,
                "dispute_count": 3,
                "quarantined": False,
            },
        }
        result = _compute_confidence(source, [])
        assert result["confidence_level"] == "low"
        assert result["confidence_score"] < 40

    def test_quarantined_source_zero_confidence(self):
        source = {
            "source_type": "document",
            "metadata": {
                "relevance_score": 100,
                "user_verified": True,
                "quarantined": True,
            },
        }
        result = _compute_confidence(source, [])
        assert result["confidence_score"] == 0
        assert result["confidence_level"] == "quarantined"
        assert result["factors"]["quarantined"] is True

    def test_medium_confidence_unverified(self):
        source = {
            "source_type": "ai_extraction",
            "metadata": {
                "relevance_score": 75,
                "user_verified": False,
                "dispute_count": 0,
                "quarantined": False,
            },
        }
        result = _compute_confidence(source, [])
        # ai_extraction (75 * 0.3) + relevance (75 * 0.3) = 45 → medium
        assert result["confidence_level"] == "medium"
        assert 40 <= result["confidence_score"] < 70

    def test_metadata_as_string(self):
        source = {
            "source_type": "document",
            "metadata": json.dumps({
                "relevance_score": 80,
                "user_verified": True,
                "dispute_count": 0,
                "quarantined": False,
            }),
        }
        result = _compute_confidence(source, [])
        assert result["confidence_score"] > 0

    def test_empty_metadata(self):
        source = {
            "source_type": "ai_chat",
            "metadata": None,
        }
        result = _compute_confidence(source, [])
        assert result["confidence_score"] >= 0
        assert result["confidence_level"] in ("high", "medium", "low")

    def test_invalid_metadata_string(self):
        source = {
            "source_type": "feedback",
            "metadata": "not-json",
        }
        result = _compute_confidence(source, [])
        assert result["confidence_score"] >= 0

    def test_verification_bonus(self):
        unverified = {
            "source_type": "document",
            "metadata": {
                "relevance_score": 70,
                "user_verified": False,
                "dispute_count": 0,
            },
        }
        verified = {
            "source_type": "document",
            "metadata": {
                "relevance_score": 70,
                "user_verified": True,
                "dispute_count": 0,
            },
        }
        unverified_score = _compute_confidence(unverified, [])["confidence_score"]
        verified_score = _compute_confidence(verified, [])["confidence_score"]
        assert verified_score > unverified_score

    def test_contradiction_penalty(self):
        clean = {
            "source_type": "document",
            "metadata": {
                "relevance_score": 80,
                "user_verified": False,
                "dispute_count": 0,
            },
        }
        disputed = {
            "source_type": "document",
            "metadata": {
                "relevance_score": 80,
                "user_verified": False,
                "dispute_count": 2,
            },
        }
        clean_score = _compute_confidence(clean, [])["confidence_score"]
        disputed_score = _compute_confidence(disputed, [])["confidence_score"]
        assert clean_score > disputed_score


class TestSourceLabel:
    def test_filename_from_metadata(self):
        source = {"metadata": {"filename": "report.pdf"}, "source_type": "document"}
        assert _source_label(source) == "report.pdf"

    def test_questionnaire_label(self):
        source = {"metadata": {"context": "questionnaire_answer"}, "source_type": "questionnaire"}
        assert _source_label(source) == "Questionnaire"

    def test_ai_chat_label(self):
        source = {"metadata": {}, "source_type": "ai_chat"}
        assert _source_label(source) == "AI Chat"

    def test_manual_entry_label(self):
        source = {"metadata": {}, "source_type": "manual_entry"}
        assert _source_label(source) == "Manual Entry"

    def test_unknown_type(self):
        source = {"metadata": {}, "source_type": "unknown"}
        assert _source_label(source) == "unknown"

    def test_metadata_as_string(self):
        source = {"metadata": json.dumps({"filename": "test.xlsx"}), "source_type": "document"}
        assert _source_label(source) == "test.xlsx"

    def test_none_metadata(self):
        source = {"metadata": None, "source_type": "feedback"}
        assert _source_label(source) == "feedback"


class TestSourceTypeReliability:
    def test_document_highest(self):
        assert SOURCE_TYPE_RELIABILITY["document"] > SOURCE_TYPE_RELIABILITY["ai_extraction"]
        assert SOURCE_TYPE_RELIABILITY["document"] > SOURCE_TYPE_RELIABILITY["manual_entry"]
        assert SOURCE_TYPE_RELIABILITY["document"] > SOURCE_TYPE_RELIABILITY["questionnaire"]

    def test_ai_extraction_above_manual(self):
        assert SOURCE_TYPE_RELIABILITY["ai_extraction"] > SOURCE_TYPE_RELIABILITY["manual_entry"]

    def test_manual_above_questionnaire(self):
        assert SOURCE_TYPE_RELIABILITY["manual_entry"] > SOURCE_TYPE_RELIABILITY["questionnaire"]

    def test_all_types_have_scores(self):
        expected_types = ["document", "ai_extraction", "manual_entry", "feedback", "ai_chat", "questionnaire"]
        for t in expected_types:
            assert t in SOURCE_TYPE_RELIABILITY
            assert 0 <= SOURCE_TYPE_RELIABILITY[t] <= 100
