"""Tests for ST.AIRS helper functions."""

import os
import pytest
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch


# Set env before imports
os.environ["JWT_SECRET"] = "test-secret-for-testing-only-not-for-prod"

from app.helpers import (
    row_to_dict,
    rows_to_dicts,
    compute_health,
    generate_code,
    hash_password,
    verify_password,
    create_jwt,
    decode_jwt,
)


class TestRowToDict:
    def test_none_returns_none(self):
        assert row_to_dict(None) is None

    def test_converts_decimal_to_float(self):
        row = {"progress": Decimal("42.50"), "name": "Test"}
        result = row_to_dict(row)
        assert result["progress"] == 42.5
        assert isinstance(result["progress"], float)

    def test_parses_jsonb_string_fields(self):
        row = {"metadata": '{"key": "value"}', "title": "Test"}
        result = row_to_dict(row)
        assert result["metadata"] == {"key": "value"}

    def test_leaves_non_jsonb_fields_alone(self):
        row = {"title": "Test", "description": "some text"}
        result = row_to_dict(row)
        assert result["title"] == "Test"
        assert result["description"] == "some text"

    def test_handles_invalid_json_gracefully(self):
        row = {"metadata": "not-valid-json"}
        result = row_to_dict(row)
        assert result["metadata"] == "not-valid-json"


class TestRowsToDicts:
    def test_empty_list(self):
        assert rows_to_dicts([]) == []

    def test_converts_multiple_rows(self):
        rows = [
            {"id": 1, "progress": Decimal("10")},
            {"id": 2, "progress": Decimal("20")},
        ]
        result = rows_to_dicts(rows)
        assert len(result) == 2
        assert result[0]["progress"] == 10.0
        assert result[1]["progress"] == 20.0


class TestComputeHealth:
    def test_achieved_when_100_percent(self):
        assert compute_health(100) == "achieved"
        assert compute_health(100.5) == "achieved"

    def test_on_track_above_50(self):
        assert compute_health(75) == "on_track"
        assert compute_health(50) == "on_track"

    def test_at_risk_25_to_49(self):
        assert compute_health(25) == "at_risk"
        assert compute_health(49) == "at_risk"

    def test_off_track_below_25(self):
        assert compute_health(0) == "off_track"
        assert compute_health(24) == "off_track"

    def test_with_dates_on_track(self):
        # Use dates that put us early in the timeline so 80% is ahead of schedule
        today = date.today()
        start = today - timedelta(days=30)
        end = today + timedelta(days=335)
        # 80% progress when only ~8% of time elapsed → on_track
        result = compute_health(80, start, end)
        assert result in ("on_track", "achieved")

    def test_with_dates_off_track(self):
        start = date(2024, 1, 1)
        end = date(2024, 12, 31)
        # 0% progress on a past period
        result = compute_health(0, start, end)
        assert result == "off_track"


class TestGenerateCode:
    def test_generates_vision_code(self):
        code = generate_code("vision")
        assert code.startswith("VIS-")

    def test_generates_objective_code(self):
        code = generate_code("objective")
        assert code.startswith("OBJ-")

    def test_generates_key_result_code(self):
        code = generate_code("key_result")
        assert code.startswith("KR-")

    def test_generates_initiative_code(self):
        code = generate_code("initiative")
        assert code.startswith("INI-")

    def test_unknown_type_uses_elm(self):
        code = generate_code("unknown_type")
        assert code.startswith("ELM-")

    def test_codes_are_unique(self):
        codes = {generate_code("objective") for _ in range(10)}
        assert len(codes) == 10


class TestPasswordHashing:
    def test_hash_and_verify(self):
        password = "stairs2026"
        hashed = hash_password(password)
        assert hashed != password
        assert hashed.startswith("$2")
        assert verify_password(password, hashed)

    def test_wrong_password_fails(self):
        hashed = hash_password("correct")
        assert not verify_password("wrong", hashed)

    def test_verify_with_invalid_hash(self):
        assert not verify_password("test", "not-a-hash")


class TestJWT:
    def test_create_and_decode(self):
        token = create_jwt("user-123", "org-456", "admin")
        payload = decode_jwt(token)
        assert payload["sub"] == "user-123"
        assert payload["org"] == "org-456"
        assert payload["role"] == "admin"

    def test_invalid_token_raises(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            decode_jwt("invalid.token.here")
        assert exc_info.value.status_code == 401

    def test_tampered_token_raises(self):
        from fastapi import HTTPException
        token = create_jwt("user-123", "org-456")
        # Tamper with the token
        parts = token.split(".")
        parts[1] = parts[1] + "tampered"
        tampered = ".".join(parts)
        with pytest.raises(HTTPException):
            decode_jwt(tampered)
