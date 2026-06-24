"""Assemble the GATE sample set (12 Phase-1 + 5 Phase-2) in both schemas."""
import json, os, sys
HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
import lib_schema as S
import lib_tokens as T

CAND = {json.loads(l)["id"]: json.loads(l)
        for l in open(os.path.join(HERE, "..", "scratch", "phase1_candidates.jsonl"))}

# id -> hand-authored, file-grounded instruction (these double as fan-out exemplars)
P1 = {
 "ecf3ccc3": "In `backend/app/main.py`, simplify the CORS setup: drop the hand-built `_cors_origins` list and the `ALLOWED_ORIGINS` env-merging block, rely solely on `allow_origin_regex` for `*.vercel.app`, add `expose_headers=['*']`, bump the version string to 3.7.1 everywhere it appears, and add a small `GET /api/cors-test` probe endpoint.",
 "609dac1a": "In `backend/app/routers/ai.py`, make `call_claude` resilient to Anthropic 529 (overloaded) responses: add `AI_RETRY_MAX`/`AI_RETRY_DELAY` constants and a module `logger`, wrap the POST in a retry loop that `await asyncio.sleep`s between attempts, and raise `HTTPException(529, ...)` if it still fails after the final attempt.",
 "bc46ac2e": "In `backend/app/routers/stairs.py`, fix `create_stair` so a child inherits its `strategy_id` from its parent when the request omits one, and add `strategy_id` to the `INSERT INTO stairs (...)` column list and its parameter placeholders.",
 "a07f765a": "In `backend/app/routers/auth.py`, add a `POST /signup` endpoint backed by a new `SignupRequest` schema: validate the email against an `EMAIL_RE` regex, require an 8+ character password equal to `confirm_password`, reject already-registered emails, hash the password, insert the user under `DEFAULT_ORG_ID` with role `member`, and return a JWT plus the user row. Hoist the `HTTPException` import to module scope.",
 "5da42ba0": "Create `backend/app/routers/sources.py`: a FastAPI router (prefix `/api/v1/strategies`, tag `sources`) for the `strategy_sources` table. Include `GET /{strategy_id}/sources` with optional `source_type` and full-text `search` filters that first verifies the strategy belongs to `auth.org_id`; use asyncpg and the `SourceCreate`/`SourceUpdate`/`SourceOut` schemas.",
 "c662a084": "In `backend/app/models/schemas.py`, add an optional `sort_order: Optional[int]` field to the `StairUpdate` model so element reordering can be persisted via PUT.",
 "803660e1": "In `frontend/src/StairsApp.jsx`, implement `moveStair(id, dir)` (currently a stub that warns it's unimplemented): find the sibling list in `stairTree` that contains the stair, swap it with its up/down neighbor, renumber each sibling's `sort_order` to its index, PUT only the changed rows to `/api/v1/stairs/{id}`, then refetch the strategy tree into `setStairTree`.",
 "9039798e": "In `frontend/src/components/StaircaseView.jsx`, add type-based title styling and a not-started state: introduce a `typeTextStyle` map keyed by `element_type`, a `NotStartedBadge` component, apply the per-type style to the title span, and render the badge instead of `HealthBadge` when an element has no progress and is off_track or unset.",
 "378d4f6a": "In `backend/schema.sql`, add an `ai_usage_logs` table for multi-provider fallback monitoring (provider, success, response_time_ms, tokens_used, status_code, fallback_used, fallback_from, error_message, created_at) with indexes on created_at, provider, and a partial index where `fallback_used = TRUE`; renumber the section comments that follow.",
 "5447a103": "In `backend/app/routers/ai.py`, fix `ai_chat` source isolation: resolve `strategy_id` (from the request or the focused stair) BEFORE building the context, scope the `stairs` context query by `strategy_id` when present (falling back to org-only otherwise), and remove the now-duplicate later resolution block.",
 "64bf0115": "Create `backend/app/agents/base_agent.py` with a `BaseAgent` class that all specialized agents extend: class-level `name`/`role`, an overridable `_build_system_prompt(strategy_context)`, and an async `call(messages, strategy_context, max_tokens, task_type)` that routes through `call_ai_with_fallback`, injects Source-of-Truth context, and logs each call to the `agent_logs` table.",
 "a660e384": "In `frontend/src/components/ExecutionRoom.jsx`, add the Implementation Room panel rendered when `implRoomTaskId === t.id`: a bilingual header with a 'Source of Truth' badge when `implRoomData[t.id].sources_used` is non-empty, a bouncing-dots loading state, and—once `implRoomData[t.id]` is present—a step checklist wired to `toggleImplStep` with a progress bar.",
}

