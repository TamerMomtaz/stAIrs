"""
make_synth_assignments.py — Phase 2 cell assignments.

Builds a grid of synthetic *cells* across 24 families. Each cell pins a family,
a target language, an entity (for the 21 entity families) drawn from the real
Stairs schema, and a combination of structural axes so that cells within a
family differ materially. Generic-utility families (rate_limiter, retry_decorator,
pytest_logic) vary STRUCTURALLY only — they carry no entity fields.

One assignment file per family is written to ASSIGN_DIR; each is handed to one
subagent that authors {cell_id, instruction, file, lang, code} per cell.

Env (read only inside main so importing this module never writes files):
  ASSIGN_DIR    output dir (default: scratch/assignments)
  PER_FAMILY    cells per family (default: 38)

Determinism: seed 20240624.
"""

import json
import os
import random
from pathlib import Path

SEED = 20240624
DEFAULT_ASSIGN_DIR = ("/tmp/claude-0/-home-user-stAIrs/"
                      "060e05c5-6952-516a-93a1-569ab61deac7/scratchpad/assignments")

# ─── real Stairs entities (table + representative columns) ───
ENTITIES = [
    ("stairs", ["title", "element_type", "status", "health", "progress_percent",
                "priority", "owner_id", "organization_id"]),
    ("strategies", ["name", "framework", "status", "company", "industry",
                    "organization_id"]),
    ("ai_alerts", ["alert_type", "severity", "title", "status", "stair_id",
                   "organization_id"]),
    ("strategy_sources", ["source_type", "content", "strategy_id", "metadata"]),
    ("stair_progress", ["stair_id", "snapshot_date", "progress_percent",
                        "confidence_percent", "health"]),
    ("kpi_measurements", ["stair_id", "measured_at", "value", "source"]),
    ("stair_relationships", ["source_stair_id", "target_stair_id",
                             "relationship_type", "strength"]),
    ("teams", ["name", "organization_id", "parent_team_id"]),
    ("action_plans", ["stair_id", "plan_type", "raw_text", "tasks",
                      "organization_id"]),
    ("agent_logs", ["strategy_id", "agent_name", "task_type", "tokens_used",
                    "confidence_score"]),
    ("ai_usage_logs", ["provider", "success", "tokens_used", "fallback_used",
                       "status_code"]),
    ("ai_conversations", ["organization_id", "user_id", "context_stair_id",
                          "title"]),
    ("ai_messages", ["conversation_id", "role", "content", "tokens_used",
                     "model_used"]),
    ("ai_feedback", ["alert_id", "message_id", "rating", "feedback_type"]),
    ("notes", ["user_id", "organization_id", "title", "content", "pinned", "tags"]),
    ("integrations", ["organization_id", "provider", "status", "last_sync_at"]),
    ("frameworks", ["code", "name", "hierarchy_template", "is_active"]),
    ("team_members", ["team_id", "user_id", "role"]),
    ("activity_log", ["organization_id", "user_id", "entity_type", "entity_id",
                      "action", "changes"]),
    ("organizations", ["name", "slug", "subscription_tier", "industry"]),
    ("users", ["organization_id", "email", "full_name", "role", "language"]),
]

# Valid enum vocabularies from the real schema (subagents must stay inside these).
VOCAB = {
    "element_type": ["vision", "objective", "key_result", "initiative", "task",
                     "kpi", "perspective", "strategic_objective", "measure",
                     "goal", "strategy"],
    "health": ["on_track", "at_risk", "off_track", "achieved"],
    "stair_status": ["draft", "active", "paused", "completed", "cancelled"],
    "priority": ["critical", "high", "medium", "low"],
    "relationship_type": ["supports", "blocks", "depends_on", "aligns_with",
                          "contributes_to", "measures", "conflicts_with"],
    "alert_type": ["risk_detected", "milestone_at_risk", "pattern_identified",
                   "recommendation", "anomaly", "prediction"],
    "severity": ["critical", "high", "medium", "low", "info"],
    "alert_status": ["new", "acknowledged", "resolved", "dismissed"],
    "source_type": ["questionnaire", "ai_chat", "feedback", "manual_entry",
                    "document", "ai_extraction"],
    "provider": ["claude", "openai", "gemini"],
    "role": ["admin", "manager", "member", "viewer"],
    "activity_action": ["create", "update", "delete", "acknowledge", "restore"],
}

