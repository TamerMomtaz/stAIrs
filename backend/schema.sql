-- ═══════════════════════════════════════════════════════════
-- ST.AIRS Database Schema — PostgreSQL 15+
-- Strategy AI Interactive Real-time System
-- By Tee | DEVONEERS | "Human IS the Loop"
-- ═══════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 1. ORGANIZATIONS (Multi-tenant) ───
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    subscription_tier VARCHAR(50) DEFAULT 'free',  -- free, starter, pro, enterprise
    industry VARCHAR(100),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. USERS ───
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    full_name_ar VARCHAR(255),
    avatar_url TEXT,
    role VARCHAR(50) DEFAULT 'member',  -- admin, manager, member, viewer
    language VARCHAR(10) DEFAULT 'en',   -- en, ar
    timezone VARCHAR(50) DEFAULT 'UTC',
    preferences JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);

-- ─── 3. TEAMS ───
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    description TEXT,
    parent_team_id UUID REFERENCES teams(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE team_members (
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
);

-- ─── 4. FRAMEWORKS ───
CREATE TABLE frameworks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    description TEXT,
    hierarchy_template JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default frameworks
INSERT INTO frameworks (code, name, name_ar, hierarchy_template) VALUES
('okr', 'Objectives & Key Results', 'الأهداف والنتائج الرئيسية', '{
  "levels": [
    {"type": "vision", "label": "Vision", "label_ar": "الرؤية", "max_per_parent": 1},
    {"type": "objective", "label": "Objective", "label_ar": "هدف", "max_per_parent": 5},
    {"type": "key_result", "label": "Key Result", "label_ar": "نتيجة رئيسية", "max_per_parent": 5},
    {"type": "initiative", "label": "Initiative", "label_ar": "مبادرة", "max_per_parent": 10}
  ],
  "scoring": {"type": "percentage", "min": 0, "max": 100}
}'),
('bsc', 'Balanced Scorecard', 'بطاقة الأداء المتوازن', '{
  "levels": [
    {"type": "vision", "label": "Vision", "label_ar": "الرؤية"},
    {"type": "perspective", "label": "Perspective", "label_ar": "منظور"},
    {"type": "strategic_objective", "label": "Strategic Objective", "label_ar": "هدف استراتيجي"},
    {"type": "measure", "label": "Measure", "label_ar": "مقياس"},
    {"type": "initiative", "label": "Initiative", "label_ar": "مبادرة"}
  ],
  "perspectives": ["financial", "customer", "internal_process", "learning_growth"]
}'),
('ogsm', 'OGSM', 'أهداف غايات استراتيجيات مقاييس', '{
  "levels": [
    {"type": "objective", "label": "Objective", "label_ar": "هدف"},
    {"type": "goal", "label": "Goal", "label_ar": "غاية"},
    {"type": "strategy", "label": "Strategy", "label_ar": "استراتيجية"},
    {"type": "measure", "label": "Measure", "label_ar": "مقياس"}
  ]
}'),
('custom', 'Custom Framework', 'إطار مخصص', '{
  "levels": [
    {"type": "vision", "label": "Vision", "label_ar": "الرؤية"},
    {"type": "objective", "label": "Objective", "label_ar": "هدف"},
    {"type": "key_result", "label": "Key Result", "label_ar": "نتيجة رئيسية"},
    {"type": "initiative", "label": "Initiative", "label_ar": "مبادرة"},
    {"type": "task", "label": "Task", "label_ar": "مهمة"}
  ]
}');

-- ─── 5. THE STAIR — Core Polymorphic Strategy Element ───
CREATE TABLE stairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,

    -- Identity
    code VARCHAR(50),
    title VARCHAR(500) NOT NULL,
    title_ar VARCHAR(500),
    description TEXT,
    description_ar TEXT,

    -- Type & Framework
    element_type VARCHAR(50) NOT NULL,  -- vision, objective, key_result, initiative, task, kpi
    framework_id UUID REFERENCES frameworks(id),

    -- Hierarchy (self-referential)
    parent_id UUID REFERENCES stairs(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0,

    -- Ownership
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,

    -- Timing
    period_type VARCHAR(20),  -- annual, quarterly, monthly, custom
    start_date DATE,
    end_date DATE,

    -- Progress & Status
    status VARCHAR(30) DEFAULT 'active',       -- draft, active, paused, completed, cancelled
    health VARCHAR(20) DEFAULT 'on_track',     -- on_track, at_risk, off_track, achieved
    progress_percent DECIMAL(5,2) DEFAULT 0,   -- 0.00 to 100.00
    confidence_percent DECIMAL(5,2) DEFAULT 50,

    -- Measurement (for KRs, KPIs)
    target_value DECIMAL(20,4),
    current_value DECIMAL(20,4),
    baseline_value DECIMAL(20,4),
    unit VARCHAR(50),
    measurement_direction VARCHAR(20) DEFAULT 'increase',  -- increase, decrease, maintain

    -- Weighting & Priority
    weight DECIMAL(5,2) DEFAULT 1.0,
    priority VARCHAR(20) DEFAULT 'medium',  -- critical, high, medium, low

    -- Resources
    budget_allocated DECIMAL(20,2),
    budget_spent DECIMAL(20,2),
    currency VARCHAR(3) DEFAULT 'USD',

    -- AI-generated fields
    ai_risk_score DECIMAL(5,2),
    ai_health_prediction VARCHAR(20),
    ai_insights JSONB,
    ai_last_analyzed_at TIMESTAMPTZ,

    -- Extensibility
    metadata JSONB DEFAULT '{}',
    tags TEXT[],

    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ  -- Soft delete
);

-- Indexes
CREATE INDEX idx_stairs_org ON stairs(organization_id);
CREATE INDEX idx_stairs_parent ON stairs(parent_id);
CREATE INDEX idx_stairs_owner ON stairs(owner_id);
CREATE INDEX idx_stairs_team ON stairs(team_id);
CREATE INDEX idx_stairs_type ON stairs(element_type);
CREATE INDEX idx_stairs_status ON stairs(status);
CREATE INDEX idx_stairs_health ON stairs(health);
CREATE INDEX idx_stairs_dates ON stairs(start_date, end_date);
CREATE INDEX idx_stairs_tags ON stairs USING GIN(tags);
CREATE INDEX idx_stairs_metadata ON stairs USING GIN(metadata);
CREATE INDEX idx_stairs_deleted ON stairs(deleted_at) WHERE deleted_at IS NULL;

-- Full-text search (English + Arabic)
CREATE INDEX idx_stairs_search_en ON stairs USING GIN(
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
);

-- ─── 6. STAIR RELATIONSHIPS (DAG) ───
CREATE TABLE stair_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_stair_id UUID REFERENCES stairs(id) ON DELETE CASCADE NOT NULL,
    target_stair_id UUID REFERENCES stairs(id) ON DELETE CASCADE NOT NULL,
    relationship_type VARCHAR(50) NOT NULL,
    -- 'supports', 'blocks', 'depends_on', 'aligns_with',
    -- 'contributes_to', 'measures', 'conflicts_with'
    strength DECIMAL(3,2) DEFAULT 1.0,
    description TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(source_stair_id, target_stair_id, relationship_type)
);

