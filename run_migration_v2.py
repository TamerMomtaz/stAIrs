"""
ST.AIRS Knowledge Engine v2 — MEGA Enrichment Migration
========================================================
Adds:
  - Fred David's Three-Stage Strategy Formulation Framework
    (IFE, EFE, CPM, SPACE, IE, Grand Strategy, QSPM)
  - 26 additional books (bringing total to 41)
  - 6 new authors
  - 10 new frameworks (bringing total to 27)
  - 4 new failure patterns (bringing total to 12)
  - 12 new KPIs
  - Expanded MENA market intelligence
  - New table: kb_measurement_tools (IFE/EFE/CPM/QSPM templates)

Run: python run_migration_v2.py
Requires: pip install psycopg2-binary
"""

import sys
try:
    import psycopg2
except ImportError:
    print("Installing psycopg2-binary...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary"])
    import psycopg2

DB_URL = "postgresql://postgres:QloOtdpzNGPRuMZtRabjuEqcLyOPQYrD@metro.proxy.rlwy.net:21513/railway"

MIGRATION_SQL = r"""
-- ============================================================================
-- ST.AIRS KNOWLEDGE ENGINE v2.0 — MEGA ENRICHMENT
-- Fred David Framework + 26 Books + Measurement Tools
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════
-- NEW TABLE: kb_measurement_tools
-- Strategy measurement templates (IFE, EFE, CPM, SPACE, QSPM)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS kb_measurement_tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    stage VARCHAR(50) NOT NULL CHECK (stage IN ('input', 'matching', 'decision')),
    category VARCHAR(100),
    originator VARCHAR(255),
    year_introduced INTEGER,
    description TEXT,
    description_ar TEXT,
    purpose TEXT,
    how_it_works TEXT,
    template_structure JSONB DEFAULT '{}',
    scoring_guide JSONB DEFAULT '{}',
    interpretation_guide TEXT,
    strengths TEXT[],
    limitations TEXT[],
    feeds_into TEXT[],
    example_factors JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════
-- FRED DAVID'S MEASUREMENT TOOLS (THE CORE OF STRATEGY SELECTION)
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO kb_measurement_tools (code, name, name_ar, stage, category, originator, year_introduced, description, description_ar, purpose, how_it_works, template_structure, scoring_guide, interpretation_guide, strengths, limitations, feeds_into, example_factors) VALUES

-- STAGE 1: INPUT
('ife_matrix', 'Internal Factor Evaluation Matrix', 'مصفوفة تقييم العوامل الداخلية', 'input', 'Internal Analysis',
 'Fred R. David', 1986,
 'Summarizes and evaluates major strengths and weaknesses in functional areas of a business. Assigns weights (0.0-1.0) by industry importance and ratings (1-4) by company response.',
 'تلخص وتقيم نقاط القوة والضعف الرئيسية في المجالات الوظيفية للأعمال',
 'Quantify internal strengths and weaknesses to produce a single weighted score indicating overall internal position',
 'Step 1: List 10-20 key internal factors (strengths and weaknesses). Step 2: Assign weight 0.0-1.0 to each (sum = 1.0) based on industry importance. Step 3: Rate each 1-4 (1=major weakness, 2=minor weakness, 3=minor strength, 4=major strength). Step 4: Multiply weight × rating for weighted score. Step 5: Sum all weighted scores for total.',
 '{"columns": ["Internal Factor", "Weight (0.0-1.0)", "Rating (1-4)", "Weighted Score"], "rows": "10-20 factors", "total_row": "Sum of weighted scores"}'::jsonb,
 '{"ratings": {"1": "Major weakness", "2": "Minor weakness", "3": "Minor strength", "4": "Major strength"}, "weights": "Sum must equal 1.0, based on industry importance", "total_interpretation": {"below_2.5": "Weak internal position", "above_2.5": "Strong internal position", "average": "2.5"}}'::jsonb,
 'Total weighted score below 2.5 = weak internal position. Above 2.5 = strong. Average is 2.5. Use for IE Matrix x-axis.',
 ARRAY['Quantifies subjective assessment', 'Forces prioritization via weights', 'Produces single comparable score', 'Identifies critical factors'],
 ARRAY['Subjective ratings', 'Requires good intuitive judgment', 'Factors can be too broad', 'Static snapshot'],
 ARRAY['ie_matrix', 'swot', 'qspm'],
 '{"example_strengths": ["Strong brand reputation", "Proprietary technology", "Low debt-to-equity ratio", "High employee morale", "Efficient supply chain"], "example_weaknesses": ["No strategic direction", "Aging facilities", "Poor R&D record", "Weak online presence", "High employee turnover"]}'::jsonb),

('efe_matrix', 'External Factor Evaluation Matrix', 'مصفوفة تقييم العوامل الخارجية', 'input', 'External Analysis',
 'Fred R. David', 1986,
 'Summarizes and evaluates economic, social, cultural, demographic, environmental, political, governmental, legal, technological, and competitive information.',
 'تلخص وتقيم المعلومات الاقتصادية والاجتماعية والثقافية والديموغرافية والبيئية والسياسية',
 'Quantify external opportunities and threats to produce a weighted score indicating how effectively current strategies respond to the environment',
 'Step 1: List 10-20 key external factors (opportunities and threats). Step 2: Assign weight 0.0-1.0 to each (sum = 1.0). Step 3: Rate each 1-4 (1=poor response, 2=average response, 3=above average response, 4=superior response). Step 4: Multiply weight × rating. Step 5: Sum all weighted scores.',
 '{"columns": ["External Factor", "Weight (0.0-1.0)", "Rating (1-4)", "Weighted Score"], "rows": "10-20 factors", "total_row": "Sum of weighted scores"}'::jsonb,
 '{"ratings": {"1": "Poor response", "2": "Average response", "3": "Above average response", "4": "Superior response"}, "weights": "Sum must equal 1.0, based on industry importance", "total_interpretation": {"below_2.5": "Strategies not exploiting opportunities or defending against threats", "above_2.5": "Strategies effectively responding to environment", "average": "2.5"}}'::jsonb,
 'Total below 2.5 = strategies not effectively responding to environment. Above 2.5 = good response. Average is 2.5. Use for IE Matrix y-axis.',
 ARRAY['Comprehensive external scan', 'Quantifies strategy effectiveness against environment', 'Feeds directly into IE Matrix', 'Forces honest assessment of response quality'],
 ARRAY['Subjective ratings', 'Does not directly suggest strategies', 'Static snapshot', 'Factors may overlap'],
 ARRAY['ie_matrix', 'swot', 'qspm'],
 '{"example_opportunities": ["Growing MENA AI market ($166B by 2030)", "Arabic-first SaaS gap", "Government digitization mandates", "Young tech-savvy population", "Rising venture capital in region"], "example_threats": ["Global tech giants entering market", "Regulatory uncertainty", "Talent shortage", "Currency volatility", "Cybersecurity risks"]}'::jsonb),

('cpm', 'Competitive Profile Matrix', 'مصفوفة الملف التنافسي', 'input', 'Competitive Analysis',
 'Fred R. David', 1986,
 'Identifies a firms major competitors and their particular strengths and weaknesses in relation to a sample firms strategic position. Compares companies on critical success factors.',
 'تحدد المنافسين الرئيسيين ونقاط قوتهم وضعفهم مقارنة بموقف الشركة الاستراتيجي',
 'Benchmark your company against direct competitors on the factors that matter most for industry success',
 'Step 1: Identify 6-12 critical success factors for the industry. Step 2: Assign weight 0.0-1.0 to each (sum = 1.0). Step 3: Rate each company 1-4 on each factor (1=major weakness, 4=major strength). Step 4: Compute weighted scores. Step 5: Compare total weighted scores across competitors.',
 '{"columns": ["Critical Success Factor", "Weight", "Company Rating", "Company Score", "Competitor 1 Rating", "Competitor 1 Score", "Competitor 2 Rating", "Competitor 2 Score"], "rows": "6-12 factors"}'::jsonb,
 '{"ratings": {"1": "Major weakness", "2": "Minor weakness", "3": "Minor strength", "4": "Major strength"}, "weights": "Sum = 1.0, same weights for all companies", "comparison": "Higher total = stronger competitive position"}'::jsonb,
 'Higher total weighted score = stronger competitive position. Compare across all competitors to identify relative positioning.',
 ARRAY['Direct competitor comparison', 'Identifies competitive advantages', 'Uses same factors across firms', 'Quantifies competitive position'],
 ARRAY['Limited to identified competitors', 'Subjective ratings', 'Factors may miss disruptors', 'Static comparison'],
 ARRAY['swot', 'space_matrix', 'qspm'],
 '{"example_factors": ["Market share", "Price competitiveness", "Product quality", "Customer loyalty", "Financial position", "Technological capability", "Management experience", "Global expansion", "E-commerce presence"]}'::jsonb),

-- STAGE 2: MATCHING
('space_matrix', 'SPACE Matrix', 'مصفوفة سبيس', 'matching', 'Strategic Position',
 'Rowe, Mason, Dickel, Mann, and Mockler', 1982,
 'Strategic Position and Action Evaluation Matrix. Four-quadrant framework using Financial Strength (FS), Competitive Advantage (CA), Environmental Stability (ES), and Industry Strength (IS) to determine appropriate strategic posture.',
 'مصفوفة تقييم الموقع الاستراتيجي والعمل - تحدد الوضع الاستراتيجي المناسب',
 'Determine whether aggressive, conservative, defensive, or competitive strategies are most appropriate',
 'Step 1: Select variables for each dimension (FS, CA, ES, IS). Step 2: Rate FS and IS from +1 (worst) to +7 (best). Rate ES and CA from -1 (best) to -7 (worst). Step 3: Compute average score for each dimension. Step 4: Plot: X-axis = CA average + IS average. Y-axis = FS average + ES average. Step 5: Draw directional vector from origin through the point.',
 '{"axes": {"x": "Competitive Advantage + Industry Strength", "y": "Financial Strength + Environmental Stability"}, "quadrants": {"Q1_aggressive": "Upper right - strong position in growing industry", "Q2_conservative": "Upper left - stable market, compete on competencies", "Q3_defensive": "Lower left - focus on overcoming weaknesses, avoid threats", "Q4_competitive": "Lower right - competitive but unstable environment"}}'::jsonb,
 '{"FS_variables": ["ROI", "Leverage", "Liquidity", "Working capital", "Cash flow", "Ease of exit"], "CA_variables": ["Market share", "Product quality", "Product life cycle", "Customer loyalty", "Technology", "Vertical integration"], "ES_variables": ["Technology change rate", "Inflation rate", "Demand variability", "Price range of competing products", "Barriers to entry", "Competitive pressure"], "IS_variables": ["Growth potential", "Profit potential", "Financial stability", "Technology know-how", "Resource utilization", "Ease of entry"]}'::jsonb,
 'Aggressive (upper right): Market penetration, market development, product development, forward/backward integration, diversification. Conservative (upper left): Market penetration, market development, product development, related diversification. Defensive (lower left): Retrenchment, divestiture, liquidation. Competitive (lower right): Backward/forward/horizontal integration, market penetration, market development, product development.',
 ARRAY['Visual strategic posture', 'Multi-dimensional analysis', 'Links to specific strategy types', 'Considers internal and external'],
 ARRAY['Subjective variable selection', 'Assumes linear relationships', 'Four postures may oversimplify', 'Sensitive to variable choice'],
 ARRAY['qspm'],
 '{"example": "A company with FS=4.5, CA=-2.1, ES=-3.2, IS=5.7 would plot at X=(5.7+(-2.1))=3.6, Y=(4.5+(-3.2))=1.3, falling in the Aggressive quadrant"}'::jsonb),

('ie_matrix', 'Internal-External Matrix', 'مصفوفة الداخلي-الخارجي', 'matching', 'Portfolio Strategy',
 'Fred R. David (adapted from GE-McKinsey)', 1986,
 'Plots IFE total weighted score (x-axis) against EFE total weighted score (y-axis) in a 3x3 grid. Each cell prescribes a strategic direction: grow & build, hold & maintain, or harvest & divest.',
 'ترسم درجات تقييم العوامل الداخلية والخارجية في شبكة 3×3 لتحديد التوجه الاستراتيجي',
 'Use IFE and EFE scores to determine the overall strategic direction for a business unit or company',
 'Step 1: Compute IFE total weighted score. Step 2: Compute EFE total weighted score. Step 3: Plot on 3x3 grid (IFE on x-axis: Strong 3.0-4.0, Average 2.0-2.99, Weak 1.0-1.99; EFE on y-axis: High 3.0-4.0, Medium 2.0-2.99, Low 1.0-1.99). Step 4: Identify which of 9 cells the business falls in. Step 5: Apply prescribed strategy.',
 '{"grid": "3x3", "x_axis": "IFE Total Weighted Score", "y_axis": "EFE Total Weighted Score", "cells": {"I_II_IV": "Grow and Build", "III_V_VII": "Hold and Maintain", "VI_VIII_IX": "Harvest or Divest"}}'::jsonb,
 '{"x_ranges": {"strong": "3.0-4.0", "average": "2.0-2.99", "weak": "1.0-1.99"}, "y_ranges": {"high": "3.0-4.0", "medium": "2.0-2.99", "low": "1.0-1.99"}, "strategies": {"grow_build": "Intensive (market penetration, market development, product development) or integrative", "hold_maintain": "Market penetration, product development", "harvest_divest": "Retrenchment, divestiture, liquidation"}}'::jsonb,
 'Cells I, II, IV = Grow & Build (aggressive). Cells III, V, VII = Hold & Maintain (moderate). Cells VI, VIII, IX = Harvest & Divest (defensive). Requires both IFE and EFE scores as input.',
 ARRAY['Direct strategy prescription', 'Uses quantified IFE/EFE data', 'Visual portfolio positioning', 'Applicable to multi-division firms'],
 ARRAY['Requires IFE/EFE first', 'Only two dimensions', 'Prescriptions are general', 'Static'],
 ARRAY['qspm', 'grand_strategy'],
 '{}'::jsonb),

('grand_strategy', 'Grand Strategy Matrix', 'مصفوفة الاستراتيجية الكبرى', 'matching', 'Strategic Direction',
 'Fred R. David', 1986,
 'Two-dimensional matrix based on competitive position (x-axis: weak to strong) and market growth (y-axis: slow to rapid). Each quadrant suggests different strategy families.',
 'مصفوفة ثنائية الأبعاد بناءً على الموقع التنافسي ونمو السوق',
 'Determine which family of strategies is most appropriate based on competitive position and market growth rate',
 'Step 1: Assess competitive position (weak or strong). Step 2: Assess market growth (slow or rapid). Step 3: Identify quadrant. Step 4: Select appropriate strategy from quadrant options.',
 '{"axes": {"x": "Competitive Position (Weak → Strong)", "y": "Market Growth (Slow → Rapid)"}, "quadrants": {"Q1": "Rapid growth + Strong position → Market development, product development, forward/backward/horizontal integration", "Q2": "Rapid growth + Weak position → Market development, market penetration, product development, horizontal integration, divestiture, liquidation", "Q3": "Slow growth + Weak position → Retrenchment, related/unrelated diversification, divestiture, liquidation", "Q4": "Slow growth + Strong position → Related/unrelated diversification, joint ventures"}}'::jsonb,
 '{"Q1_strategies": ["Market development", "Market penetration", "Product development", "Forward integration", "Backward integration", "Horizontal integration", "Related diversification"], "Q2_strategies": ["Market development", "Market penetration", "Product development", "Horizontal integration", "Divestiture", "Liquidation"], "Q3_strategies": ["Retrenchment", "Related diversification", "Unrelated diversification", "Divestiture", "Liquidation"], "Q4_strategies": ["Related diversification", "Unrelated diversification", "Joint ventures"]}'::jsonb,
 'Q1 (upper right): Excellent position. Q2 (upper left): Growing market but weak position — must improve quickly. Q3 (lower left): Worst position — drastic changes needed. Q4 (lower right): Strong but slow growth — diversify.',
 ARRAY['Simple to use', 'Quick strategic direction', 'Considers both internal and external', 'Generates strategy alternatives'],
 ARRAY['Only two dimensions', 'Binary assessment (strong/weak)', 'No weighting mechanism', 'Subjective placement'],
 ARRAY['qspm'],
 '{}'::jsonb),

-- STAGE 3: DECISION
('qspm', 'Quantitative Strategic Planning Matrix', 'مصفوفة التخطيط الاستراتيجي الكمي', 'decision', 'Strategy Selection',
 'Fred R. David', 1986,
 'The ONLY technique specifically designed to determine the relative attractiveness of feasible alternative actions. Uses key internal and external factors with weights from IFE/EFE to objectively evaluate and rank competing strategy alternatives.',
 'التقنية الوحيدة المصممة خصيصاً لتحديد الجاذبية النسبية للإجراءات البديلة الممكنة',
 'Objectively rank alternative strategies to determine which strategy is best, using all critical factors with quantified attractiveness scores',
 'Step 1: List key external opportunities/threats and internal strengths/weaknesses (from IFE/EFE). Step 2: Assign weights (from IFE/EFE). Step 3: List 2-4 alternative strategies (from matching stage). Step 4: Determine Attractiveness Scores (AS) 1-4 for each factor-strategy pair. Step 5: Compute Total Attractiveness Score (TAS) = Weight × AS. Step 6: Sum TAS for each strategy. Highest Sum = best strategy.',
 '{"columns": ["Key Factor", "Weight", "Strategy 1 AS", "Strategy 1 TAS", "Strategy 2 AS", "Strategy 2 TAS", "Strategy 3 AS", "Strategy 3 TAS"], "rows": "All IFE + EFE factors", "total_row": "Sum of TAS for each strategy"}'::jsonb,
 '{"attractiveness_scores": {"1": "Not attractive", "2": "Somewhat attractive", "3": "Reasonably attractive", "4": "Highly attractive", "-": "Factor not relevant to strategy"}, "weights": "Transferred directly from IFE and EFE matrices", "decision_rule": "Strategy with highest Sum Total Attractiveness Score is the best choice"}'::jsonb,
 'The strategy with the highest Sum Total Attractiveness Score (STAS) is the best strategy. If scores are close, the strategies are roughly equivalent. This is the most rigorous strategy selection technique available.',
 ARRAY['Only quantitative strategy selection technique', 'Integrates all critical factors', 'Evaluates strategies simultaneously', 'Requires analytical integration of IFE/EFE data', 'Reduces subjectivity in decision'],
 ARRAY['Requires IFE and EFE first', 'AS ratings still somewhat subjective', 'Only as good as input data', 'Cannot handle more than ~4 strategies easily'],
 ARRAY[]::text[],
 '{"note": "QSPM is the capstone of Fred Davids three-stage framework. All prior tools (IFE, EFE, CPM, SWOT, SPACE, BCG, IE, Grand Strategy) feed into the QSPM for final strategy selection."}'::jsonb)

ON CONFLICT (code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- NEW FRAMEWORKS (Fred David + additional)
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO kb_frameworks (code, name, name_ar, phase, category, originator, year_introduced, description, complexity_level, strengths, limitations, best_paired_with) VALUES
('david_3stage', 'David Three-Stage Framework', 'إطار ديفيد ذو المراحل الثلاث', 'formulation', 'Strategy Selection',
 'Fred R. David', 1986,
 'Comprehensive three-stage strategy formulation framework: Input Stage (IFE, EFE, CPM) → Matching Stage (SWOT, SPACE, BCG, IE, Grand Strategy) → Decision Stage (QSPM). The most systematic analytical approach to strategy selection taught in business schools worldwide.',
 'high',
 ARRAY['Most systematic strategy selection process','Integrates multiple tools','Reduces subjectivity','Produces quantified strategy ranking','Widely taught in MBA programs'],
 ARRAY['Time intensive','Requires good data','Multiple subjective judgments','Can be mechanistic'],
 ARRAY['bsc','okr','swot','five_forces']),

('4dx', '4 Disciplines of Execution', 'التخصصات الأربعة للتنفيذ', 'execution', 'Execution',
 'McChesney, Covey & Huling', 2012,
 'Four disciplines: Focus on Wildly Important Goals, Act on Lead Measures, Keep a Compelling Scoreboard, Create a Cadence of Accountability. The most practical execution methodology.',
 'medium',
 ARRAY['Highly practical','Lead vs lag distinction','Built-in accountability','Scoreboard culture'],
 ARRAY['Narrow focus (1-2 WIGs)','Can ignore broader strategy','Requires discipline','Cultural resistance'],
 ARRAY['okr','bsc']),

('playing_to_win', 'Playing to Win Choice Cascade', 'سلسلة خيارات اللعب للفوز', 'formulation', 'Strategy Design',
 'Roger Martin & A.G. Lafley', 2013,
 'Five-question strategy cascade: Winning Aspiration → Where to Play → How to Win → Core Capabilities → Management Systems. The most practical formulation framework.',
 'medium',
 ARRAY['Forces clear choices','P&G battle-tested','Cascadable','What-would-have-to-be-true test'],
 ARRAY['Less quantitative','Requires deep market knowledge','Can be iterative not linear','Bias toward existing position'],
 ARRAY['five_forces','bmc','david_3stage']),

('strategy_canvas', 'Blue Ocean Strategy Canvas', 'لوحة استراتيجية المحيط الأزرق', 'formulation', 'Market Strategy',
 'W. Chan Kim & Renée Mauborgne', 2005,
 'Visual tool comparing value curves across competing factors using the Four Actions Framework: Eliminate, Reduce, Raise, Create (ERRC Grid). Identifies blue ocean opportunities.',
 'medium',
 ARRAY['Visual and intuitive','Identifies uncontested space','ERRC is actionable','Challenges industry assumptions'],
 ARRAY['Hard to identify right factors','Blue oceans attract competition','Execution not addressed','May miss incremental value'],
 ARRAY['blue_ocean','bmc','five_forces']),

('good_strategy_kernel', 'Good Strategy Kernel', 'نواة الاستراتيجية الجيدة', 'analysis', 'Strategy Diagnostic',
 'Richard Rumelt', 2011,
 'Three-part diagnostic: Diagnosis (what is going on), Guiding Policy (overall approach), Coherent Action (coordinated set of actions). Detects bad strategy patterns: fluff, mistaking goals for strategy, failure to face challenges.',
 'low',
 ARRAY['Powerful diagnostic','Detects bad strategy','Simple framework','Forces honest assessment'],
 ARRAY['Diagnostic only, not prescriptive','Subjective diagnosis','No execution layer','Can be harsh on existing plans'],
 ARRAY['swot','david_3stage','playing_to_win']),

('lean_startup', 'Lean Startup Methodology', 'منهجية الشركة الناشئة الرشيقة', 'execution', 'Innovation',
 'Eric Ries', 2011,
 'Build-Measure-Learn loop with MVP, pivot-or-persevere decisions, and innovation accounting. Best for initiative-level strategy testing.',
 'medium',
 ARRAY['Fast iteration','Hypothesis-driven','Reduces waste','Startup proven'],
 ARRAY['Difficult at enterprise scale','Can lose strategic focus','Bias toward action','Metrics can mislead'],
 ARRAY['bmc','lean_canvas','okr']),

('v2mom', 'V2MOM', 'في تو موم', 'execution', 'Planning',
 'Marc Benioff / Salesforce', 1999,
 'Vision, Values, Methods, Obstacles, Measures. Salesforces one-page strategic alignment tool used from startup to $30B+ company. Cascadable from CEO to individual contributor.',
 'low',
 ARRAY['One-page simplicity','Proven at massive scale','Cascadable','Forces obstacle identification'],
 ARRAY['Salesforce-specific culture','Less analytical','No competitive analysis','Requires strong leadership'],
 ARRAY['okr','ogsm']),

('execution_premium', 'Execution Premium System', 'نظام علاوة التنفيذ', 'execution', 'Closed-Loop Management',
 'Robert Kaplan & David Norton', 2008,
 'Six-stage closed-loop management system: Develop Strategy → Translate Strategy → Align Organization → Plan Operations → Monitor & Learn → Test & Adapt. The most comprehensive strategy-to-execution framework.',
 'high',
 ARRAY['Most comprehensive execution system','Closed-loop learning','Integrates BSC/Strategy Maps','Links strategy to operations'],
 ARRAY['Very complex','Requires organization-wide commitment','Resource intensive','Can become bureaucratic'],
 ARRAY['bsc','strategy_maps','hoshin']),

('mckinsey_hockey_stick', 'Strategy Beyond the Hockey Stick', 'الاستراتيجية وراء عصا الهوكي', 'analysis', 'Evidence-Based Strategy',
 'Bradley, Hirt & Smit / McKinsey', 2018,
 'Evidence-based framework analyzing 2,393 companies. Five Big Moves: Programmatic M&A, Resource Reallocation, Strong Capital Expenditure, Productivity Improvement, Differentiation Improvement. Power Curve of economic profit.',
 'high',
 ARRAY['Data-driven (2393 companies)','Identifies actual success patterns','Outside view reduces bias','Five actionable big moves'],
 ARRAY['Requires large-company data','Historical patterns may not repeat','Complex analysis','McKinsey-centric'],
 ARRAY['david_3stage','bsc','five_forces']),

('jobs_to_be_done', 'Jobs-to-be-Done Framework', 'إطار المهام المطلوب إنجازها', 'analysis', 'Customer Strategy',
 'Clayton Christensen', 2016,
 'Customers hire products to do specific jobs. Identifies functional, emotional, and social jobs. Forces customer-centric strategy rather than product-centric thinking.',
 'medium',
 ARRAY['Deep customer insight','Innovation catalyst','Reframes competition','Universal applicability'],
 ARRAY['Hard to identify right jobs','Qualitative','No quantification method','Can be vague'],
 ARRAY['bmc','blue_ocean','lean_canvas'])

ON CONFLICT (code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- NEW AUTHORS
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO kb_authors (name, name_ar, affiliation) VALUES
('Fred R. David', 'فريد ر. ديفيد', 'Francis Marion University'),
('Forest R. David', 'فورست ر. ديفيد', 'Francis Marion University'),
('Richard Rumelt', 'ريتشارد روملت', 'UCLA Anderson'),
('Henry Mintzberg', 'هنري مينتزبرغ', 'McGill University'),
('Jim Collins', 'جيم كولينز', 'Independent Researcher'),
('Clayton Christensen', 'كلايتون كريستنسن', 'Harvard Business School'),
('Eric Ries', 'إريك ريس', 'Lean Startup Co'),
('Peter Thiel', 'بيتر ثيل', 'Founders Fund'),
('Rita McGrath', 'ريتا ماكغراث', 'Columbia Business School'),
('Geoffrey Moore', 'جيفري مور', 'Author / Advisor'),
('Marc Benioff', 'مارك بينيوف', 'Salesforce'),
('Eliyahu Goldratt', 'إلياهو غولدرات', 'Goldratt Institute'),
('Ash Maurya', 'آش موريا', 'Lean Stack'),
('Annie Duke', 'آني ديوك', 'Decision Scientist'),
('Reid Hoffman', 'ريد هوفمان', 'LinkedIn / Greylock'),
('Chris McChesney', 'كريس ماكتشيسني', 'FranklinCovey')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- BOOKS — 26 additional (bringing total from 15 to 41)
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO kb_books (title, year_published, category, integration_tier, key_concepts, relevance_to_stairs) VALUES
-- Fred David (the textbook itself)
('Strategic Management: A Competitive Advantage Approach', 2020, 'Strategy Textbook', 'tier_1',
 ARRAY['Three-Stage Framework','IFE Matrix','EFE Matrix','CPM','SPACE Matrix','IE Matrix','Grand Strategy Matrix','QSPM','Strategy Formulation','Strategy Implementation','Strategy Evaluation'],
 'THE foundational textbook for strategy measurement tools. IFE/EFE/CPM/QSPM templates are the backbone of strategy quantification.'),

-- Strategy Formulation Canon
('Playing to Win', 2013, 'Strategy Formulation', 'tier_1',
 ARRAY['Strategy Choice Cascade','Where to Play','How to Win','Core Capabilities','Management Systems'],
 'Strategy Choice Cascade as primary formulation framework in AI wizard'),
('Good Strategy Bad Strategy', 2011, 'Strategy Diagnostic', 'tier_1',
 ARRAY['Strategy Kernel','Diagnosis','Guiding Policy','Coherent Action','Bad Strategy Detection'],
 'AI strategy quality diagnostic — detect fluff, goal-disguised-as-strategy, avoiding challenges'),
('Blue Ocean Shift', 2017, 'Market Strategy', 'tier_1',
 ARRAY['Five-Step Process','Pioneer-Migrator-Settler Map','Buyer Utility Map','Six Paths Framework'],
 'Extended Blue Ocean tools for systematic market creation process'),

-- Execution Canon
('The Strategy-Focused Organization', 2001, 'Strategy Execution', 'tier_1',
 ARRAY['Five Principles','Strategy Translation','Organization Alignment','Make Strategy Everyones Job','Continuous Process','Leadership Mobilization'],
 'Five principles for making BSC work as organizational transformation, not just measurement'),
('Strategy Maps', 2004, 'Strategy Visualization', 'tier_1',
 ARRAY['Cause-Effect Chains','Four Perspectives','Intangible Assets','Strategy Communication'],
 'Visual cause-and-effect strategy mapping — core visualization for staircase relationships'),
('The Execution Premium', 2008, 'Closed-Loop Management', 'tier_1',
 ARRAY['Six-Stage System','Develop Strategy','Translate Strategy','Align Organization','Plan Operations','Monitor and Learn','Test and Adapt'],
 'The complete closed-loop management system — the operational backbone for ST.AIRS'),
('Alignment', 2006, 'Organization Strategy', 'tier_2',
 ARRAY['Corporate Strategy Map','Multi-Unit Alignment','Shared Services','Board Governance'],
 'Multi-unit strategy cascade architecture for enterprise ST.AIRS deployment'),
('4 Disciplines of Execution', 2012, 'Execution', 'tier_1',
 ARRAY['Wildly Important Goals','Lead Measures','Compelling Scoreboard','Cadence of Accountability'],
 'Lead vs lag measurement methodology and accountability cadence design'),

-- Innovation and Disruption
('Competing Against Luck', 2016, 'Innovation', 'tier_2',
 ARRAY['Jobs-to-be-Done','Functional Jobs','Emotional Jobs','Social Jobs','Job Spec','Hiring Criteria'],
 'Customer-centric strategy formulation through JTBD analysis'),
('Crossing the Chasm', 2014, 'Technology Strategy', 'tier_2',
 ARRAY['Technology Adoption Lifecycle','Chasm','Bowling Pin Strategy','Whole Product','Target Segment'],
 'Technology adoption patterns for AI product strategy and market sequencing'),
('Zone to Win', 2015, 'Portfolio Strategy', 'tier_2',
 ARRAY['Performance Zone','Productivity Zone','Incubation Zone','Transformation Zone'],
 'Four-zone portfolio management for balancing core business with innovation'),
('The Invincible Company', 2020, 'Business Model', 'tier_2',
 ARRAY['Explore-Exploit Portfolio','Business Model Portfolio','Innovation Metrics','Culture Map'],
 'Business model portfolio management and innovation metrics'),

-- Decision Making and Scaling
('Only the Paranoid Survive', 1996, 'Strategic Foresight', 'tier_2',
 ARRAY['Strategic Inflection Points','10X Forces','Signal vs Noise','Cassandras'],
 'Inflection point detection patterns for AI monitoring engine'),
('Good to Great', 2001, 'Organization Strategy', 'tier_2',
 ARRAY['Hedgehog Concept','Flywheel','Level 5 Leadership','First Who Then What','Stockdale Paradox'],
 'Hedgehog Concept as strategy focus diagnostic, Flywheel as momentum model'),
('Built to Last', 1994, 'Organization Strategy', 'tier_3',
 ARRAY['BHAGs','Core Ideology','Preserve Core Stimulate Progress','Clock Building'],
 'BHAG concept for vision-level strategy elements, core ideology preservation'),
('Blitzscaling', 2018, 'Growth Strategy', 'tier_3',
 ARRAY['Five Stages','Network Effects','Growth Factors','Counterintuitive Rules'],
 'Hypergrowth stage detection and appropriate strategy scaling patterns'),
('Zero to One', 2014, 'Innovation', 'tier_3',
 ARRAY['Monopoly Theory','Definite Optimism','Power Law','Contrarian Truth','Last Mover Advantage'],
 'Breakthrough strategy philosophy — contrarian truth-finding for differentiation'),

-- Systems and Planning
('The Rise and Fall of Strategic Planning', 1994, 'Meta-Strategy', 'tier_2',
 ARRAY['Emergent Strategy','Deliberate Strategy','Planning vs Strategy','Crafting Strategy'],
 'Essential counterpoint — detect when planning is killing real strategy'),
('Strategy Safari', 1998, 'Meta-Strategy', 'tier_3',
 ARRAY['Ten Schools','Design School','Planning School','Positioning School','Entrepreneurial School','Cognitive School','Learning School','Power School','Cultural School','Environmental School','Configuration School'],
 'Meta-framework for understanding which strategic thinking school applies'),
('A New Way to Think', 2022, 'Strategy Frameworks', 'tier_2',
 ARRAY['What Would Have to Be True','Bayesian Strategy','Integrative Thinking','Stakeholder Capitalism'],
 'What-would-have-to-be-true framework for stress-testing strategic assumptions'),

-- Additional seminal works
('Business Model Generation', 2010, 'Business Model', 'tier_1',
 ARRAY['Business Model Canvas','Nine Building Blocks','Patterns','Design Process'],
 'Business Model Canvas as strategy design tool — nine building blocks template'),
('Value Proposition Design', 2014, 'Business Model', 'tier_2',
 ARRAY['Value Proposition Canvas','Customer Profile','Value Map','Fit','Testing'],
 'Value proposition refinement and customer-strategy fit assessment'),
('The Goal', 1984, 'Operations Strategy', 'tier_3',
 ARRAY['Theory of Constraints','Throughput','Inventory','Operating Expense','Five Focusing Steps'],
 'Theory of Constraints as bottleneck identification in strategy execution'),
('Competitive Advantage', 1985, 'Strategy Analysis', 'tier_3',
 ARRAY['Value Chain','Activities','Cost Advantage','Differentiation','Competitive Scope'],
 'Value chain analysis for competitive advantage identification'),
('Strategy Beyond the Hockey Stick', 2018, 'Evidence-Based Strategy', 'tier_1',
 ARRAY['Power Curve','Five Big Moves','Social Side of Strategy','Outside View','Endowment Effect'],
 'Data-driven strategy assessment and Big Moves probability framework')

ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- ADDITIONAL FAILURE PATTERNS
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO kb_failure_patterns (code, name, name_ar, category, description, detection_signals, prevention_strategies, severity, research_source, statistic) VALUES
('goal_as_strategy', 'Goals Disguised as Strategy', 'أهداف متنكرة كاستراتيجية', 'Formulation',
 'Setting ambitious goals (Grow 20%, Be #1 in market) without articulating HOW to achieve them. Rumelt calls this the most common form of bad strategy. Confuses aspiration with action.',
 ARRAY['Vision/mission statements that are just goals','No diagnosis of challenges','No guiding policy','Initiatives disconnected from objectives','All objectives start with Achieve/Grow/Be'],
 ARRAY['Apply Rumelt Kernel diagnostic','Require guiding policy before goals','Use Playing to Win cascade','Mandate coherent action plans'],
 'critical', 'Richard Rumelt - Good Strategy Bad Strategy (2011)',
 'Rumelt estimates 80%+ of strategies he reviews are actually just goal-setting exercises, not real strategies'),

('analysis_paralysis', 'Analysis Paralysis', 'شلل التحليل', 'Execution',
 'Over-analysis and endless planning without action. Teams spend months perfecting strategy documents while competitors execute. Common in organizations that value consensus over speed.',
 ARRAY['Strategy documents exceeding 50 pages','Planning cycles exceeding 6 months','Multiple rounds of stakeholder review with no approval','Waiting for perfect information','More analysts than executors'],
 ARRAY['Set hard planning deadlines','Use Lean Startup experimentation','Apply minimum viable strategy concept','Time-box analysis phases','Adopt OKR quarterly cadence'],
 'high', 'McKinsey Strategy Practice (2019)',
 'Organizations that take more than 4 months to finalize strategy are 2.5x less likely to outperform'),

('metric_manipulation', 'Metric Gaming and Goodhart Effect', 'التلاعب بالمقاييس', 'Monitoring',
 'When a measure becomes a target, it ceases to be a good measure (Goodharts Law). Teams optimize for the metric rather than the underlying goal. Common with OKRs tied to compensation.',
 ARRAY['Unusual measurement patterns','Metrics improving while outcomes worsen','Teams sandbagging targets','Cherry-picking favorable metrics','KPIs changing frequently'],
 ARRAY['Separate OKR scores from compensation','Use balanced leading AND lagging indicators','Rotate metric reviewers','Apply 4DX lead measure discipline','Regular metric audit cycles'],
 'high', 'Charles Goodhart (1975) / Doerr - Measure What Matters',
 'Organizations tying OKRs to compensation see 23% more sandbagging and goal manipulation'),

('ivory_tower_strategy', 'Ivory Tower Strategy', 'استراتيجية البرج العاجي', 'Formulation',
 'Strategy developed by a small executive team or consultants without input from frontline managers. Results in strategies that look good on paper but fail in reality because they ignore operational constraints.',
 ARRAY['Strategy developed by < 5 people','No frontline input','Surprise strategy rollout','Implementation resistance','Strategy language disconnected from daily operations'],
 ARRAY['Use Hoshin Kanri catchball process','Include frontline in planning','Apply rapid strategy prototyping','Use 4DX WIG sessions','Make strategy everyones job (Kaplan)'],
 'high', 'Sull, Homkes, Sull - MIT/HBR (2015)',
 'Only 5% of employees understand their companys strategy (Kaplan & Norton 2005), and 67% of well-formulated strategies fail due to poor execution (Bridges Business Consultancy)')

ON CONFLICT (code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- ADDITIONAL KPIs
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO kb_leading_lagging_kpis (perspective, kpi_name, kpi_name_ar, kpi_type, description, typical_unit) VALUES
('Financial', 'Annual Recurring Revenue', 'الإيرادات السنوية المتكررة', 'lagging', 'Total annualized recurring subscription revenue', 'currency'),
('Financial', 'Customer Acquisition Cost', 'تكلفة اكتساب العميل', 'leading', 'Total cost to acquire one new customer', 'currency'),
('Financial', 'Burn Rate', 'معدل الحرق', 'leading', 'Monthly cash outflow rate for startups and growth companies', 'currency'),
('Customer', 'Monthly Active Users', 'المستخدمون النشطون شهرياً', 'leading', 'Number of unique users engaging with product monthly', 'count'),
('Customer', 'Customer Lifetime Value', 'القيمة الدائمة للعميل', 'lagging', 'Total revenue expected from a customer over their lifetime', 'currency'),
('Customer', 'Churn Rate', 'معدل الانقطاع', 'lagging', 'Percentage of customers lost over a period', 'percent'),
('Internal Process', 'Sprint Velocity', 'سرعة السبرنت', 'leading', 'Story points completed per sprint in agile development', 'points'),
('Internal Process', 'Feature Adoption Rate', 'معدل تبني الميزات', 'leading', 'Percentage of users adopting newly released features', 'percent'),
('Internal Process', 'Time to Market', 'الوقت حتى السوق', 'lagging', 'Average time from concept to production release', 'days'),
('Learning & Growth', 'Innovation Pipeline Value', 'قيمة خط أنابيب الابتكار', 'leading', 'Total potential value of ideas and experiments in pipeline', 'currency'),
('Learning & Growth', 'Knowledge Sharing Score', 'درجة مشاركة المعرفة', 'leading', 'Composite score measuring documentation, mentoring, and cross-team learning', 'score'),
('Learning & Growth', 'Capability Gap Closure Rate', 'معدل سد فجوة القدرات', 'lagging', 'Percentage of identified capability gaps addressed over period', 'percent')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- ADDITIONAL MENA MARKET INTELLIGENCE
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO kb_mena_market_intel (category, metric_name, value, year, source, country) VALUES
('Investment', 'UAE National AI Strategy 2031', '$96B economic impact target', 2031, 'UAE Government', 'UAE'),
('Investment', 'Saudi NEOM Tech Investment', '$500B total NEOM investment', 2025, 'Saudi PIF', 'Saudi Arabia'),
('Talent', 'MENA Tech Talent Gap', '3.6M tech workers needed by 2030', 2024, 'LinkedIn Economic Graph', 'MENA'),
('Adoption', 'Enterprise AI Adoption MENA', '34% of enterprises using AI', 2024, 'McKinsey MENA Survey', 'MENA'),
('SaaS', 'MENA SaaS Market CAGR', '25.3% growth 2024-2030', 2024, 'ResearchAndMarkets', 'MENA'),
('SaaS', 'Arabic-First SaaS Products', 'Less than 5% of enterprise SaaS', 2024, 'Industry estimate', 'MENA'),
('Regulation', 'Saudi Data Protection Law', 'PDPL enforcement began Sept 2023', 2023, 'Saudi SDAIA', 'Saudi Arabia'),
('Regulation', 'UAE AI Ethics Guidelines', 'Comprehensive AI governance framework', 2024, 'UAE AI Office', 'UAE'),
('Competition', 'Strategy Software Market Global', '$3.2B growing to $5.1B by 2028', 2024, 'MarketsAndMarkets', 'Global'),
('Competition', 'Arabic Strategy Software Market', 'Virtually zero dedicated Arabic-first platforms', 2024, 'Industry assessment', 'MENA')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- ENRICHED ONTOLOGY TERMS (Fred David specific)
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO kb_ontology_terms (canonical_name, canonical_name_ar, description, framework_mappings, hierarchy_level) VALUES
('Internal Factor', 'عامل داخلي', 'A strength or weakness within the organization identified through internal audit',
 '{"ife": "Factor", "swot": "Strength/Weakness", "bsc": "Internal Process/Learning", "david": "IFE Factor"}'::jsonb, 3),
('External Factor', 'عامل خارجي', 'An opportunity or threat in the external environment identified through external audit',
 '{"efe": "Factor", "swot": "Opportunity/Threat", "pestel": "Factor", "david": "EFE Factor"}'::jsonb, 3),
('Critical Success Factor', 'عامل نجاح حاسم', 'Key factor determining competitive success in an industry, used in CPM',
 '{"cpm": "Success Factor", "five_forces": "Competitive Factor", "david": "CPM Factor"}'::jsonb, 3),
('Attractiveness Score', 'درجة الجاذبية', 'Rating 1-4 indicating how attractive a strategy is relative to a specific factor (QSPM)',
 '{"qspm": "AS", "david": "Attractiveness Score"}'::jsonb, 4),
('Strategic Alternative', 'بديل استراتيجي', 'A feasible strategy option generated from matching-stage tools for evaluation in QSPM',
 '{"qspm": "Strategy Column", "swot": "Strategy Option", "david": "Alternative Strategy"}'::jsonb, 2)
ON CONFLICT DO NOTHING;

SELECT 'Knowledge Engine v2 Migration Complete!' AS status,
       (SELECT COUNT(*) FROM kb_frameworks) AS total_frameworks,
       (SELECT COUNT(*) FROM kb_books) AS total_books,
       (SELECT COUNT(*) FROM kb_measurement_tools) AS total_measurement_tools,
       (SELECT COUNT(*) FROM kb_failure_patterns) AS total_failure_patterns,
       (SELECT COUNT(*) FROM kb_leading_lagging_kpis) AS total_kpis,
       (SELECT COUNT(*) FROM kb_mena_market_intel) AS total_mena_intel,
       (SELECT COUNT(*) FROM kb_authors) AS total_authors;
"""

