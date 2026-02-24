"""Tests for Pydantic schemas."""

import os
import pytest
from uuid import UUID

os.environ["JWT_SECRET"] = "test-secret-for-testing-only-not-for-prod"

from app.models.schemas import (
    LoginRequest,
    RegisterRequest,
    StairCreate,
    StairUpdate,
    ProgressCreate,
    RelationshipCreate,
    StrategyCreate,
    StrategyUpdate,
    AIChatRequest,
    AlertUpdate,
    KPIMeasurementCreate,
    TeamCreate,
)


class TestLoginRequest:
    def test_valid(self):
        req = LoginRequest(email="test@example.com", password="pass123")
        assert req.email == "test@example.com"

    def test_requires_both_fields(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            LoginRequest(email="test@example.com")


class TestRegisterRequest:
    def test_valid_with_defaults(self):
        req = RegisterRequest(email="test@example.com", password="pass", full_name="Test User")
        assert req.language == "en"

    def test_custom_language(self):
        req = RegisterRequest(email="a@b.com", password="p", full_name="T", language="ar")
        assert req.language == "ar"


class TestStairCreate:
    def test_valid_minimal(self):
        stair = StairCreate(title="My Objective", element_type="objective")
        assert stair.title == "My Objective"
        assert stair.priority == "medium"

    def test_valid_all_types(self):
        for t in ["vision", "objective", "key_result", "initiative", "task", "kpi",
                   "perspective", "strategic_objective", "measure", "goal", "strategy"]:
            stair = StairCreate(title="Test", element_type=t)
            assert stair.element_type == t

    def test_invalid_element_type(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            StairCreate(title="Test", element_type="invalid_type")

    def test_title_max_length(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            StairCreate(title="x" * 501, element_type="objective")

    def test_optional_fields(self):
        stair = StairCreate(
            title="Full Stair",
            element_type="key_result",
            description="A description",
            target_value=100.0,
            current_value=50.0,
            unit="percent",
            tags=["tag1", "tag2"],
        )
        assert stair.target_value == 100.0
        assert stair.tags == ["tag1", "tag2"]


class TestStairUpdate:
    def test_all_optional(self):
        update = StairUpdate()
        assert update.title is None
        assert update.status is None

    def test_partial_update(self):
        update = StairUpdate(progress_percent=75.0, health="at_risk")
        assert update.progress_percent == 75.0
        assert update.health == "at_risk"


class TestProgressCreate:
    def test_valid(self):
        p = ProgressCreate(progress_percent=50.0)
        assert p.progress_percent == 50.0

    def test_range_validation(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            ProgressCreate(progress_percent=150.0)
        with pytest.raises(ValidationError):
            ProgressCreate(progress_percent=-10.0)


class TestRelationshipCreate:
    def test_valid_types(self):
        for rtype in ["supports", "blocks", "depends_on", "aligns_with",
                       "contributes_to", "measures", "conflicts_with"]:
            rel = RelationshipCreate(
                source_stair_id="00000000-0000-0000-0000-000000000001",
                target_stair_id="00000000-0000-0000-0000-000000000002",
                relationship_type=rtype,
            )
            assert rel.relationship_type == rtype

    def test_invalid_type(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            RelationshipCreate(
                source_stair_id="00000000-0000-0000-0000-000000000001",
                target_stair_id="00000000-0000-0000-0000-000000000002",
                relationship_type="invalid",
            )


class TestStrategyCreate:
    def test_defaults(self):
        s = StrategyCreate(name="My Strategy")
        assert s.icon == "🎯"
        assert s.color == "#B8904A"
        assert s.framework == "okr"


class TestAlertUpdate:
    def test_valid_statuses(self):
        for status in ["acknowledged", "resolved", "dismissed"]:
            a = AlertUpdate(status=status)
            assert a.status == status

    def test_invalid_status(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            AlertUpdate(status="invalid")


class TestKPIMeasurementCreate:
    def test_valid(self):
        m = KPIMeasurementCreate(value=42.5)
        assert m.value == 42.5
        assert m.source == "manual"