CREATE INDEX idx_rel_source ON stair_relationships(source_stair_id);
CREATE INDEX idx_rel_target ON stair_relationships(target_stair_id);

-- ─── 7. CLOSURE TABLE (efficient ancestor/descendant queries) ───
CREATE TABLE stair_closure (
    ancestor_id UUID REFERENCES stairs(id) ON DELETE CASCADE,
    descendant_id UUID REFERENCES stairs(id) ON DELETE CASCADE,
    depth INTEGER NOT NULL,
    PRIMARY KEY (ancestor_id, descendant_id)
);

-- Trigger to maintain closure table
CREATE OR REPLACE FUNCTION maintain_stair_closure()
RETURNS TRIGGER AS $$
BEGIN
    -- Self-reference
    INSERT INTO stair_closure (ancestor_id, descendant_id, depth)
    VALUES (NEW.id, NEW.id, 0)
    ON CONFLICT DO NOTHING;

    -- Ancestry chain
    IF NEW.parent_id IS NOT NULL THEN
        INSERT INTO stair_closure (ancestor_id, descendant_id, depth)
        SELECT sc.ancestor_id, NEW.id, sc.depth + 1
        FROM stair_closure sc
        WHERE sc.descendant_id = NEW.parent_id
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stair_closure
AFTER INSERT ON stairs
FOR EACH ROW EXECUTE FUNCTION maintain_stair_closure();