def run():
    print("🪜 ST.AIRS Knowledge Engine v2 — MEGA Enrichment")
    print("=" * 55)
    print()
    print("Adding:")
    print("  📚 Fred David's Three-Stage Framework (IFE/EFE/CPM/SPACE/IE/Grand/QSPM)")
    print("  📚 26 additional books (→ 41 total)")
    print("  📚 10 new frameworks (→ 27 total)")
    print("  📚 4 new failure patterns (→ 12 total)")
    print("  📚 12 new KPIs (→ 28 total)")
    print("  📚 10 new MENA market intelligence rows")
    print("  📚 New table: kb_measurement_tools (strategy quantification)")
    print("  📚 5 new ontology terms (Fred David specific)")
    print()
    print(f"Connecting to Railway Postgres...")

    try:
        conn = psycopg2.connect(DB_URL, sslmode="require")
        conn.autocommit = True
        cur = conn.cursor()
        print("✅ Connected!")

        print("\nRunning migration SQL...")
        cur.execute(MIGRATION_SQL)

        # Fetch results
        result = cur.fetchone()
        if result:
            print(f"\n🎉 {result[0]}")
            print(f"   Frameworks:        {result[1]}")
            print(f"   Books:             {result[2]}")
            print(f"   Measurement Tools: {result[3]}")
            print(f"   Failure Patterns:  {result[4]}")
            print(f"   KPIs:              {result[5]}")
            print(f"   MENA Intel:        {result[6]}")
            print(f"   Authors:           {result[7]}")

        # Verify all tables
        print("\n📊 Full Table Inventory:")
        for tbl in ['kb_authors', 'kb_books', 'kb_frameworks', 'kb_failure_patterns',
                     'kb_ontology_terms', 'kb_review_cadences', 'kb_leading_lagging_kpis',
                     'kb_mena_market_intel', 'kb_measurement_tools']:
            try:
                cur.execute(f"SELECT COUNT(*) FROM {tbl}")
                count = cur.fetchone()[0]
                print(f"  ✅ {tbl}: {count} rows")
            except Exception as e:
                print(f"  ❌ {tbl}: {e}")

        cur.close()
        conn.close()
        print("\n" + "=" * 55)
        print("🏆 ST.AIRS is now powered by the most comprehensive")
        print("   strategy knowledge base of any AI planning platform.")
        print("=" * 55)

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    run()
