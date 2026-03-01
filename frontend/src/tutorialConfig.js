// ═══ TUTORIAL CONFIGURATION ═══
// Single source of truth for all tutorial steps.
// To add a new step: append an entry with { id, title, description, selector, icon }.
// Bump TUTORIAL_VERSION when adding steps so returning users get notified.

export const TUTORIAL_VERSION = 3;

export const TUTORIAL_STORAGE_KEY = "stairs_tutorial";

export const tutorialSteps = [
  {
    id: "welcome",
    title: "Welcome to Stairs",
    description: "This is your strategic planning platform — where big ideas become actionable steps. Let's walk through how to climb your strategy, one stair at a time.",
    selector: null, // Full-screen welcome — no element highlight
    icon: "🏗️",
    featureKey: null,
  },
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Your executive overview — see overall progress, health status, top risks, and strategy tool results at a glance. Export the dashboard snapshot anytime.",
    selector: "[data-tutorial='nav-dashboard']",
    icon: "📊",
    featureKey: "dashboard",
  },
  {
    id: "staircase",
    title: "Staircase",
    description: "Your strategy visualized as steps — from vision at the top to tasks at the bottom. Each stair represents a level of your plan, connected and trackable.",
    selector: "[data-tutorial='nav-staircase']",
    icon: "🪜",
    featureKey: "staircase",
  },
  {
    id: "ai_advisor",
    title: "AI Advisor",
    description: "Your strategic advisor is always available. Ask questions, use quick-action chips for instant insights, brainstorm ideas, or get analysis — with full conversation history saved.",
    selector: "[data-tutorial='nav-ai']",
    icon: "🤖",
    featureKey: "ai_chat",
  },
  {
    id: "strategy_tools",
    title: "Strategy Tools",
    description: "Five interactive strategy matrices — IFE, EFE, SPACE, BCG, and Porter's Five Forces. Auto-populated from your data with quick-action chips for analysis, comparison, and export.",
    selector: "[data-tutorial='nav-tools']",
    icon: "🔧",
    featureKey: "strategy_tools",
  },
  {
    id: "action_plans",
    title: "Action Plans",
    description: "All your action plans in one place — organized by stair element. Track recommended vs. customized plans, monitor progress, and export anytime.",
    selector: "[data-tutorial='nav-actionplans']",
    icon: "📋",
    featureKey: "action_plans",
  },
  {
    id: "execution_room",
    title: "Execution Room",
    description: "The complete execution pipeline: AI explains strategic context, assesses what's achievable, generates a customized plan, and guides you through step-by-step implementation.",
    selector: "[data-tutorial='execution-room']",
    icon: "⚡",
    featureKey: "execution_room",
  },
  {
    id: "manifest_room",
    title: "Manifest Room",
    description: "Your organized, exportable view of all implementation threads. Track progress across explain, assess, plan, and implement sections — export single manifests or all at once.",
    selector: "[data-tutorial='nav-manifest']",
    icon: "📦",
    featureKey: "manifest_room",
  },
  {
    id: "source_of_truth",
    title: "Source of Truth",
    description: "Upload documents — pitch decks, business plans, research. AI extracts insights that feed into your strategy, frameworks, and advisor. Every insight is traced back to its source.",
    selector: "[data-tutorial='nav-sources']",
    icon: "🔍",
    featureKey: "source_of_truth",
  },
  {
    id: "data_health",
    title: "Data Health",
    description: "Your strategy's data integrity dashboard. Monitor source quality, resolve conflicts, and quarantine questionable data. The AI agents weight their recommendations based on your data's confidence scores.",
    selector: "[data-tutorial='nav-data-health']",
    icon: "🛡️",
    featureKey: "data_health",
  },
  {
    id: "knowledge",
    title: "Knowledge",
    description: "Curated library of strategy frameworks, books, failure patterns, and measurement tools. Research-backed resources to inform your strategic decisions.",
    selector: "[data-tutorial='nav-knowledge']",
    icon: "📖",
    featureKey: "knowledge",
  },
  {
    id: "notes",
    title: "Notes",
    description: "Save important AI responses, jot down ideas, or pin key insights. Your notes are searchable, exportable, and always at hand.",
    selector: "[data-tutorial='nav-notes']",
    icon: "📝",
    featureKey: "notes",
  },
  {
    id: "alerts",
    title: "Alerts",
    description: "Real-time strategy health monitoring. Get notified when elements go off-track with severity-coded alerts — critical, high, medium, and informational.",
    selector: "[data-tutorial='nav-alerts']",
    icon: "🔔",
    featureKey: "alerts",
  },
  {
    id: "export",
    title: "Export",
    description: "Download your strategy, action plans, manifests, and more as formatted PDFs. Share with stakeholders, print for meetings, or archive for reference.",
    selector: "[data-tutorial='export-btn']",
    icon: "📄",
    featureKey: "export",
  },
];

// ═══ TUTORIAL STATE HELPERS ═══

export function getTutorialState() {
  try {
    const raw = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveTutorialState(state) {
  localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(state));
}

export function getDefaultTutorialState() {
  return {
    completedVersion: 0,
    completedStepIds: [],
    featuresUsed: [],
    dismissed: false,
  };
}

export function shouldShowTutorial() {
  const state = getTutorialState();
  if (!state) return true; // First-time user
  if (state.completedVersion < TUTORIAL_VERSION) return false; // Will be handled by "new features" prompt
  return false;
}

export function hasNewTutorialSteps() {
  const state = getTutorialState();
  if (!state) return false;
  if (state.completedVersion > 0 && state.completedVersion < TUTORIAL_VERSION) return true;
  return false;
}

export function getNewSteps() {
  const state = getTutorialState();
  if (!state || !state.completedStepIds) return tutorialSteps;
  return tutorialSteps.filter(s => !state.completedStepIds.includes(s.id));
}

export function markFeatureUsed(featureKey) {
  const state = getTutorialState() || getDefaultTutorialState();
  if (featureKey && !state.featuresUsed.includes(featureKey)) {
    state.featuresUsed = [...state.featuresUsed, featureKey];
    saveTutorialState(state);
  }
  return state;
}