-- ─── 8. PROGRESS SNAPSHOTS (Time-series history) ───
CREATE TABLE stair_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stair_id UUID REFERENCES stairs(id) ON DELETE CASCADE NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    progress_percent DECIMAL(5,2),
    confidence_percent DECIMAL(5,2),
    health VARCHAR(20),
    status VARCHAR(30),
    current_value DECIMAL(20,4),
    notes TEXT,
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(stair_id, snapshot_date)
);

CREATE INDEX idx_progress_stair ON stair_progress(stair_id, snapshot_date DESC);

-- ─── 9. KPI MEASUREMENTS (High-frequency time-series) ───
CREATE TABLE kpi_measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stair_id UUID REFERENCES stairs(id) ON DELETE CASCADE NOT NULL,
    measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    value DECIMAL(20,4) NOT NULL,
    source VARCHAR(50) DEFAULT 'manual',  -- manual, integration, calculated
    source_system VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kpi_stair_time ON kpi_measurements(stair_id, measured_at DESC);

-- ─── 10. AI CONVERSATIONS & MESSAGES ───
CREATE TABLE ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    context_type VARCHAR(50),
    context_stair_id UUID REFERENCES stairs(id) ON DELETE SET NULL,
    title VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,  -- user, assistant, system
    content TEXT NOT NULL,
    tokens_used INTEGER,
    model_used VARCHAR(100),
    actions_taken JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 11. AI ALERTS ───
CREATE TABLE ai_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    stair_id UUID REFERENCES stairs(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,
    -- risk_detected, milestone_at_risk, pattern_identified,
    -- recommendation, anomaly, prediction
    severity VARCHAR(20) DEFAULT 'medium',  -- critical, high, medium, low, info
    title VARCHAR(255) NOT NULL,
    title_ar VARCHAR(255),
    description TEXT,
    description_ar TEXT,
    recommended_actions JSONB,
    status VARCHAR(20) DEFAULT 'new',  -- new, acknowledged, resolved, dismissed
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_org ON ai_alerts(organization_id, status);
CREATE INDEX idx_alerts_stair ON ai_alerts(stair_id);

-- ─── 12. AI FEEDBACK ───
CREATE TABLE ai_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID REFERENCES ai_alerts(id),
    message_id UUID REFERENCES ai_messages(id),
    user_id UUID REFERENCES users(id),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    feedback_type VARCHAR(50),  -- helpful, not_helpful, incorrect, acted_on
    comments TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 13. ACTIVITY LOG ───
CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    changes JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_org ON activity_log(organization_id, created_at DESC);

-- ─── 14. AI USAGE LOGS (Multi-provider fallback monitoring) ───
CREATE TABLE ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(20) NOT NULL,         -- claude, openai, gemini
    success BOOLEAN NOT NULL,
    response_time_ms INTEGER,
    tokens_used INTEGER DEFAULT 0,
    status_code INTEGER,
    fallback_used BOOLEAN DEFAULT FALSE,
    fallback_from VARCHAR(20),             -- which provider we fell back from
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_logs_created ON ai_usage_logs(created_at DESC);
CREATE INDEX idx_ai_usage_logs_provider ON ai_usage_logs(provider, created_at DESC);
CREATE INDEX idx_ai_usage_logs_fallback ON ai_usage_logs(fallback_used) WHERE fallback_used = TRUE;

-- ─── 15. INTEGRATIONS ───
CREATE TABLE integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    credentials_encrypted BYTEA,
    settings JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active',
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 16. AUTO-UPDATE updated_at TRIGGER ───
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_org_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_user_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_stairs_updated_at BEFORE UPDATE ON stairs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ai_conv_updated_at BEFORE UPDATE ON ai_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 17. STRATEGY SOURCES (Source of Truth — Input Traceability) ───
CREATE TABLE strategy_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id UUID NOT NULL,
    source_type VARCHAR(50) NOT NULL,  -- questionnaire, ai_chat, feedback, manual_entry
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_strategy_sources_strategy ON strategy_sources(strategy_id, created_at DESC);
CREATE INDEX idx_strategy_sources_type ON strategy_sources(strategy_id, source_type);
CREATE INDEX idx_strategy_sources_search ON strategy_sources USING GIN(
    to_tsvector('english', coalesce(content, ''))
);

CREATE TRIGGER trg_strategy_sources_updated_at BEFORE UPDATE ON strategy_sources FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ═══════════════════════════════════════════════════════════
-- SEED DATA — DEVONEERS / RootRise
-- ═══════════════════════════════════════════════════════════

-- Seed organization
INSERT INTO organizations (id, name, name_ar, slug, industry, subscription_tier) VALUES
('a0000000-0000-0000-0000-000000000001', 'DEVONEERS', 'ديفونيرز', 'devoneers', 'Technology / AI', 'enterprise');

-- Seed admin user (password: stairs2026)
INSERT INTO users (id, organization_id, email, password_hash, full_name, full_name_ar, role, language) VALUES
('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
 'tee@devoneers.com',
 '$2b$12$LJ3b5fG8y8F2Q1Z7z8Y6hO9X4w3v2u1t0s9r8q7p6o5n4m3l2k1j0',
 'Tee', 'تي', 'admin', 'en');

-- Seed OKR framework reference
-- (already inserted above via INSERT INTO frameworks)

-- Seed strategy stairs
INSERT INTO stairs (id, organization_id, code, title, title_ar, description, element_type, framework_id, parent_id, level, sort_order, owner_id, status, health, progress_percent, confidence_percent, target_value, current_value, unit, ai_risk_score, start_date, end_date, created_by) VALUES
-- Vision
('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
 'VIS-2026', 'RootRise Vision 2026', 'رؤية RootRise 2026',
 'Build MENA''s leading AI-powered business operating system',
 'vision', (SELECT id FROM frameworks WHERE code='okr'), NULL, 0, 0,
 'b0000000-0000-0000-0000-000000000001', 'active', 'on_track', 42, 68,
 NULL, NULL, NULL, 35, '2025-01-01', '2026-12-31', 'b0000000-0000-0000-0000-000000000001'),

-- Objective 1: Market Leadership
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
 'OBJ-001', 'Market Leadership in MENA', 'الريادة في سوق الشرق الأوسط',
 'Establish ST.AIRS as the #1 strategy platform for MENA SMEs',
 'objective', (SELECT id FROM frameworks WHERE code='okr'),
 'c0000000-0000-0000-0000-000000000001', 1, 0,
 'b0000000-0000-0000-0000-000000000001', 'active', 'on_track', 55, 72,
 NULL, NULL, NULL, 28, '2025-01-01', '2025-12-31', 'b0000000-0000-0000-0000-000000000001'),

