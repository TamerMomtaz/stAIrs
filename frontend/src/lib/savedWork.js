import { ArtifactsAPI, ActionPlansAPI, ARTIFACT } from "../api";

/* Where the work stands, per step.
   ─────────────────────────────────
   The Staircase row and the Execution Room picker both need to say how much
   work is banked against a step, so the arithmetic lives here once rather
   than in each of them.

   Two sources, because "work" means two different things:
     - action plans  → how many actions a step has at all
     - artifacts     → which of those actions someone has actually worked

   Artifact scope keys are "<stair id>:<task id>" for per-action work and a
   bare "<stair id>" for work saved against the step itself. */

const PER_ACTION = [ARTIFACT.EXPLAIN, ARTIFACT.ASSESS_CHAT, ARTIFACT.IMPL_GUIDE];

const newer = (a, b) => (!a ? b : !b ? a : (a > b ? a : b));

export async function loadSavedWork(strategyId) {
  const [artifacts, planGroups] = await Promise.all([
    ArtifactsAPI.forStrategy(strategyId),
    ActionPlansAPI.getForStrategy(strategyId),
  ]);

  // Explain/Enhance text saved against a step, and when it was saved — the
  // Staircase reads these back so an insight survives navigation.
  const results = {};
  const stamps = {};
  const workedTasksByStair = {};
  const lastWorkedByStair = {};

  for (const a of artifacts || []) {
    if (a.artifact_type === ARTIFACT.STAIR_EXPLAIN) {
      results[a.scope_key] = { ...(results[a.scope_key] || {}), explain: a.content };
      stamps[`explain:${a.scope_key}`] = a.generated_at;
      lastWorkedByStair[a.scope_key] = newer(lastWorkedByStair[a.scope_key], a.generated_at);
    } else if (a.artifact_type === ARTIFACT.STAIR_ENHANCE) {
      results[a.scope_key] = { ...(results[a.scope_key] || {}), enhance: a.content };
      stamps[`enhance:${a.scope_key}`] = a.generated_at;
      lastWorkedByStair[a.scope_key] = newer(lastWorkedByStair[a.scope_key], a.generated_at);
    }
    if (!PER_ACTION.includes(a.artifact_type)) continue;
    const sep = a.scope_key.indexOf(":");
    if (sep < 0) continue;
    const stairId = a.scope_key.slice(0, sep);
    (workedTasksByStair[stairId] ||= new Set()).add(a.scope_key.slice(sep + 1));
    lastWorkedByStair[stairId] = newer(lastWorkedByStair[stairId], a.generated_at);
  }

  const counts = {};
  for (const g of planGroups || []) {
    const id = String(g.stair_id);
    const taskIds = new Set();
    for (const p of g.plans || []) {
      (p.tasks || []).forEach((t, i) => taskIds.add(t.id || `task_${i}_${p.id}`));
    }
    const worked = workedTasksByStair[id] || new Set();
    // Only count work against tasks the current plan still has, so a
    // regenerated plan doesn't inflate the number with orphaned artifacts.
    const withWork = [...worked].filter(tid => taskIds.has(tid)).length;
    if (taskIds.size > 0) counts[id] = { total: taskIds.size, withWork, lastWorkedAt: lastWorkedByStair[id] || null };
  }

  // A step can carry an Explain or Enhance without ever having an action
  // plan. That is still work, and the picker should show it.
  for (const [id, when] of Object.entries(lastWorkedByStair)) {
    if (!counts[id]) counts[id] = { total: 0, withWork: 0, lastWorkedAt: when };
  }

  return { results, stamps, counts };
}

/** The step to offer as "continue where you left off", or null on a fresh strategy. */
export function mostRecentlyWorked(counts) {
  let best = null;
  for (const [id, c] of Object.entries(counts || {})) {
    if (!c.lastWorkedAt) continue;
    if (!best || c.lastWorkedAt > best.lastWorkedAt) best = { stairId: id, ...c };
  }
  return best;
}

/** Depth-first flatten of the stair tree, preserving staircase order. */
export function flattenTree(tree, depth = 0, out = []) {
  for (const node of tree || []) {
    out.push({ stair: node.stair, depth });
    if (node.children?.length) flattenTree(node.children, depth + 1, out);
  }
  return out;
}