A = {
    "retry": ["exp_jitter", "fixed", "none"],
    "idempotency": ["key", "version", "none"],
    "validation": ["strict", "lenient"],
    "return_style": ["result", "throw"],
    "pagination": ["keyset", "offset"],
    "rate_limit": ["token_bucket", "sliding_window", "fixed_window"],
    "rls": ["role", "owner"],
    "observability": ["on", "off"],
    "sync": ["async", "sync"],
}

# family key, lang, generic?, the axes this family varies, one-line purpose
FAMILIES = [
    ("async_routes", "py", False, ["sync", "return_style", "pagination"],
     "async FastAPI APIRouter CRUD endpoints for the entity (Depends(get_auth), asyncpg pool, org-scoped, row_to_dict)"),
    ("sync_service_crud", "py", False, ["validation", "return_style", "idempotency"],
     "a synchronous service class wrapping CRUD for the entity over a db cursor"),
    ("aggregates", "py", False, ["sync", "observability", "pagination"],
     "an aggregate/rollup query function computing summary stats for the entity (counts by status/health, averages)"),
    ("pydantic_models", "py", False, ["validation", "idempotency", "return_style"],
     "Pydantic v2 request/response models for the entity (Field constraints, pattern enums, from_attributes)"),
    ("idempotency", "py", False, ["idempotency", "validation", "return_style"],
     "an idempotent create for the entity keyed by an idempotency key or row version"),
    ("pagination", "py", False, ["pagination", "sync", "return_style"],
     "a paginated list function for the entity (keyset or offset) returning items + a cursor/total"),
    ("webhook_hmac", "py", False, ["validation", "retry", "observability"],
     "a webhook receiver for an integration that verifies an HMAC-SHA256 signature before writing the entity"),
    ("background_workers", "py", False, ["retry", "observability", "sync"],
     "a background worker that periodically sweeps the entity (e.g. snapshot/expire/recompute)"),
    ("ai_provider_wrappers", "py", False, ["retry", "observability", "return_style"],
     "a provider-call wrapper that calls an AI provider and logs the interaction into ai_usage_logs (provider in {claude,openai,gemini})"),
    ("audit_hash_chain", "py", False, ["observability", "validation", "return_style"],
     "an append-only audit writer over activity_log that chains each row to the previous via a sha256 hash"),
    ("rbac_deps", "py", False, ["rls", "validation", "return_style"],
     "a FastAPI RBAC dependency: import get_current_user, read role from users, admin is always allowed, role/owner gate the entity"),
    ("sql_table", "sql", False, ["idempotency", "rls", "observability"],
     "a PostgreSQL CREATE TABLE migration for a new auxiliary table linked to the entity (FKs, defaults, CHECK enums)"),
    ("sql_rls", "sql", False, ["rls", "validation", "observability"],
     "PostgreSQL row-level-security policies on the entity table (role-based or owner-based), ENABLE RLS + CREATE POLICY"),
    ("sql_index", "sql", False, ["pagination", "observability", "validation"],
     "PostgreSQL index migrations for the entity supporting a documented query pattern (partial / GIN / composite)"),
    ("sql_view", "sql", False, ["pagination", "observability", "rls"],
     "a PostgreSQL VIEW joining the entity to related tables for a reporting read-model"),
    ("sql_trigger", "sql", False, ["observability", "validation", "idempotency"],
     "a PostgreSQL trigger + plpgsql function on the entity (e.g. maintain updated_at / denormalized counter / audit row)"),
    ("react_list", "jsx", False, ["pagination", "observability", "return_style"],
     "a React functional list component rendering the entity (fetch via api.get, loading/empty states, map with keys)"),
    ("react_form", "jsx", False, ["validation", "return_style", "observability"],
     "a React functional form component to create the entity (controlled inputs, validation, api.post submit)"),
    ("react_hook", "jsx", False, ["return_style", "retry", "pagination"],
     "a React custom hook that loads the entity (useState/useEffect, loading/error, refetch)"),
    ("react_dashboard", "jsx", False, ["observability", "pagination", "validation"],
     "a React dashboard widget summarizing the entity (derived counts, small cards, no chart libs)"),
    ("pytest_service", "py", False, ["validation", "return_style", "idempotency"],
     "a pytest module testing a small pure helper derived from the entity's rules (health/priority/status logic), no DB"),
    # generic-utility (no entity fields)
    ("rate_limiter", "py", True, ["rate_limit", "sync", "observability"],
     "a generic in-memory rate limiter (token bucket / sliding window / fixed window), no entity fields"),
    ("retry_decorator", "py", True, ["retry", "return_style", "sync"],
     "a generic retry decorator (exponential-jitter / fixed / none backoff), no entity fields"),
    ("pytest_logic", "py", True, ["validation", "return_style", "retry"],
     "a pytest module for a generic pure utility (parsing, backoff math, chunking), no entity fields"),
]