-- KR 1.1: 15 Pilot Companies
('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
 'KR-001', 'Onboard 15 Pilot Companies', '15 شركة تجريبية',
 'Sign and onboard 15 companies to pilot ST.AIRS platform',
 'key_result', (SELECT id FROM frameworks WHERE code='okr'),
 'c0000000-0000-0000-0000-000000000002', 2, 0,
 'b0000000-0000-0000-0000-000000000001', 'active', 'at_risk', 33, 45,
 15, 5, 'companies', 72, '2025-01-01', '2025-06-30', 'b0000000-0000-0000-0000-000000000001'),

-- KR 1.2: Platform MVP
('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
 'KR-002', 'Platform MVP Deployed', 'المنصة منشورة',
 'Full working MVP with AI analysis, staircase viz, and Arabic support',
 'key_result', (SELECT id FROM frameworks WHERE code='okr'),
 'c0000000-0000-0000-0000-000000000002', 2, 1,
 'b0000000-0000-0000-0000-000000000001', 'active', 'on_track', 70, 85,
 100, 70, '%', 15, '2025-01-01', '2025-03-31', 'b0000000-0000-0000-0000-000000000001'),

-- Objective 2: MENA Expansion
('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
 'OBJ-002', 'MENA Expansion', 'التوسع في المنطقة',
 'Expand to UAE, Saudi Arabia, and Egypt markets',
 'objective', (SELECT id FROM frameworks WHERE code='okr'),
 'c0000000-0000-0000-0000-000000000001', 1, 1,
 'b0000000-0000-0000-0000-000000000001', 'active', 'at_risk', 20, 40,
 NULL, NULL, NULL, 65, '2025-06-01', '2026-06-30', 'b0000000-0000-0000-0000-000000000001'),

