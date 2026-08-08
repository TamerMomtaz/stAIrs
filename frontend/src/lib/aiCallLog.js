/**
 * Outbound AI call instrumentation.
 *
 * Every call to api.aiPost passes a `trigger` — a short label naming what made
 * it fire ("execroom:generate-action-plan", "wizard:generate-questionnaire"). Each call is
 * counted and logged so a manual walk through the app can be checked against
 * what the client actually asked for.
 *
 * In the browser console:
 *   __aiCalls.summary()   → { total, byTrigger }
 *   __aiCalls.list()      → every call with its trigger and timestamp
 *   __aiCalls.reset()     → zero the counters before a manual pass
 */

const calls = [];

export function recordAiCall(trigger, path) {
  const entry = {
    trigger: trigger || "unlabelled",
    path,
    at: new Date().toISOString(),
  };
  calls.push(entry);
  // Deliberately console.info, not debug: an unexplained AI call is something
  // the person walking the app should see without opening a filter.
  console.info(`[ai-call #${calls.length}] trigger=${entry.trigger} path=${path}`);
  return entry;
}

export function aiCallCount() {
  return calls.length;
}

export function aiCallSummary() {
  const byTrigger = {};
  for (const c of calls) byTrigger[c.trigger] = (byTrigger[c.trigger] || 0) + 1;
  return { total: calls.length, byTrigger };
}

export function aiCallList() {
  return calls.slice();
}

export function resetAiCalls() {
  calls.length = 0;
}

if (typeof window !== "undefined") {
  window.__aiCalls = {
    summary: aiCallSummary,
    list: aiCallList,
    count: aiCallCount,
    reset: resetAiCalls,
  };
}
