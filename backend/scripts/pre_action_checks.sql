-- ═══════════════════════════════════════════════════════════════════
-- PRE-ACTION CHECKS — REPORT ONLY. One statement, one JSON row.
--
--   psql "$DATABASE_URL" -f backend/scripts/pre_action_checks.sql
--   or paste the whole thing into Railway's database console.
--
-- Everything that needs reading before any account, password or
-- organization change is decided:
--   * every account, with last_login_at (does anyone hold a live token?)
--   * whether any of the three named accounts still use the published password
--   * what Jasmin's one source is, and which strategy it belongs to
--   * what her two accounts own across every table that references a user
--   * soft-deleted stairs by day, with deleted_at beside updated_at
--
-- READ ONLY. No UPDATE, INSERT or DELETE anywhere in this file.
--
-- On the password check: pgcrypto's crypt() cannot read the $2b$ hashes the
-- Python side produces — it returns false for a *correct* password, which
-- would read as a false all-clear. The prefix is rewritten to $2a$ before
-- comparison, which is equivalent for these inputs and verifies correctly.
-- Verified both directions against bcrypt 4.0.1.
-- ═══════════════════════════════════════════════════════════════════

WITH
have_crypt AS (
  SELECT to_regprocedure('public.crypt(text,text)') IS NOT NULL AS ok
),

-- ─── 1. Every account ───
accounts AS (
  SELECT jsonb_agg(jsonb_build_object(
           'email',         u.email,
           'full_name',     u.full_name,
           'role',          u.role,
           'organization',  o.name,
           'created_at',    u.created_at,
           'last_login_at', u.last_login_at,
           'days_since_login', CASE WHEN u.last_login_at IS NULL THEN NULL
                                    ELSE round(extract(epoch FROM now() - u.last_login_at) / 86400) END,
           -- A token minted at the last login is still valid for 72 hours, and
           -- carries its organization in the claim, so no database change can
           -- close access while this is true.
           'may_hold_live_token', u.last_login_at IS NOT NULL
                                  AND u.last_login_at > now() - interval '72 hours',
           'is_active',     u.is_active
         ) ORDER BY u.last_login_at DESC NULLS LAST, u.created_at) AS j
  FROM users u LEFT JOIN organizations o ON o.id = u.organization_id
),

-- ─── 2. Does any named account still use the published password? ───
password_check AS (
  SELECT CASE WHEN (SELECT ok FROM have_crypt) THEN
    (SELECT (xpath('/row/j/text()', query_to_xml($q$
       SELECT coalesce(jsonb_agg(jsonb_build_object(
                'email', email,
                'hash_prefix', left(password_hash, 4),
                'uses_published_password',
                  crypt('stairs2026', replace(password_hash, '$2b$', '$2a$'))
                    = replace(password_hash, '$2b$', '$2a$')
              ) ORDER BY email), '[]'::jsonb) AS j
       FROM users
       WHERE email IN ('test@devoneers.com','tee@devoneers.com','tamomtaz@yahoo.com')
     $q$, false, true, '')))[1]::text::jsonb)
  ELSE '"pgcrypto not installed — cannot check"'::jsonb END AS j
),

-- ─── 3. Jasmin's sources, and what they are attached to ───
jasmin_sources AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'source_id',       ss.id,
           'source_type',     ss.source_type,
           'preview',         left(ss.content, 140),
           'created_at',      ss.created_at,
           'author',          u.email,
           'strategy_id',     ss.strategy_id,
           'strategy_name',   s.name,
           'strategy_still_exists', s.id IS NOT NULL,
           'strategy_owner',  own.email,
           -- The deciding question: is this attached to something of ours, or
           -- something of hers?
           'attached_to_her_own_strategy', s.owner_id = u.id
         ) ORDER BY ss.created_at), '[]'::jsonb) AS j
  FROM strategy_sources ss
  JOIN users u        ON u.id   = ss.created_by
  LEFT JOIN strategies s   ON s.id   = ss.strategy_id
  LEFT JOIN users own      ON own.id = s.owner_id
  WHERE u.email IN ('yasso7yasso@hotmail.com','yasso7yasso@gmail.com')
),

