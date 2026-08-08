-- ═══════════════════════════════════════════════════════════════════
-- ORG SPLIT — REPORT ONLY. One self-contained statement, one JSON row.
--
--   psql "$DATABASE_URL" -f backend/scripts/org_split_report.sql
--   or paste the whole thing into Railway's database console.
--
-- No psql meta-commands, no \gset, no multiple result sets — it works
-- anywhere a single SELECT works.
--
-- READ ONLY. There is deliberately no UPDATE, INSERT or DELETE anywhere in
-- this file: deciding where another person's data goes is not a decision this
-- script gets to make.
--
-- Tables added by later migrations (generated_artifacts, agent_logs,
-- stair_relationships.organization_id) are probed with to_regclass first, so
-- this still returns a full document against a database that predates them
-- rather than failing outright.
-- ═══════════════════════════════════════════════════════════════════

WITH
-- Which of the optional relations actually exist here.
present AS (
  SELECT to_regclass('public.generated_artifacts') IS NOT NULL AS has_artifacts,
         to_regclass('public.agent_logs')          IS NOT NULL AS has_agent_logs,
         to_regclass('public.stair_relationships') IS NOT NULL AS has_rels
),

-- ─── 1. Organizations and their members ───
orgs AS (
  SELECT jsonb_agg(jsonb_build_object(
           'organization_id', o.id,
           'name',            o.name,
           'slug',            o.slug,
           'users',           (SELECT count(*) FROM users u WHERE u.organization_id = o.id),
           'first_signup',    (SELECT min(u.created_at)::date FROM users u WHERE u.organization_id = o.id),
           'last_signup',     (SELECT max(u.created_at)::date FROM users u WHERE u.organization_id = o.id)
         ) ORDER BY (SELECT count(*) FROM users u WHERE u.organization_id = o.id) DESC) AS j
  FROM organizations o
),

-- ─── 2. Per user: what they own, by owner_id / created_by / user_id ───
per_user AS (
  SELECT jsonb_agg(jsonb_build_object(
           'user_id',      u.id,
           'email',        u.email,
           'full_name',    u.full_name,
           'role',         u.role,
           'organization', o.name,
           'joined',       u.created_at::date,
           'owns', jsonb_build_object(
             'strategies',   (SELECT count(*) FROM strategies s      WHERE s.owner_id   = u.id),
             'stairs',       (SELECT count(*) FROM stairs st         WHERE st.created_by = u.id AND st.deleted_at IS NULL),
             'action_plans', (SELECT count(*) FROM action_plans ap   WHERE ap.created_by = u.id),
             'sources',      (SELECT count(*) FROM strategy_sources ss WHERE ss.created_by = u.id),
             'notes',        (SELECT count(*) FROM notes n           WHERE n.user_id     = u.id),
             'artifacts',    CASE WHEN (SELECT has_artifacts FROM present)
                                  THEN (SELECT (xpath('/row/c/text()', query_to_xml(
                                         format('SELECT count(*) AS c FROM public.generated_artifacts WHERE created_by = %L', u.id),
                                         false, true, '')))[1]::text::bigint)
                                  ELSE NULL END
           )
         ) ORDER BY (SELECT count(*) FROM strategies s WHERE s.owner_id = u.id) DESC, u.created_at) AS j
  FROM users u LEFT JOIN organizations o ON o.id = u.organization_id
),

-- ─── 3. Records with NO owner — nothing identifies where they should go ───
unowned AS (
  SELECT jsonb_build_object(
           'strategies',   (SELECT count(*) FROM strategies      WHERE owner_id   IS NULL),
           'stairs',       (SELECT count(*) FROM stairs          WHERE created_by IS NULL AND deleted_at IS NULL),
           'action_plans', (SELECT count(*) FROM action_plans    WHERE created_by IS NULL),
           'sources',      (SELECT count(*) FROM strategy_sources WHERE created_by IS NULL),
           'notes',        (SELECT count(*) FROM notes           WHERE user_id    IS NULL),
           'artifacts',    CASE WHEN (SELECT has_artifacts FROM present)
                                THEN (SELECT (xpath('/row/c/text()', query_to_xml(
                                       'SELECT count(*) AS c FROM public.generated_artifacts WHERE created_by IS NULL',
                                       false, true, '')))[1]::text::bigint)
                                ELSE NULL END
         ) AS j
),

