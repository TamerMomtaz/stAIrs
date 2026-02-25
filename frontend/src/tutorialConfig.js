// ═══ TUTORIAL CONFIGURATION ═══
// Single source of truth for all tutorial steps.
// To add a new step: append an entry with { id, title, description, selector, icon }.
// Bump TUTORIAL_VERSION when adding steps so returning users get notified.

export const TUTORIAL_VERSION = 1;

export const TUTORIAL_STORAGE_KEY = "stairs_tutorial";

export const tutorialSteps = [
  {
    id: "welcome",
    title: "Welcome to ST.AIRS",
    description: "This is your strategic planning platform — where big ideas become actionable steps. Let's walk through how to climb your strategy, one stair at a time.",
    selector: null, // Full-screen welcome — no element highlight
    icon: "🏗️",
    featureKey: null,
  },
  {
    id: "company_brief",
    title: "Company Brief",
    description: "Start by describing your company — industry, size, goals. This context helps ST.AIRS tailor everything to your specific situation.",
    selector: "[data-tutorial='strategy-landing']",
    icon: "🏢",
    featureKey: "strategy_landing",
  },
  {
    id: "strategy_selection",
    title: "Strategy Selection",
    description: "Choose your strategy type and framework. Whether it's OKR, BSC, or a custom approach — this sets the foundation for your strategic staircase.",
    selector: "[data-tutorial='strategy-wizard']",
    icon: "🎯",
    featureKey: "strategy_wizard",
  },
  {
    id: "ai_questionnaire",
    title: "AI Questionnaire",
    description: "Answer tailored questions that make your strategy accurate. The AI adapts follow-up questions based on your responses to build a complete picture.",
    selector: "[data-tutorial='questionnaire']",
    icon: "💬",
    featureKey: "questionnaire",
  },
  {
    id: "the_staircase",
    title: "The Staircase",
    description: "Your strategy visualized as steps — from vision at the top to tasks at the bottom. Each stair represents a level of your plan, connected and trackable.",
    selector: "[data-tutorial='nav-staircase']",
    icon: "🪜",
    featureKey: "staircase",
  },
  {
    id: "explain_enhance",
    title: "Explain & Enhance",
    description: "Select any stair element and let AI explain its strategic importance or suggest enhancements. Understand the 'why' behind every step.",
    selector: "[data-tutorial='staircase-actions']",
    icon: "✨",
    featureKey: "explain_enhance",
  },
  {
    id: "execution_room",
    title: "Execution Room",
    description: "Turn strategy into action. The Execution Room generates tasks, solutions, and lets you chat about implementation details for any stair element.",
    selector: "[data-tutorial='execution-room']",
    icon: "⚡",
    featureKey: "execution_room",
  },
  {
    id: "how_far",
    title: "How Far Can I Do This",
    description: "The feedback loop for realistic planning. Assess what's achievable given your constraints and get AI-powered recommendations for adjustments.",
    selector: "[data-tutorial='how-far']",
    icon: "📏",
    featureKey: "how_far",
  },
  {
    id: "custom_action_plan",
    title: "Customized Action Plan",
    description: "Your tailored plan based on real constraints. After the feedback loop, get a customized set of actions that fits your actual capacity and resources.",
    selector: "[data-tutorial='custom-plan']",
    icon: "📐",
    featureKey: "custom_action_plan",
  },
  {
    id: "action_plans_tab",
    title: "Action Plans Tab",
    description: "All your action plans in one place — organized by stair element. Track recommended vs. customized plans, monitor progress, and export anytime.",
    selector: "[data-tutorial='nav-actionplans']",
    icon: "📋",
    featureKey: "action_plans",
  },
  {
    id: "export",
    title: "Export",
    description: "Download your strategy and action plans as formatted PDFs. Share with stakeholders, print for meetings, or archive for reference.",
    selector: "[data-tutorial='export-btn']",
    icon: "📄",
    featureKey: "export",
  },
  {
    id: "ai_chat",
    title: "AI Chat Advisor",
    description: "Your strategic advisor is always available. Ask questions, brainstorm ideas, or get analysis — with full conversation history saved.",
    selector: "[data-tutorial='nav-ai']",
    icon: "🤖",
    featureKey: "ai_chat",
  },
  {
    id: "notes",
    title: "Notes",
    description: "Save important AI responses, jot down ideas, or pin key insights. Your notes are searchable, exportable, and always at hand.",
    selector: "[data-tutorial='nav-notes']",
    icon: "📝",
    featureKey: "notes",
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
