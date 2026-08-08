-- ═══════════════════════════════════════════════════════════════════
-- ORG SPLIT — REPORT ONLY. Reads nothing but catalogue and counts.
-- Run against production BEFORE any migration is proposed or executed.
--   psql "$DATABASE_URL" -f backend/scripts/org_split_report.sql
-- Nothing here writes. There is deliberately no UPDATE or INSERT.
-- ═══════════════════════════════════════════════════════════════════
\echo '── 1. Users sitting in the default organization ──'
SELECT o.id AS org_id, o.name AS org_name, count(u.id) AS users,
       min(u.created_at)::date AS first_signup, max(u.created_at)::date AS last_signup
FROM organizations o LEFT JOIN users u ON u.organization_id = o.id
GROUP BY o.id, o.name ORDER BY users DESC;

\echo ''
\echo '── 2. Per user: what they own by owner_id / created_by ──'
SELECT u.email, u.full_name, u.role, u.created_at::date AS joined,
       (SELECT count(*) FROM strategies s WHERE s.owner_id = u.id)              AS strategies,
       (SELECT count(*) FROM stairs st WHERE st.created_by = u.id AND st.deleted_at IS NULL) AS stairs,
       (SELECT count(*) FROM action_plans a WHERE a.created_by = u.id)          AS action_plans,
       (SELECT count(*) FROM generated_artifacts g WHERE g.created_by = u.id)   AS artifacts,
       (SELECT count(*) FROM strategy_sources ss WHERE ss.created_by = u.id)    AS sources,
       (SELECT count(*) FROM notes n WHERE n.user_id = u.id)                    AS notes
FROM users u
WHERE u.organization_id = 'a0000000-0000-0000-0000-000000000001'
ORDER BY strategies DESC, u.created_at;

\echo ''
\echo '── 3. UNOWNED records: no owner_id/created_by, so no safe destination ──'
SELECT 'strategies'          AS table_name, count(*) AS unowned FROM strategies          WHERE owner_id   IS NULL
UNION ALL SELECT 'stairs',              count(*) FROM stairs              WHERE created_by IS NULL AND deleted_at IS NULL
UNION ALL SELECT 'action_plans',        count(*) FROM action_plans        WHERE created_by IS NULL
UNION ALL SELECT 'generated_artifacts', count(*) FROM generated_artifacts WHERE created_by IS NULL
UNION ALL SELECT 'strategy_sources',    count(*) FROM strategy_sources    WHERE created_by IS NULL
UNION ALL SELECT 'notes',               count(*) FROM notes               WHERE user_id    IS NULL;

\echo ''
\echo '── 4. AMBIGUOUS: a strategy whose child records were made by someone else ──'
\echo '     (moving the strategy would move another persons work with it)'
SELECT s.id AS strategy_id, s.name, s.owner_id AS strategy_owner,
       st.created_by AS element_author, count(*) AS elements
FROM stairs st JOIN strategies s ON s.id = st.strategy_id
WHERE st.deleted_at IS NULL AND st.created_by IS DISTINCT FROM s.owner_id
GROUP BY s.id, s.name, s.owner_id, st.created_by
ORDER BY elements DESC;

\echo ''
\echo '── 5. ORPHANS: child rows whose strategy is gone (no FK on strategy_id) ──'
SELECT 'strategy_sources'    AS table_name, count(*) AS orphaned FROM strategy_sources ss
  WHERE NOT EXISTS (SELECT 1 FROM strategies s WHERE s.id = ss.strategy_id)
UNION ALL SELECT 'generated_artifacts', count(*) FROM generated_artifacts g
  WHERE g.strategy_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM strategies s WHERE s.id = g.strategy_id)
UNION ALL SELECT 'agent_logs', count(*) FROM agent_logs al
  WHERE al.strategy_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM strategies s WHERE s.id = al.strategy_id);

\echo ''
\echo '── 6. Cross-owner relationships: edges joining two peoples stairs ──'
SELECT count(*) AS cross_owner_edges
FROM stair_relationships r
JOIN stairs a ON a.id = r.source_stair_id
JOIN stairs b ON b.id = r.target_stair_id
WHERE a.strategy_id IS DISTINCT FROM b.strategy_id;
