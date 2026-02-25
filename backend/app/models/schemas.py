"""
ST.AIRS — Pydantic Models
Strategy AI Interactive Real-time System
v3.5.1 — Strategy Container Edition
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal


# ─── AUTH ───
class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"

class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: str
    full_name_ar: Optional[str] = None
    role: str
    language: str
    organization_id: Optional[UUID] = None

    class Config:
        from_attributes = True


# ─── ORGANIZATION ───
class OrgOut(BaseModel):
    id: UUID
    name: str
    name_ar: Optional[str] = None
    slug: str
    subscription_tier: str
    industry: Optional[str] = None

    class Config:
        from_attributes = True


# ─── STRATEGY (v3.5.1 — Strategy Container) ───
class StrategyCreate(BaseModel):
    name: str
    name_ar: Optional[str] = None
    description: Optional[str] = None
    description_ar: Optional[str] = None
    company: Optional[str] = None
    industry: Optional[str] = None
    icon: Optional[str] = "🎯"
    color: Optional[str] = "#B8904A"
    framework: Optional[str] = "okr"

class StrategyUpdate(BaseModel):
    name: Optional[str] = None
    name_ar: Optional[str] = None
    description: Optional[str] = None
    description_ar: Optional[str] = None
    company: Optional[str] = None
    industry: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    framework: Optional[str] = None
    status: Optional[str] = None

class StrategyOut(BaseModel):
    id: str
    organization_id: str
    name: str
    name_ar: Optional[str] = None
    description: Optional[str] = None
    description_ar: Optional[str] = None
    company: Optional[str] = None
    industry: Optional[str] = None
    icon: Optional[str] = "🎯"
    color: Optional[str] = "#B8904A"
    framework: Optional[str] = "okr"
    status: Optional[str] = "active"
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    element_count: Optional[int] = 0
    avg_progress: Optional[float] = 0
    settings: Optional[dict] = {}
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── STAIR (Core Strategy Element) ───
class StairCreate(BaseModel):
    title: str = Field(..., max_length=500)
    title_ar: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = None
    description_ar: Optional[str] = None
    element_type: str = Field(..., pattern="^(vision|objective|key_result|initiative|task|kpi|perspective|strategic_objective|measure|goal|strategy)$")
    parent_id: Optional[UUID] = None
    framework_id: Optional[UUID] = None
    strategy_id: Optional[UUID] = None
    team_id: Optional[UUID] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    unit: Optional[str] = None
    priority: Optional[str] = "medium"
    tags: Optional[List[str]] = None
    metadata: Optional[dict] = None

class StairUpdate(BaseModel):
    title: Optional[str] = None
    title_ar: Optional[str] = None
    description: Optional[str] = None
    description_ar: Optional[str] = None
    element_type: Optional[str] = None
    parent_id: Optional[UUID] = None
    strategy_id: Optional[UUID] = None
    status: Optional[str] = None
    health: Optional[str] = None
    progress_percent: Optional[float] = None
    confidence_percent: Optional[float] = None
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    unit: Optional[str] = None
    priority: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    tags: Optional[List[str]] = None
    metadata: Optional[dict] = None

class StairOut(BaseModel):
    id: UUID
    code: Optional[str] = None
    title: str
    title_ar: Optional[str] = None
    description: Optional[str] = None
    description_ar: Optional[str] = None
    element_type: str
    parent_id: Optional[UUID] = None
    strategy_id: Optional[UUID] = None
    level: int = 0
    sort_order: int = 0
    owner_id: Optional[UUID] = None
    team_id: Optional[UUID] = None
    status: str = "active"
    health: str = "on_track"
    progress_percent: float = 0
    confidence_percent: float = 50
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    baseline_value: Optional[float] = None
    unit: Optional[str] = None
    priority: str = "medium"
    budget_allocated: Optional[float] = None
    budget_spent: Optional[float] = None
    ai_risk_score: Optional[float] = None
    ai_health_prediction: Optional[str] = None
    ai_insights: Optional[dict] = None
    tags: Optional[List[str]] = None
    metadata: Optional[dict] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # Computed fields
    children_count: int = 0
    owner_name: Optional[str] = None

    class Config:
        from_attributes = True

class StairTree(BaseModel):
    stair: StairOut
    children: List["StairTree"] = []


# ─── PROGRESS ───
class ProgressCreate(BaseModel):
    progress_percent: float = Field(..., ge=0, le=100)
    confidence_percent: Optional[float] = Field(None, ge=0, le=100)
    health: Optional[str] = None
    current_value: Optional[float] = None
    notes: Optional[str] = None

class ProgressOut(BaseModel):
    id: UUID
    stair_id: UUID
    snapshot_date: date
    progress_percent: Optional[float]
    confidence_percent: Optional[float]
    health: Optional[str]
    notes: Optional[str]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


# ─── RELATIONSHIPS ───
class RelationshipCreate(BaseModel):
    source_stair_id: UUID
    target_stair_id: UUID
    relationship_type: str = Field(..., pattern="^(supports|blocks|depends_on|aligns_with|contributes_to|measures|conflicts_with)$")
    strength: float = Field(1.0, ge=0, le=1)
    description: Optional[str] = None

class RelationshipOut(BaseModel):
    id: UUID
    source_stair_id: UUID
    target_stair_id: UUID
    relationship_type: str
    strength: float
    description: Optional[str]

    class Config:
        from_attributes = True


# ─── AI ───
class AIChatRequest(BaseModel):
    message: str
    context_stair_id: Optional[UUID] = None
    conversation_id: Optional[UUID] = None

class AIChatResponse(BaseModel):
    response: str
    conversation_id: UUID
    actions: Optional[List[dict]] = None
    tokens_used: Optional[int] = None

class AIAnalysisResponse(BaseModel):
    risk_score: float
    risk_level: str
    identified_risks: List[dict]
    recommended_actions: List[dict]
    completion_probability: float
    summary: str
    summary_ar: Optional[str] = None

class AIGenerateRequest(BaseModel):
    prompt: str
    framework: str = "okr"
    parent_id: Optional[UUID] = None


# ─── QUESTIONNAIRE ───
class QuestionnaireGenerateRequest(BaseModel):
    company_name: str
    company_brief: Optional[str] = None
    industry: Optional[str] = None
    strategy_type: str

class QuestionnaireQuestion(BaseModel):
    id: str
    question: str
    type: str  # multiple_choice, short_text, yes_no, scale
    explanation: str
    options: Optional[List[str]] = None
    conditional_on: Optional[dict] = None

class QuestionnaireGroup(BaseModel):
    name: str
    questions: List[QuestionnaireQuestion]

class QuestionnaireGenerateResponse(BaseModel):
    groups: List[QuestionnaireGroup]


# ─── ALERTS ───
class AlertOut(BaseModel):
    id: UUID
    stair_id: Optional[UUID]
    alert_type: str
    severity: str
    title: str
    title_ar: Optional[str]
    description: Optional[str]
    description_ar: Optional[str]
    recommended_actions: Optional[list] = None
    status: str
    created_at: Optional[datetime]

    class Config:
        from_attributes = True

class AlertUpdate(BaseModel):
    status: str = Field(..., pattern="^(acknowledged|resolved|dismissed)$")


# ─── DASHBOARD ───
class DashboardStats(BaseModel):
    total_elements: int
    on_track: int
    at_risk: int
    off_track: int
    achieved: int
    overall_progress: float
    active_alerts: int
    critical_alerts: int

class ExecutiveDashboard(BaseModel):
    stats: DashboardStats
    top_risks: List[StairOut]
    recent_progress: List[ProgressOut]
    alerts: List[AlertOut]


# ─── FRAMEWORKS ───
class TeamCreate(BaseModel):
    name: str
    description: Optional[str] = None
    parent_team_id: Optional[str] = None

class TeamOut(BaseModel):
    id: str
    organization_id: str
    name: str
    description: Optional[str] = None
    parent_team_id: Optional[str] = None
    created_at: Optional[datetime] = None
    member_count: Optional[int] = 0

class TeamMemberOut(BaseModel):
    user_id: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: str = "member"
    joined_at: Optional[datetime] = None

class KPIMeasurementCreate(BaseModel):
    value: float
    source: str = "manual"
    source_system: Optional[str] = None

class KPIMeasurementOut(BaseModel):
    id: str
    stair_id: str
    measured_at: Optional[datetime] = None
    value: float
    source: str = "manual"
    source_system: Optional[str] = None
    created_at: Optional[datetime] = None

class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    language: str = "en"

class FrameworkOut(BaseModel):
    id: UUID
    code: str
    name: str
    name_ar: Optional[str]
    description: Optional[str]
    hierarchy_template: dict

    class Config:
        from_attributes = True


# Fix forward references
StairTree.model_rebuild()
TokenResponse.model_rebuild()