-- KR 2.1: 3 Accelerators
('c0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001',
 'KR-003', '3 Accelerator Programs', '3 مسرعات أعمال',
 'Join 3 MENA accelerators (Flat6Labs, Hub71, KAUST)',
 'key_result', (SELECT id FROM frameworks WHERE code='okr'),
 'c0000000-0000-0000-0000-000000000005', 2, 0,
 'b0000000-0000-0000-0000-000000000001', 'active', 'off_track', 0, 25,
 3, 0, 'programs', 88, '2025-06-01', '2025-12-31', 'b0000000-0000-0000-0000-000000000001'),

-- KR 2.2: Arabic-First
('c0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001',
 'KR-004', 'Arabic-First Platform', 'منصة عربية أولاً',
 'Complete Arabic localization with RTL support',
 'key_result', (SELECT id FROM frameworks WHERE code='okr'),
 'c0000000-0000-0000-0000-000000000005', 2, 1,
 'b0000000-0000-0000-0000-000000000001', 'active', 'on_track', 60, 78,
 100, 60, '%', 20, '2025-01-01', '2025-06-30', 'b0000000-0000-0000-0000-000000000001'),

-- Initiative: Claude API Integration
('c0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001',
 'INI-001', 'Claude API Integration', 'تكامل Claude API',
 'Integrate Claude for strategy generation, risk analysis, and chat',
 'initiative', (SELECT id FROM frameworks WHERE code='okr'),
 'c0000000-0000-0000-0000-000000000004', 3, 0,
 'b0000000-0000-0000-0000-000000000001', 'active', 'on_track', 80, 90,
 100, 80, '%', 10, '2025-02-01', '2025-03-15', 'b0000000-0000-0000-0000-000000000001');

-- Seed alerts
INSERT INTO ai_alerts (organization_id, stair_id, alert_type, severity, title, title_ar, description, recommended_actions, status) VALUES
('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003',
 'risk_detected', 'high', 'Pilot onboarding at risk', 'تأخر في ضم الشركات التجريبية',
 'Only 33% progress with 60% of time elapsed. Hockey stick pattern detected — current trajectory suggests missing target by 40%.',
 '["Reallocate resources from Platform (ahead of schedule)", "Focus outreach on 5 highest-probability companies", "Set up weekly BD pipeline reviews"]',
 'new'),

('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000006',
 'risk_detected', 'critical', 'Zero progress on accelerators', 'لا تقدم في المسرعات',
 'No progress logged for 30+ days. Communication gap pattern detected. This stair has been stationary since creation.',
 '["Research accelerator application deadlines immediately", "Identify top 5 MENA accelerators with open applications", "Prepare pitch deck for Flat6Labs and Hub71"]',
 'new'),

('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004',
 'recommendation', 'info', 'Platform ahead of schedule', 'المنصة متقدمة عن الجدول',
 '70% complete with only 40% of time used. This surplus capacity can be redirected to at-risk elements.',
 '["Reallocate 20% of dev capacity to pilot onboarding support", "Accelerate Arabic localization features", "Begin accelerator application prep"]',
 'new');

-- Seed progress snapshots
INSERT INTO stair_progress (stair_id, snapshot_date, progress_percent, confidence_percent, health, notes) VALUES
('c0000000-0000-0000-0000-000000000003', '2025-01-15', 7, 60, 'on_track', 'First 2 companies signed'),
('c0000000-0000-0000-0000-000000000003', '2025-02-01', 13, 55, 'on_track', '2 more in pipeline'),
('c0000000-0000-0000-0000-000000000003', '2025-02-15', 20, 48, 'at_risk', 'Pipeline stalling'),
('c0000000-0000-0000-0000-000000000003', '2025-03-01', 27, 45, 'at_risk', '4th company onboarded, but pace slowing'),
('c0000000-0000-0000-0000-000000000003', '2025-03-15', 33, 45, 'at_risk', '5th company signed'),
('c0000000-0000-0000-0000-000000000004', '2025-01-15', 15, 70, 'on_track', 'DB schema done'),
('c0000000-0000-0000-0000-000000000004', '2025-02-01', 35, 78, 'on_track', 'API foundation complete'),
('c0000000-0000-0000-0000-000000000004', '2025-02-15', 50, 82, 'on_track', 'Frontend prototype working'),
('c0000000-0000-0000-0000-000000000004', '2025-03-01', 65, 85, 'on_track', 'AI chat integrated'),
('c0000000-0000-0000-0000-000000000004', '2025-03-15', 70, 85, 'on_track', 'Staircase visualization live');