EXT = {"py": "py", "sql": "sql", "jsx": "jsx"}


def pick(axis, salt):
    pool = A[axis]
    return pool[salt % len(pool)]


def file_for(fam, lang, entity, idx):
    if lang == "sql":
        return f"backend/migrations/{fam}_{entity}_{idx:02d}.sql"
    if lang == "jsx":
        comp = "".join(p.capitalize() for p in entity.split("_"))
        suffix = {"react_list": "List", "react_form": "Form",
                  "react_hook": "Hook", "react_dashboard": "Dashboard"}.get(fam, "View")
        if fam == "react_hook":
            return f"frontend/src/hooks/use{comp}{idx:02d}.jsx"
        return f"frontend/src/components/{comp}{suffix}{idx:02d}.jsx"
    # py
    if fam in ("rate_limiter", "retry_decorator", "pytest_logic"):
        base = {"rate_limiter": "ratelimit", "retry_decorator": "retry",
                "pytest_logic": "test_util"}[fam]
        return f"backend/app/util/{base}_{idx:02d}.py"
    if fam == "pytest_service":
        return f"backend/tests/test_{entity}_{idx:02d}.py"
    sub = "services" if fam == "sync_service_crud" else "routers"
    return f"backend/app/{sub}/{entity}_{fam}_{idx:02d}.py"


def build(per_family):
    rng = random.Random(SEED)
    families = {}
    for fi, (fam, lang, generic, axes, purpose) in enumerate(FAMILIES):
        cells = []
        for ci in range(per_family):
            entity, fields = ("", []) if generic else ENTITIES[(fi + ci) % len(ENTITIES)]
            realized = {ax: pick(ax, fi * 7 + ci * 3 + i) for i, ax in enumerate(axes)}
            cell = {
                "cell_id": f"{fam}_{ci:02d}",
                "family": fam, "lang": lang, "is_generic": generic,
                "purpose": purpose,
                "entity": entity, "entity_fields": fields,
                "axes": realized,
                "file": file_for(fam, lang, entity or "util", ci),
            }
            cells.append(cell)
        families[fam] = {
            "family": fam, "lang": lang, "is_generic": generic,
            "purpose": purpose, "varies_axes": axes,
            "count": len(cells), "cells": cells,
        }
    return families


def main():
    assign_dir = Path(os.environ.get("ASSIGN_DIR", DEFAULT_ASSIGN_DIR))
    per_family = int(os.environ.get("PER_FAMILY", "38"))
    assign_dir.mkdir(parents=True, exist_ok=True)
    families = build(per_family)
    total = 0
    for n, (fam, data) in enumerate(families.items(), 1):
        data["vocab"] = VOCAB
        (assign_dir / f"assign_{n:02d}_{fam}.json").write_text(
            json.dumps(data, ensure_ascii=True, indent=1))
        total += data["count"]
    summary = {"families": len(families), "per_family": per_family,
               "total_cells": total, "entity_families": sum(
                   1 for d in families.values() if not d["is_generic"]),
               "generic_families": sum(1 for d in families.values() if d["is_generic"]),
               "dir": str(assign_dir)}
    (assign_dir / "_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