-- ─── 4. Strategies whose elements were authored by someone else ───
--        Moving one of these moves another person's work with it.
cross_authored AS (
  SELECT jsonb_agg(x ORDER BY x->>'strategy_name') AS j
  FROM (
    SELECT jsonb_build_object(
             'strategy_id',     s.id,
             'strategy_name',   s.name,
             'strategy_owner',  own.email,
             'element_author',  auth.email,
             'elements',        count(*)
           ) AS x
    FROM stairs st
    JOIN strategies s   ON s.id  = st.strategy_id
    LEFT JOIN users own  ON own.id = s.owner_id
    LEFT JOIN users auth ON auth.id = st.created_by
    WHERE st.deleted_at IS NULL
      AND st.created_by IS DISTINCT FROM s.owner_id
    GROUP BY s.id, s.name, own.email, auth.email
  ) q
),

-- ─── 5. Orphans: child rows whose strategy no longer exists ───
orphans AS (
  SELECT jsonb_build_object(
           'strategy_sources', (SELECT count(*) FROM strategy_sources ss
                                WHERE NOT EXISTS (SELECT 1 FROM strategies s WHERE s.id = ss.strategy_id)),
           'generated_artifacts', CASE WHEN (SELECT has_artifacts FROM present)
                                       THEN (SELECT (xpath('/row/c/text()', query_to_xml(
                                              'SELECT count(*) AS c FROM public.generated_artifacts g
                                               WHERE g.strategy_id IS NOT NULL
                                                 AND NOT EXISTS (SELECT 1 FROM strategies s WHERE s.id = g.strategy_id)',
                                              false, true, '')))[1]::text::bigint)
                                       ELSE NULL END,
           'agent_logs', CASE WHEN (SELECT has_agent_logs FROM present)
                              THEN (SELECT (xpath('/row/c/text()', query_to_xml(
                                     'SELECT count(*) AS c FROM public.agent_logs al
                                      WHERE al.strategy_id IS NOT NULL
                                        AND NOT EXISTS (SELECT 1 FROM strategies s WHERE s.id = al.strategy_id)',
                                     false, true, '')))[1]::text::bigint)
                              ELSE NULL END
         ) AS j
),

-- ─── 6. Relationship edges joining two different strategies ───
spanning AS (
  SELECT CASE WHEN (SELECT has_rels FROM present) THEN
    (SELECT (xpath('/row/c/text()', query_to_xml(
      'SELECT count(*) AS c FROM public.stair_relationships r
         JOIN public.stairs a ON a.id = r.source_stair_id
         JOIN public.stairs b ON b.id = r.target_stair_id
        WHERE a.strategy_id IS DISTINCT FROM b.strategy_id',
      false, true, '')))[1]::text::bigint)
  END AS j
),

-- ─── Totals, for a sanity check against the per-user breakdown ───
totals AS (
  SELECT jsonb_build_object(
           'organizations', (SELECT count(*) FROM organizations),
           'users',         (SELECT count(*) FROM users),
           'strategies',    (SELECT count(*) FROM strategies),
           'stairs_live',   (SELECT count(*) FROM stairs WHERE deleted_at IS NULL),
           'stairs_deleted',(SELECT count(*) FROM stairs WHERE deleted_at IS NOT NULL),
           'action_plans',  (SELECT count(*) FROM action_plans),
           'sources',       (SELECT count(*) FROM strategy_sources),
           'notes',         (SELECT count(*) FROM notes),
           'artifacts',     CASE WHEN (SELECT has_artifacts FROM present)
                                 THEN (SELECT (xpath('/row/c/text()', query_to_xml(
                                        'SELECT count(*) AS c FROM public.generated_artifacts',
                                        false, true, '')))[1]::text::bigint)
                                 ELSE NULL END,
           'relationships', CASE WHEN (SELECT has_rels FROM present)
                                 THEN (SELECT (xpath('/row/c/text()', query_to_xml(
                                        'SELECT count(*) AS c FROM public.stair_relationships',
                                        false, true, '')))[1]::text::bigint)
                                 ELSE NULL END
         ) AS j
)

SELECT jsonb_pretty(jsonb_build_object(
  'generated_at',            now(),
  'database',                current_database(),
  'schema_present',          (SELECT to_jsonb(p) FROM present p),
  'totals',                  (SELECT j FROM totals),
  'organizations',           coalesce((SELECT j FROM orgs), '[]'::jsonb),
  'users',                   coalesce((SELECT j FROM per_user), '[]'::jsonb),
  'unowned_records',         (SELECT j FROM unowned),
  'cross_authored_strategies', coalesce((SELECT j FROM cross_authored), '[]'::jsonb),
  'orphaned_rows',           (SELECT j FROM orphans),
  'strategy_spanning_relationship_edges', (SELECT j FROM spanning)
)) AS org_split_report;