-- ─── 4. What her two accounts own, everywhere a user is referenced ───
jasmin_ids AS (
  SELECT array_agg(id) AS ids FROM users
  WHERE email IN ('yasso7yasso@hotmail.com','yasso7yasso@gmail.com')
),
jasmin_footprint AS (
  SELECT jsonb_build_object(
    'strategies',       (SELECT count(*) FROM strategies         WHERE owner_id   = ANY(ARRAY(SELECT unnest(ids) FROM jasmin_ids))),
    'stairs',           (SELECT count(*) FROM stairs             WHERE created_by = ANY(ARRAY(SELECT unnest(ids) FROM jasmin_ids)) AND deleted_at IS NULL),
    'action_plans',     (SELECT count(*) FROM action_plans       WHERE created_by = ANY(ARRAY(SELECT unnest(ids) FROM jasmin_ids))),
    'sources',          (SELECT count(*) FROM strategy_sources   WHERE created_by = ANY(ARRAY(SELECT unnest(ids) FROM jasmin_ids))),
    'artifacts',        (SELECT count(*) FROM generated_artifacts WHERE created_by = ANY(ARRAY(SELECT unnest(ids) FROM jasmin_ids))),
    'notes',            (SELECT count(*) FROM notes              WHERE user_id    = ANY(ARRAY(SELECT unnest(ids) FROM jasmin_ids))),
    'ai_conversations', (SELECT count(*) FROM ai_conversations   WHERE user_id    = ANY(ARRAY(SELECT unnest(ids) FROM jasmin_ids))),
    'team_memberships', (SELECT count(*) FROM team_members       WHERE user_id    = ANY(ARRAY(SELECT unnest(ids) FROM jasmin_ids)))
  ) AS j
),

-- ─── 5. Soft-deleted stairs: migration fingerprint or human deletions? ───
--        distinct_delete_timestamps is the real tell. A migration soft-deletes
--        every row in one statement, so hundreds of rows share a single
--        deleted_at to the microsecond. People deleting things one at a time
--        produce one distinct timestamp per row. (deleted_at vs updated_at is
--        a weaker signal: the trg_stairs_updated_at trigger rewrites
--        updated_at on any later edit, so a mismatch only means the row was
--        touched afterwards.)
soft_deleted AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'deleted_day',                d,
           'count',                      c,
           'distinct_delete_timestamps', ts,
           'looks_like_one_statement',   ts = 1 AND c > 1,
           'first_deleted_at',           lo,
           'last_deleted_at',            hi,
           'updated_day_range',          ulo::text || (CASE WHEN ulo = uhi THEN '' ELSE ' .. ' || uhi::text END)
         ) ORDER BY d), '[]'::jsonb) AS j
  FROM (
    SELECT date_trunc('day', deleted_at)::date AS d,
           count(*)                            AS c,
           count(DISTINCT deleted_at)          AS ts,
           min(deleted_at)                     AS lo,
           max(deleted_at)                     AS hi,
           min(date_trunc('day', updated_at)::date) AS ulo,
           max(date_trunc('day', updated_at)::date) AS uhi
    FROM stairs
    WHERE deleted_at IS NOT NULL
    GROUP BY 1
  ) q
)

SELECT jsonb_pretty(jsonb_build_object(
  'generated_at',        now(),
  'database',            current_database(),
  'token_lifetime_hours', 72,
  'accounts',            coalesce((SELECT j FROM accounts), '[]'::jsonb),
  'password_check',      (SELECT j FROM password_check),
  'jasmin_sources',      (SELECT j FROM jasmin_sources),
  'jasmin_footprint',    (SELECT j FROM jasmin_footprint),
  'soft_deleted_stairs', (SELECT j FROM soft_deleted),
  'soft_deleted_total',  (SELECT count(*) FROM stairs WHERE deleted_at IS NOT NULL)
)) AS pre_action_checks;
