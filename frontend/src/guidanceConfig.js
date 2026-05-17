// ═══ CONTEXTUAL GUIDANCE CONFIGURATION ═══
// Defines every guidance toast: copy, persistence mode, and action buttons.
// mode "once" → shown a single time ever (tracked in localStorage).
// mode "every" → shown every time the trigger fires.

export const GUIDANCE_SEEN_KEY = "stairs_guidance_seen";

// Action descriptors: { label, primary?, view?, exec?, matrix?, close? }
//  view  → navigate to a sidebar view key
//  exec  → open the Execution Room for params.stair
//  matrix→ open the matrix toolkit for the given key
//  close → dismiss only
export const GUIDANCE = {
  strategy_created: {
    mode: "every",
    icon: "✅",
    title: () => "Strategy Created!",
    body: (p) =>
      `"${p?.name || "Your strategy"}" is ready with ${p?.count ?? 0} element${p?.count === 1 ? "" : "s"}.\nGo to Staircase to explore your strategy tree and run AI analysis on each element.`,
    actions: () => [
      { label: "🪜 Go to Staircase", primary: true, view: "staircase" },
      { label: "Dismiss", close: true },
    ],
  },
  stair_expanded: {
    mode: "once",
    icon: "💡",
    title: () => "Element Expanded",
    body: (p) =>
      `You can now analyze "${p?.name || "this element"}" with AI.\nClick "💡 Explain" for AI analysis, or "✨ Enhance" for improvement suggestions. Save any insight to Notes with 📌.`,
    actions: () => [{ label: "Got it ✓", primary: true, close: true }],
  },
  ai_insight: {
    mode: "once",
    icon: "🧠",
    title: () => "AI Insight Ready",
    body: (p) =>
      `The AI has analyzed "${p?.name || "this element"}".\nSave this insight to Notes (📌) for your records, or open the Execution Room for a full action plan.`,
    actions: (p) => [
      { label: "📝 Go to Notes", primary: true, view: "notes" },
      ...(p?.stair ? [{ label: "📋 Open Execution Room", exec: true }] : []),
    ],
  },
  note_saved: {
    mode: "every",
    icon: "📌",
    title: () => "Saved to Notes!",
    body: () =>
      "Your insight has been saved.\nView all saved notes in the Notes tab. You can search, pin, edit, and export them.",
    actions: () => [
      { label: "📝 Go to Notes", primary: true, view: "notes" },
      { label: "Dismiss", close: true },
    ],
  },
  ai_chat_active: {
    mode: "once",
    icon: "🤖",
    title: () => "AI Advisor Active",
    body: () =>
      "The AI knows your strategy context and can reference 27 frameworks, 41 books, and 12 failure patterns.\nTry asking: \"What are the biggest risks?\" or \"Generate KRs for my top objective.\"",
    actions: () => [{ label: "Got it ✓", primary: true, close: true }],
  },
  execution_room: {
    mode: "once",
    icon: "🚀",
    title: () => "Execution Room",
    body: () =>
      "This is where strategy becomes action. The AI will generate a step-by-step implementation plan.\nWork through each tab: Action Plan → Solutions → Implementation Chat.",
    actions: () => [{ label: "Got it ✓", primary: true, close: true }],
  },
  action_plan_created: {
    mode: "every",
    icon: "📋",
    title: () => "Action Plan Generated!",
    body: (p) =>
      `Your plan for "${p?.name || "this element"}" is ready.\nView all plans in the Action Plans tab, or check the Manifest Room for implementation tracking.`,
    actions: () => [
      { label: "📋 Go to Action Plans", primary: true, view: "actionplans" },
      { label: "📦 Go to Manifest Room", view: "manifest" },
    ],
  },
  manifest_saved: {
    mode: "every",
    icon: "📦",
    title: () => "Manifest Saved!",
    body: () =>
      "Implementation details recorded.\nThe Manifest Room shows all manifests across your strategy with implementation step tracking.",
    actions: () => [
      { label: "📦 Go to Manifest Room", primary: true, view: "manifest" },
      { label: "Dismiss", close: true },
    ],
  },
  source_uploaded: {
    mode: "once",
    icon: "📄",
    title: () => "Document Uploaded!",
    body: () =>
      "Your source is pending AI analysis.\nClick \"Analyze\" to extract strategic insights, or let the AI verify it against existing data.",
    actions: () => [{ label: "Got it ✓", primary: true, close: true }],
  },
  matrix_complete: {
    mode: "every",
    icon: "🔧",
    title: () => "Matrix Complete!",
    body: (p) =>
      `Your ${p?.matrixName || "matrix"} results are saved.\nResults appear on your Dashboard.${p?.nextName ? ` Run the next matrix in the sequence: ${p.nextName}.` : ""}`,
    actions: (p) => [
      { label: "📊 Go to Dashboard", primary: true, view: "dashboard" },
      ...(p?.nextKey
        ? [{ label: `🔧 Run ${p.nextName}`, matrix: p.nextKey }]
        : [{ label: "Dismiss", close: true }]),
    ],
  },
  first_login: {
    mode: "once",
    icon: "👋",
    title: () => "Welcome to ST.AIRS!",
    body: () =>
      "This is your strategy command center.\nStart by creating your first strategy. The AI wizard will guide you through it.",
    actions: () => [{ label: "🚀 Create Strategy", primary: true, close: true }],
  },
  export_ready: {
    mode: "every",
    icon: "📄",
    title: () => "Export Ready!",
    body: () =>
      "Your report is in the print dialog.\nChoose \"Save as PDF\" in the printer dropdown. You can also export individual notes from the Notes tab.",
    actions: () => [{ label: "Got it ✓", primary: true, close: true }],
  },
};

// Fire a guidance toast from anywhere via a window CustomEvent.
export function fireGuidance(id, params = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("stairs-guidance", { detail: { id, params } }));
}
