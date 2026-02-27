"""
Stairs Knowledge Engine Migration Runner
==========================================
Run this on your Windows machine:
    python run_migration.py

Requires: pip install psycopg2-binary
"""
import sys
import os
try:
    import psycopg2
except ImportError:
    print("Installing psycopg2-binary...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary"])
    import psycopg2

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    print("ERROR: DATABASE_URL environment variable is required.")
    print("  Set it before running:  export DATABASE_URL='postgresql://user:pass@host:port/db'")
    sys.exit(1)

# The full migration SQL inline (so you only need this one file)
MIGRATION_SQL = r"""
-- ============================================================================
-- Stairs KNOWLEDGE ENGINE v3.0 — Migration 001
-- ============================================================================

-- 1. KB_AUTHORS
CREATE TABLE IF NOT EXISTS kb_authors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    bio TEXT,
    nationality VARCHAR(100),
    affiliation VARCHAR(255),
    wikipedia_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. KB_BOOKS
CREATE TABLE IF NOT EXISTS kb_books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    title_ar VARCHAR(500),
    year_published INTEGER,
    category VARCHAR(100),
    integration_tier VARCHAR(20) CHECK (integration_tier IN ('tier_1','tier_2','tier_3')),
    key_concepts TEXT[],
    relevance_to_stairs TEXT,
    isbn VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. KB_BOOK_AUTHORS (many-to-many)
CREATE TABLE IF NOT EXISTS kb_book_authors (
    book_id UUID REFERENCES kb_books(id) ON DELETE CASCADE,
    author_id UUID REFERENCES kb_authors(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'author',
    PRIMARY KEY (book_id, author_id)
);

-- 4. KB_FRAMEWORKS (enhanced)
CREATE TABLE IF NOT EXISTS kb_frameworks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    category VARCHAR(100),
    phase VARCHAR(50) CHECK (phase IN ('analysis','formulation','design','execution')),
    originator VARCHAR(255),
    year_introduced INTEGER,
    description TEXT,
    description_ar TEXT,
    strengths TEXT[],
    limitations TEXT[],
    best_paired_with TEXT[],
    hierarchy_template JSONB,
    visual_template JSONB,
    complexity_level VARCHAR(20) DEFAULT 'medium' CHECK (complexity_level IN ('low','medium','high')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. KB_FAILURE_PATTERNS
CREATE TABLE IF NOT EXISTS kb_failure_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    category VARCHAR(100),
    description TEXT,
    description_ar TEXT,
    detection_signals TEXT[],
    ai_detection_query TEXT,
    prevention_strategies TEXT[],
    severity VARCHAR(20) DEFAULT 'high' CHECK (severity IN ('low','medium','high','critical')),
    research_source VARCHAR(500),
    statistic TEXT,
    value_at_risk_percent DECIMAL(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. KB_ONTOLOGY_TERMS
CREATE TABLE IF NOT EXISTS kb_ontology_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name VARCHAR(255) NOT NULL,
    canonical_name_ar VARCHAR(255),
    description TEXT,
    framework_mappings JSONB DEFAULT '{}',
    hierarchy_level INTEGER,
    parent_term_id UUID REFERENCES kb_ontology_terms(id),
    measurement_type VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. KB_REVIEW_CADENCES
CREATE TABLE IF NOT EXISTS kb_review_cadences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100),
    frequency VARCHAR(50) NOT NULL,
    duration_minutes INTEGER,
    participants TEXT[],
    agenda_template JSONB,
    kpi_focus_level VARCHAR(50),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. KB_LEADING_LAGGING_KPIS
CREATE TABLE IF NOT EXISTS kb_leading_lagging_kpis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    perspective VARCHAR(100) NOT NULL,
    kpi_name VARCHAR(255) NOT NULL,
    kpi_name_ar VARCHAR(255),
    kpi_type VARCHAR(20) NOT NULL CHECK (kpi_type IN ('leading','lagging')),
    description TEXT,
    typical_unit VARCHAR(50),
    typical_target_range VARCHAR(100),
    linked_kpi_id UUID REFERENCES kb_leading_lagging_kpis(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. KB_MENA_MARKET_INTEL
CREATE TABLE IF NOT EXISTS kb_mena_market_intel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(100) NOT NULL,
    metric_name VARCHAR(255) NOT NULL,
    metric_name_ar VARCHAR(255),
    value VARCHAR(255),
    year INTEGER,
    source VARCHAR(500),
    country VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. STAIR_VERSIONS (audit trail)
CREATE TABLE IF NOT EXISTS stair_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stair_id UUID NOT NULL,
    version_number INTEGER NOT NULL,
    snapshot JSONB NOT NULL,
    changed_by UUID,
    change_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stair_versions_stair ON stair_versions(stair_id, version_number DESC);

-- 11. REALTIME_EVENTS
CREATE TABLE IF NOT EXISTS realtime_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    payload JSONB DEFAULT '{}',
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_realtime_org_time ON realtime_events(organization_id, created_at DESC);

-- Add search vectors
CREATE INDEX IF NOT EXISTS idx_kb_frameworks_search ON kb_frameworks USING GIN(to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'')));
CREATE INDEX IF NOT EXISTS idx_kb_books_search ON kb_books USING GIN(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(relevance_to_stairs,'')));
CREATE INDEX IF NOT EXISTS idx_kb_failure_search ON kb_failure_patterns USING GIN(to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'')));

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- AUTHORS
INSERT INTO kb_authors (name, name_ar, affiliation) VALUES
('Michael Porter', 'مايكل بورتر', 'Harvard Business School'),
('Robert Kaplan', 'روبرت كابلان', 'Harvard Business School'),
('David Norton', 'ديفيد نورتن', 'Balanced Scorecard Collaborative'),
('Alexander Osterwalder', 'ألكسندر أوسترفالدر', 'Strategyzer'),
('W. Chan Kim', 'دبليو تشان كيم', 'INSEAD'),
('Renée Mauborgne', 'رينيه موبورن', 'INSEAD'),
('Andy Grove', 'آندي غروف', 'Intel'),
('John Doerr', 'جون دوير', 'Kleiner Perkins'),
('Roger Martin', 'روجر مارتن', 'Rotman School of Management'),
('A.G. Lafley', 'آيه جي لافلي', 'Procter & Gamble'),
('Richard Rumelt', 'ريتشارد روملت', 'UCLA Anderson'),
('Clayton Christensen', 'كلايتون كريستنسن', 'Harvard Business School'),
('Rita McGrath', 'ريتا ماكغراث', 'Columbia Business School'),
('Eliyahu Goldratt', 'إلياهو جولدرات', 'Goldratt Institute'),
('Henry Mintzberg', 'هنري منتزبرغ', 'McGill University'),
('Jim Collins', 'جيم كولينز', 'Independent Researcher'),
('Eric Ries', 'إريك ريس', 'Lean Startup Movement'),
('Geoffrey Moore', 'جيفري مور', 'Crossing the Chasm'),
('Peter Thiel', 'بيتر ثيل', 'PayPal / Founders Fund'),
('Annie Duke', 'آني ديوك', 'Decision Scientist'),
('Larry Bossidy', 'لاري بوسيدي', 'Honeywell'),
('Ram Charan', 'رام شاران', 'Management Consultant'),
('Chris McChesney', 'كريس ماكتشيسني', 'FranklinCovey'),
('Ash Maurya', 'آش موريا', 'Lean Stack')
ON CONFLICT DO NOTHING;

-- BOOKS (Tier 1 - Must Integrate)
INSERT INTO kb_books (title, title_ar, year_published, category, integration_tier, key_concepts, relevance_to_stairs) VALUES
('Playing to Win', 'اللعب للفوز', 2013, 'Strategy Formulation', 'tier_1',
 ARRAY['Strategy Choice Cascade','Where to Play','How to Win','Core Capabilities'],
 'Strategy Choice Cascade provides the primary strategy creation wizard flow'),
('The Execution Premium', 'علاوة التنفيذ', 2008, 'Strategy Execution', 'tier_1',
 ARRAY['Six-Stage Closed-Loop','Strategy Maps','Office of Strategy Management'],
 'The six-stage system IS the operational backbone of Stairs monitoring'),
('Measure What Matters', 'قياس ما يهم', 2018, 'Goal Setting', 'tier_1',
 ARRAY['OKR Framework','Stretch Goals','CFR (Conversations Feedback Recognition)'],
 'OKR is the default goal-setting framework, scoring and cadence logic'),
('Good Strategy Bad Strategy', 'استراتيجية جيدة استراتيجية سيئة', 2011, 'Strategy Formulation', 'tier_1',
 ARRAY['Strategy Kernel','Diagnosis','Guiding Policy','Coherent Action'],
 'AI diagnostic engine uses the kernel test to detect bad strategy patterns'),
('Business Model Generation', 'ابتكار نموذج العمل', 2010, 'Business Model', 'tier_1',
 ARRAY['Business Model Canvas','9 Building Blocks','Value Proposition'],
 'Canvas visualization is a core view for business model strategy elements'),
('Strategy Maps', 'خرائط الاستراتيجية', 2004, 'Strategy Execution', 'tier_1',
 ARRAY['Cause-and-Effect','Four Perspectives','Strategic Themes'],
 'Visual cause-and-effect mapping between staircase elements')
ON CONFLICT DO NOTHING;

-- BOOKS (Tier 2 - Essential)
INSERT INTO kb_books (title, title_ar, year_published, category, integration_tier, key_concepts, relevance_to_stairs) VALUES
('Blue Ocean Strategy', 'استراتيجية المحيط الأزرق', 2005, 'Market Strategy', 'tier_2',
 ARRAY['Strategy Canvas','ERRC Grid','Value Innovation','Six Paths'],
 'Strategy Canvas and ERRC Grid as AI-assisted market analysis tools'),
('The 4 Disciplines of Execution', 'الانضباطات الأربعة للتنفيذ', 2012, 'Strategy Execution', 'tier_2',
 ARRAY['Wildly Important Goals','Lead Measures','Compelling Scoreboard','Cadence of Accountability'],
 'Lead vs lag measure framework for KPI classification'),
('Strategy Beyond the Hockey Stick', 'الاستراتيجية ما بعد عصا الهوكي', 2018, 'Strategy Analytics', 'tier_2',
 ARRAY['Power Curve','Five Big Moves','Social Side of Strategy','Outside View'],
 'Hockey stick detection algorithm and probability-based strategy assessment'),
('Seeing Around Corners', 'رؤية ما وراء الزوايا', 2019, 'Strategy Foresight', 'tier_2',
 ARRAY['Inflection Points','Early Warning','Snow Melts from Edges'],
 'Early warning system architecture for market inflection detection'),
('Execution', 'التنفيذ', 2002, 'Strategy Execution', 'tier_2',
 ARRAY['Three Core Processes','People Process','Strategy Process','Operations Process'],
 'Framework for execution discipline across people, strategy, operations')
ON CONFLICT DO NOTHING;

-- BOOKS (Tier 3 - Conceptual)
INSERT INTO kb_books (title, year_published, category, integration_tier, key_concepts, relevance_to_stairs) VALUES
('Competitive Strategy', 1980, 'Strategy Analysis', 'tier_3',
 ARRAY['Five Forces','Generic Strategies','Industry Analysis'],
 'Five Forces automation for industry analysis module'),
('The Innovators Dilemma', 1997, 'Innovation', 'tier_3',
 ARRAY['Disruptive Innovation','Sustaining Innovation','Value Networks'],
 'Disruption detection patterns for AI monitoring engine'),
('Thinking in Bets', 2018, 'Decision Making', 'tier_3',
 ARRAY['Probabilistic Thinking','Resulting','Decision Quality vs Outcome Quality'],
 'Confidence scoring and probabilistic strategy assessment'),
('The Lean Startup', 2011, 'Innovation', 'tier_3',
 ARRAY['Build-Measure-Learn','MVP','Pivot or Persevere','Innovation Accounting'],
 'Experimentation cycles for initiative-level strategy testing')
ON CONFLICT DO NOTHING;

-- FRAMEWORKS (enhanced with phase/complexity)
INSERT INTO kb_frameworks (code, name, name_ar, phase, category, originator, year_introduced, description, complexity_level, strengths, limitations, best_paired_with) VALUES
('five_forces', 'Porters Five Forces', 'القوى الخمس لبورتر', 'analysis', 'External Analysis', 'Michael Porter', 1979,
 'Analyzes five competitive forces shaping industry profitability', 'medium',
 ARRAY['Systematic industry analysis','Identifies profit pools','Widely understood'],
 ARRAY['Static snapshot','Difficult with platforms','Ignores complements'],
 ARRAY['pestel','value_chain','generic_strategies']),
('pestel', 'PESTEL Analysis', 'تحليل بيستل', 'analysis', 'External Analysis', 'Francis Aguilar (evolved)', 1967,
 'Scans six macro-environmental dimensions: Political, Economic, Social, Technological, Environmental, Legal', 'low',
 ARRAY['Comprehensive macro scan','Feeds into SWOT','Simple to apply'],
 ARRAY['Can be superficial','No prioritization built in','Static'],
 ARRAY['five_forces','swot']),
('swot', 'SWOT/TOWS Analysis', 'تحليل سوات', 'analysis', 'Internal Analysis', 'Harvard/SRI/Weihrich', 1965,
 'Maps internal Strengths/Weaknesses against external Opportunities/Threats', 'low',
 ARRAY['Universal starting diagnostic','Simple','Generates strategy options via TOWS'],
 ARRAY['Often superficial','No prioritization','Subjective'],
 ARRAY['pestel','five_forces']),
('value_chain', 'Value Chain Analysis', 'تحليل سلسلة القيمة', 'analysis', 'Internal Analysis', 'Michael Porter', 1985,
 'Disaggregates firm into primary and support activities to identify competitive advantage sources', 'medium',
 ARRAY['Links activities to advantage','Identifies cost drivers','Systematic'],
 ARRAY['Less intuitive for digital','Complex for platforms','Resource intensive'],
 ARRAY['generic_strategies','five_forces']),
('generic_strategies', 'Porters Generic Strategies', 'الاستراتيجيات العامة لبورتر', 'formulation', 'Positioning', 'Michael Porter', 1980,
 'Three positioning options: cost leadership, differentiation, and focus', 'low',
 ARRAY['Clear positioning choice','Foundational','Simple to communicate'],
 ARRAY['Stuck in middle challenged','Binary thinking','Ignores hybrid strategies'],
 ARRAY['five_forces','value_chain']),
('blue_ocean', 'Blue Ocean Strategy', 'استراتيجية المحيط الأزرق', 'formulation', 'Market Strategy', 'W. Chan Kim & Renée Mauborgne', 2005,
 'Tools for creating uncontested market space through value innovation', 'high',
 ARRAY['Structured creativity','Visual tools','Market creation focus'],
 ARRAY['Execution risks underweighted','Blue oceans attract competition','Hard to sustain'],
 ARRAY['bmc','ansoff']),
('ansoff', 'Ansoff Matrix', 'مصفوفة أنسوف', 'formulation', 'Growth', 'Igor Ansoff', 1957,
 'Maps growth options: Market Penetration, Market Development, Product Development, Diversification', 'low',
 ARRAY['Simple growth framework','Clear risk escalation','Quick prioritization'],
 ARRAY['Oversimplified','No execution guidance','Binary product/market view'],
 ARRAY['bmc','generic_strategies']),
('bcg_matrix', 'BCG Growth-Share Matrix', 'مصفوفة بي سي جي', 'formulation', 'Portfolio', 'Bruce Henderson/BCG', 1970,
 'Classifies units into Stars, Cash Cows, Question Marks, Dogs', 'low',
 ARRAY['Quick portfolio triage','Investment guidance','Visual'],
 ARRAY['Only two factors','Oversimplistic','Market share focus outdated'],
 ARRAY['ge_mckinsey']),
('ge_mckinsey', 'GE-McKinsey Nine-Box', 'مصفوفة جي إي ماكنزي', 'formulation', 'Portfolio', 'McKinsey for GE', 1971,
 'Three strategic zones based on Industry Attractiveness and Competitive Strength', 'medium',
 ARRAY['More nuanced than BCG','Multiple weighted factors','Three strategic zones'],
 ARRAY['Subjective weighting','Complex scoring','Static'],
 ARRAY['bcg_matrix','five_forces']),
('bmc', 'Business Model Canvas', 'نموذج العمل التجاري', 'design', 'Business Model', 'Alexander Osterwalder', 2010,
 'Visualizes business models across nine building blocks', 'medium',
 ARRAY['Most widely used strategy viz','Holistic view','Collaborative tool'],
 ARRAY['Snapshot not dynamic','No execution layer','Competition blind'],
 ARRAY['lean_canvas','value_chain']),
('lean_canvas', 'Lean Canvas', 'النموذج الرشيق', 'design', 'Business Model', 'Ash Maurya', 2012,
 'Adapts BMC for startups with Problem, Solution, Key Metrics, Unfair Advantage', 'low',
 ARRAY['Quick 15-20 min completion','Hypothesis-driven','Startup focused'],
 ARRAY['Too simple for enterprises','No competitive analysis','Short-term focus'],
 ARRAY['bmc','lean_startup']),
('bsc', 'Balanced Scorecard', 'بطاقة الأداء المتوازن', 'execution', 'Measurement', 'Robert Kaplan & David Norton', 1992,
 'Four perspectives: Financial, Customer, Internal Processes, Learning & Growth', 'high',
 ARRAY['Most adopted measurement system','Balanced view','Strategy translation'],
 ARRAY['Complex implementation','Can become bureaucratic','Lag-heavy'],
 ARRAY['strategy_maps','okr']),
('strategy_maps', 'Strategy Maps', 'خرائط الاستراتيجية', 'execution', 'Measurement', 'Robert Kaplan & David Norton', 2000,
 'Visual cause-and-effect relationships between strategic objectives across BSC perspectives', 'high',
 ARRAY['Visual strategy communication','Cause-effect clarity','Inseparable from BSC'],
 ARRAY['Complex to build','Can oversimplify causality','Requires BSC'],
 ARRAY['bsc']),
('okr', 'OKR', 'الأهداف والنتائج الرئيسية', 'execution', 'Goal Setting', 'Andy Grove / John Doerr', 1970,
 'Qualitative Objectives paired with 3-5 quantitative Key Results, scored 0.0-1.0', 'medium',
 ARRAY['Dominant in tech','Transparent','Stretch goals culture','Quarterly cadence'],
 ARRAY['Can become task lists','Gaming risk','Needs cultural fit'],
 ARRAY['bsc','4dx']),
('ogsm', 'OGSM', 'أهداف غايات استراتيجيات مقاييس', 'execution', 'Planning', 'Procter & Gamble', 1950,
 'One-page strategic plan: Objective, Goals, Strategies, Measures', 'low',
 ARRAY['Fits on one page','Cascadable','P&G proven'],
 ARRAY['Can oversimplify','Less known','Limited tooling'],
 ARRAY['okr','bsc']),
('hoshin', 'Hoshin Kanri', 'هوشين كانري', 'execution', 'Deployment', 'Yoji Akao', 1960,
 'X-Matrix aligning objectives/strategies/measures/owners with catchball and PDCA', 'high',
 ARRAY['Deep alignment','Two-way communication','Continuous improvement'],
 ARRAY['Resource intensive','Cultural barriers','Complex implementation'],
 ARRAY['bsc','okr']),
('toc', 'Theory of Constraints', 'نظرية القيود', 'execution', 'Operations', 'Eliyahu Goldratt', 1984,
 'Five Focusing Steps: Identify, Exploit, Subordinate, Elevate, Repeat', 'medium',
 ARRAY['Bottleneck focus','Throughput accounting','Thinking processes'],
 ARRAY['Narrow operations focus','Single constraint assumption','Less strategic'],
 ARRAY['bsc','hoshin'])
ON CONFLICT (code) DO NOTHING;

-- FAILURE PATTERNS
INSERT INTO kb_failure_patterns (code, name, name_ar, category, severity, statistic, value_at_risk_percent, description, detection_signals, prevention_strategies, research_source) VALUES
('hockey_stick', 'Hockey Stick Projection', 'إسقاط عصا الهوكي', 'Planning', 'high',
 'McKinsey: Each years plan shows optimistic curves that never materialize', 15.0,
 'Systematic overoptimism where projections show dramatic future growth despite flat historical performance',
 ARRAY['Progress consistently below trajectory','Repeated forecast revisions upward','Gap between plan and actual widening'],
 ARRAY['Use outside view with empirical benchmarks','Require premortem analysis','Compare against industry base rates'],
 'McKinsey - Strategy Beyond the Hockey Stick (2018)'),
('peanut_butter', 'Peanut Butter Resourcing', 'توزيع الموارد بالتساوي', 'Resource Allocation', 'high',
 'McKinsey: Average annual resource reallocation is only 2-3%', 12.0,
 'Spreading resources thinly across all initiatives regardless of strategic priority or growth potential',
 ARRAY['Budget variance < 5% across all units','No initiative terminated in 12+ months','Equal allocation despite unequal performance'],
 ARRAY['Reallocate >50% of capex over decade','Kill bottom quartile initiatives','Use portfolio scoring for allocation'],
 'McKinsey - Companies reallocating >50% create 50% more value'),
('cascade_gap', 'Strategy Cascade Failure', 'فشل تتابع الاستراتيجية', 'Communication', 'critical',
 'PwC: 93% of employees dont understand company strategy', 18.0,
 'Strategy fails to cascade from leadership to execution teams, creating disconnection between vision and daily work',
 ARRAY['Employees cannot name top objectives','No strategy artifacts below VP level','Misalignment between team goals and corporate goals'],
 ARRAY['Visual strategy maps at every level','Monthly all-hands strategy updates','OKR cascade with explicit linking'],
 'PwC Strategy& and Kaplan/Norton research'),
('silo_problem', 'Cross-Silo Misalignment', 'مشكلة العزلة التنظيمية', 'Organizational', 'critical',
 'MIT/HBR: Only 9% of managers can count on colleagues in other functions', 20.0,
 'Departments optimize locally at the expense of enterprise-wide strategic objectives',
 ARRAY['Conflicting KPIs across departments','No cross-functional initiatives','Dependency bottlenecks at handoff points'],
 ARRAY['Cross-functional OKRs','Shared KPIs across silos','Regular cross-unit strategy reviews'],
 'Sull, Homkes & Sull - MIT/HBR Study (2015)'),
('measurement_gap', 'Measurement & Feedback Failure', 'فشل القياس والتغذية الراجعة', 'Monitoring', 'high',
 '55% of businesses struggle to track KPIs effectively', 10.0,
 'Organizations fail to track progress against strategy, relying on lagging indicators or no measurement at all',
 ARRAY['No KPI updates for 30+ days','Only lagging indicators tracked','Manual data collection with errors'],
 ARRAY['Automated KPI collection','Leading + lagging indicator pairs','Weekly progress check-ins'],
 'Multiple sources - Mankins & Steele (Bain)'),
('resource_starvation', 'Resource Starvation', 'تجويع الموارد', 'Resource Allocation', 'high',
 'Mankins & Steele: ~7.5% value lost from inadequate resources', 8.0,
 'Strategic initiatives are approved but never adequately funded or staffed to succeed',
 ARRAY['Budget utilization < 50% of allocation','Key roles unfilled for 60+ days','Initiative scope expanding without resources'],
 ARRAY['Resource commitment before initiative approval','Monthly resource utilization review','Kill or fund fully - no zombie initiatives'],
 'Mankins & Steele (Bain, 2005)'),
('set_and_forget', 'Set and Forget', 'ضبط ونسيان', 'Adaptation', 'high',
 'Companies dynamically allocating outperform static allocators by 30%', 12.0,
 'Rigid adherence to annual plans when market conditions have fundamentally changed',
 ARRAY['No strategy revision in 6+ months','Market shift with no response','Quarterly reviews cancelled or perfunctory'],
 ARRAY['90-day adaptive strategy cycles','Rolling 12-18 month forecasts','Continuous assumption validation'],
 'McKinsey dynamic resource allocation research'),
('confidence_collapse', 'Confidence Collapse', 'انهيار الثقة', 'Execution', 'critical',
 'Team confidence dropping rapidly signals imminent failure', 25.0,
 'Team belief in strategy viability erodes quickly, creating a self-fulfilling prophecy of failure',
 ARRAY['Confidence scores dropping >20% in 2 weeks','Key talent departures from initiative','Increasing meeting cancellations'],
 ARRAY['Address concerns in dedicated sessions','Celebrate small wins publicly','Reassess and adjust scope if needed'],
 'Behavioral strategy research')
ON CONFLICT (code) DO NOTHING;

-- ONTOLOGY TERMS (framework concept mapping)
INSERT INTO kb_ontology_terms (canonical_name, canonical_name_ar, description, hierarchy_level, framework_mappings) VALUES
('Vision', 'الرؤية', 'Ultimate aspirational state the organization seeks to achieve', 0,
 '{"bsc": "Vision", "okr": "Mission/Vision", "ogsm": "Objective", "hoshin": "True North"}'::jsonb),
('Strategic Theme', 'المحور الاستراتيجي', 'Major strategic direction or pillar', 1,
 '{"bsc": "Perspective/Theme", "okr": "Pillar", "ogsm": "Strategy", "hoshin": "Breakthrough Objective"}'::jsonb),
('Strategic Objective', 'الهدف الاستراتيجي', 'Qualitative goal within a strategic theme', 2,
 '{"bsc": "Strategic Objective", "okr": "Objective", "ogsm": "Goal", "hoshin": "Annual Objective"}'::jsonb),
('Key Measure', 'المقياس الرئيسي', 'Quantitative metric tracking objective achievement', 3,
 '{"bsc": "Measure/KPI", "okr": "Key Result", "ogsm": "Measure", "hoshin": "Target"}'::jsonb),
('Initiative', 'المبادرة', 'Project or program driving progress on objectives', 4,
 '{"bsc": "Strategic Initiative", "okr": "Initiative", "ogsm": "Action Plan", "hoshin": "Improvement Priority"}'::jsonb),
('Task', 'المهمة', 'Individual action item within an initiative', 5,
 '{"bsc": "Action Item", "okr": "Task", "ogsm": "Task", "hoshin": "Action"}'::jsonb),
('Leading Indicator', 'مؤشر استباقي', 'Predictive metric that drives future outcomes', 3,
 '{"bsc": "Performance Driver", "okr": "Leading KR", "4dx": "Lead Measure", "hoshin": "Process Metric"}'::jsonb),
('Lagging Indicator', 'مؤشر تأخري', 'Outcome metric measuring past results', 3,
 '{"bsc": "Outcome Measure", "okr": "Lagging KR", "4dx": "Lag Measure", "hoshin": "Result Metric"}'::jsonb)
ON CONFLICT DO NOTHING;

-- REVIEW CADENCES
INSERT INTO kb_review_cadences (name, name_ar, frequency, duration_minutes, participants, kpi_focus_level, description) VALUES
('Daily Huddle', 'الاجتماع اليومي', 'daily', 15,
 ARRAY['Team members','Team lead'], 'operational',
 'Quick coordination: blockers, priorities, brief reference to weekly goals aligned to strategy'),
('Weekly Leadership', 'اجتماع القيادة الأسبوعي', 'weekly', 75,
 ARRAY['Department heads','VP'], 'tactical',
 'Operational coordination, near-term metrics review, quick scorecard check, blocker resolution'),
('Monthly Strategy Review', 'المراجعة الاستراتيجية الشهرية', 'monthly', 180,
 ARRAY['C-Suite','VPs','Strategy team'], 'strategic',
 'Performance trends, leading indicators, initiative adjustments, budget vs actual, cross-functional dependencies'),
('Quarterly Strategic Review', 'المراجعة الاستراتيجية الفصلية', 'quarterly', 480,
 ARRAY['Board','C-Suite','VPs'], 'strategic',
 'Deep KPI/OKR assessment, market changes, assumption validation, resource alignment, next quarter priorities'),
('Annual Strategic Planning', 'التخطيط الاستراتيجي السنوي', 'annual', 1440,
 ARRAY['Board','C-Suite','Senior Leadership'], 'vision',
 'Comprehensive strategy refresh, new initiative proposals, budget framework, vision refinement')
ON CONFLICT DO NOTHING;

-- LEADING/LAGGING KPI PAIRS
INSERT INTO kb_leading_lagging_kpis (perspective, kpi_name, kpi_name_ar, kpi_type, description, typical_unit) VALUES
('Financial', 'Pipeline Value', 'قيمة خط الأنابيب', 'leading', 'Total value of qualified sales opportunities', 'currency'),
('Financial', 'Revenue', 'الإيرادات', 'lagging', 'Total recognized revenue', 'currency'),
('Financial', 'Qualified Leads', 'العملاء المحتملون المؤهلون', 'leading', 'Number of leads meeting qualification criteria', 'count'),
('Financial', 'Profit Margin', 'هامش الربح', 'lagging', 'Net profit as percentage of revenue', 'percent'),
('Customer', 'Engagement Score', 'درجة المشاركة', 'leading', 'Composite score of product usage and interaction', 'score'),
('Customer', 'Net Promoter Score', 'صافي نقاط الترويج', 'lagging', 'Willingness to recommend (-100 to 100)', 'score'),
('Customer', 'Time to Value', 'الوقت حتى القيمة', 'leading', 'Days from signup to first value realization', 'days'),
('Customer', 'Customer Retention Rate', 'معدل الاحتفاظ بالعملاء', 'lagging', 'Percentage of customers retained over period', 'percent'),
('Internal Process', 'Cycle Time', 'وقت الدورة', 'leading', 'Time from start to completion of key process', 'days'),
('Internal Process', 'Defect Rate', 'معدل العيوب', 'lagging', 'Percentage of outputs with quality issues', 'percent'),
('Internal Process', 'Automation Coverage', 'تغطية الأتمتة', 'leading', 'Percentage of processes with automation', 'percent'),
('Internal Process', 'On-Time Delivery', 'التسليم في الوقت المحدد', 'lagging', 'Percentage of deliverables on schedule', 'percent'),
('Learning & Growth', 'Training Hours', 'ساعات التدريب', 'leading', 'Hours of training per employee per quarter', 'hours'),
('Learning & Growth', 'Employee Productivity', 'إنتاجية الموظفين', 'lagging', 'Revenue or output per employee', 'currency'),
('Learning & Growth', 'Technology Adoption Rate', 'معدل تبني التكنولوجيا', 'leading', 'Percentage of employees using new systems', 'percent'),
('Learning & Growth', 'Employee Retention', 'الاحتفاظ بالموظفين', 'lagging', 'Percentage of employees retained over period', 'percent')
ON CONFLICT DO NOTHING;

-- MENA MARKET INTELLIGENCE
INSERT INTO kb_mena_market_intel (category, metric_name, value, year, source, country) VALUES
('Market Size', 'MENA AI Market Value', '$18B', 2024, 'Industry reports', 'MENA'),
('Market Size', 'MENA AI Market Projected', '$166B', 2030, 'Industry projections', 'MENA'),
('Growth', 'MENA AI CAGR', '44.8%', 2024, 'Market analysis', 'MENA'),
('Investment', 'Saudi Project Transcendence', '$100B+', 2025, 'Saudi government', 'Saudi Arabia'),
('Investment', 'UAE OpenAI Investment', '$6.6B', 2024, 'MGX / UAE government', 'UAE'),
('Maturity', 'Seed/Pre-seed AI Deals', '91%', 2024, 'Venture data', 'MENA'),
('Consumer', 'Native Language Brand Switching', '68%', 2024, 'Consumer research', 'MENA'),
('Consumer', 'Language More Important Than Price', '56%', 2024, 'Consumer research', 'MENA'),
('Execution', 'Strategy Value Delivered', '63%', 2005, 'Mankins & Steele (Bain)', 'Global'),
('Execution', 'Strategy Value Lost', '37%', 2005, 'Mankins & Steele (Bain)', 'Global'),
('Execution', 'Employees Understanding Strategy', '5%', 2001, 'Kaplan & Norton', 'Global'),
('Execution', 'Cross-functional Trust', '9%', 2015, 'Sull Homkes Sull MIT/HBR', 'Global')
ON CONFLICT DO NOTHING;

SELECT 'Migration complete!' AS status;
"""

def run():
    print("🪜 Stairs Knowledge Engine Migration")
    print("=" * 50)
    print(f"Connecting to Railway Postgres...")
    
    try:
        conn = psycopg2.connect(DB_URL, sslmode="require")
        conn.autocommit = True
        cur = conn.cursor()
        print("✅ Connected!")
        
        print("Running migration SQL...")
        cur.execute(MIGRATION_SQL)
        print("✅ Migration executed!")
        
        # Verify
        cur.execute("""
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' ORDER BY table_name;
        """)
        tables = [r[0] for r in cur.fetchall()]
        print(f"\n📊 Total tables: {len(tables)}")
        
        for tbl in ['kb_authors','kb_books','kb_frameworks','kb_failure_patterns',
                     'kb_ontology_terms','kb_review_cadences','kb_leading_lagging_kpis','kb_mena_market_intel']:
            try:
                cur.execute(f"SELECT COUNT(*) FROM {tbl}")
                count = cur.fetchone()[0]
                print(f"  ✅ {tbl}: {count} rows")
            except Exception as e:
                print(f"  ❌ {tbl}: {e}")
        
        cur.close()
        conn.close()
        print("\n🎉 Migration complete! Knowledge Engine is live.")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run()