# Phase-2: (instruction, lang, filename in p2samples)
P2 = [
 ("Write `app/repositories/stair_repository.py`: an async `update_progress(stair_id, org_id, progress_percent, health, expected_updated_at)` that updates a stair under OPTIMISTIC CONCURRENCY (the UPDATE only matches when `updated_at` equals the value the caller last read), retries with bounded backoff on a lost race by re-reading `updated_at`, clamps percent to 0-100, scopes by `organization_id` and `deleted_at IS NULL`, and raises `LookupError`/`StaleStairError` appropriately.", "python", "stair_repository.py"),
 ("Write `app/routers/kpi_router.py`: a FastAPI router over `kpi_measurements` exposing `GET /{stair_id}` with stable KEYSET (cursor) pagination on `(measured_at, id)` newest-first, base64 cursor encode/decode, a `limit` capped at 100, an org-ownership check on the parent stair via `auth.org_id`, and a `{items, next_cursor, has_more}` response.", "python", "kpi_router.py"),
 ("Write `app/ai_gateway.py`: an async `TokenBucket` rate limiter (rate/sec + burst capacity, monotonic refill, asyncio lock) fronting a `call_with_fallback(payload, usage)` that tries Claude -> OpenAI -> Gemini via httpx, reads API keys only from env, records one `ai_usage_logs`-shaped entry per attempt (including `fallback_used`/`fallback_from`), and raises if none are configured or all fail.", "python", "ai_gateway.py"),
 ("Write `app/models/schemas_strict.py`: a strict Pydantic v2 `StairCreateStrict` mirroring the real `stairs` columns but enforcing domain rules — a closed `element_type` vocabulary and `measurement_direction` set via `field_validator`, percentages bounded 0-100, and a `model_validator` requiring a `target_value` for `key_result`/`kpi` and forbidding a parent on a `vision`.", "python", "schemas_strict.py"),
 ("Write `frontend/src/hooks/useStairProgress.jsx`: a React hook giving OPTIMISTIC progress updates for one stair — advance the UI immediately, PUT to `/api/v1/stairs/{id}` with an `AbortController` that cancels any in-flight request when a newer one starts, roll back to the last server-confirmed value on error, and expose `{progress, saving, error, commit}`.", "jsx", "useStairProgress.jsx"),
]

def fence(lang, body):
    return f"```{lang}\n{body.rstrip()}\n```"

pairs = []  # (origin, canonical)
for cid, instr in P1.items():
    c = CAND[cid]
    pairs.append(("P1:" + cid, S.make_canonical(instr, fence("diff", c["diff"]))))
for instr, lang, fn in P2:
    body = open(os.path.join(HERE, "..", "scratch", "p2samples", fn)).read()
    pairs.append(("P2:" + fn, S.make_canonical(instr, fence(lang, body))))

# Build both schemas, validate, token-count
report = {"anthropic": [], "axolotl": []}
toks = []
for schema in ("anthropic", "axolotl"):
    recs = []
    for origin, canon in pairs:
        rec = S.WRAPPERS[schema](canon)
        probs = S.validate_record(rec, schema)
        n = T.count_tokens_record(rec)
        report[schema].append((origin, probs, n))
        recs.append(rec)
        if schema == "anthropic":
            toks.append(n)
    S.write_jsonl(os.path.join(HERE, "..", "scratch", f"gate_{schema}.jsonl"), recs)

print("=== GATE VALIDATION (both schemas) ===")
for schema in ("anthropic", "axolotl"):
    bad = [(o, p) for o, p, _ in report[schema] if p]
    print(f"  {schema}: {len(report[schema])} records, {len(bad)} invalid")
    for o, p in bad:
        print("     INVALID", o, p)
print(f"\n=== TOKENS ({T.TOKENIZER_LABEL}) ===")
toks.sort()
print(f"  min={toks[0]}  median={toks[len(toks)//2]}  max={toks[-1]}  (cap=16384)")
print(f"  all under cap: {all(t <= 16384 for t in toks)}")
print("\n=== PER-RECORD ===")
for o, p, n in report["anthropic"]:
    print(f"  {n:6d} tok  {'OK ' if not p else 'BAD'}  {o}")
