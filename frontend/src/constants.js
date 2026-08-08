// Build-time, so a deployment can be pointed at a different backend without a
// code change. The default is the current production API, so nothing moves
// today — but preview deployments are no longer nailed to production data, and
// can be repointed at a staging backend as soon as one exists.
export const API = import.meta.env.VITE_API_URL || "https://stairs-production.up.railway.app";

export const GOLD = "#B8904A";
export const GOLD_L = "#e8b94a";
export const TEAL = "#2A5C5C";
export const CHAMPAGNE = "#F7E7CE";
export const DEEP = "#0a1628";
export const BORDER = "rgba(30, 58, 95, 0.5)";

// The two type stacks, in one place. Each names its metric-matched fallback
// (declared in fonts.css) so the frame before the webfont lands occupies the
// same space as the real face and nothing reflows. The Arabic stack keeps
// DM Sans behind Noto Kufi Arabic, because Noto Kufi ships only the Arabic
// subset — Latin inside an Arabic screen (element codes, numerals, product
// names) stays in the UI face instead of dropping to a generic sans.
export const FONT_UI = "'DM Sans', 'DM Sans Fallback', system-ui, -apple-system, sans-serif";
export const FONT_UI_AR = "'Noto Kufi Arabic', 'DM Sans', 'DM Sans Fallback', system-ui, sans-serif";
export const FONT_DISPLAY = "'Instrument Serif', 'Instrument Serif Fallback', Georgia, serif";
export const fontStack = (isAr) => (isAr ? FONT_UI_AR : FONT_UI);

export const typeColors = { vision: GOLD, objective: "#60a5fa", key_result: "#34d399", initiative: "#a78bfa", task: "#94a3b8", perspective: "#f472b6", strategic_objective: "#38bdf8", measure: "#fb923c", kpi: "#22d3ee", goal: "#a3e635", strategy: GOLD };
export const typeIcons = { vision: "◆", objective: "▣", key_result: "◎", initiative: "▶", task: "•", perspective: "◈", strategic_objective: "▢", measure: "◉", kpi: "◎", goal: "▣", strategy: "◆" };
export const typeLabels = { vision: "Vision", objective: "Objective", key_result: "Key Result", initiative: "Initiative", task: "Task" };
export const typeLabelsAr = { vision: "الرؤية", objective: "الهدف", key_result: "نتيجة رئيسية", initiative: "مبادرة", task: "مهمة" };
export const glass = (op = 0.6) => ({ background: `rgba(22, 37, 68, ${op})`, border: `1px solid ${BORDER}` });
export const inputCls = "w-full px-4 py-3.5 rounded-xl bg-[#0a1628]/85 border border-[#1e3a5f] text-white text-[15px] placeholder-gray-600 focus:border-amber-500/45 focus:ring-2 focus:ring-amber-500/10 focus:outline-none transition";
export const labelCls = "text-gray-400 text-[11px] uppercase tracking-[0.12em] mb-2 block font-medium";
