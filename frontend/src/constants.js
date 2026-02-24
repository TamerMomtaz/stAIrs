export const API = "https://stairs-production.up.railway.app";

export const GOLD = "#B8904A";
export const GOLD_L = "#e8b94a";
export const TEAL = "#2A5C5C";
export const CHAMPAGNE = "#F7E7CE";
export const DEEP = "#0a1628";
export const BORDER = "rgba(30, 58, 95, 0.5)";

export const typeColors = { vision: GOLD, objective: "#60a5fa", key_result: "#34d399", initiative: "#a78bfa", task: "#94a3b8", perspective: "#f472b6", strategic_objective: "#38bdf8", measure: "#fb923c", kpi: "#22d3ee", goal: "#a3e635", strategy: GOLD };
export const typeIcons = { vision: "◆", objective: "▣", key_result: "◎", initiative: "▶", task: "•", perspective: "◈", strategic_objective: "▢", measure: "◉", kpi: "◎", goal: "▣", strategy: "◆" };
export const typeLabels = { vision: "Vision", objective: "Objective", key_result: "Key Result", initiative: "Initiative", task: "Task" };
export const typeLabelsAr = { vision: "الرؤية", objective: "الهدف", key_result: "نتيجة رئيسية", initiative: "مبادرة", task: "مهمة" };
export const glass = (op = 0.6) => ({ background: `rgba(22, 37, 68, ${op})`, border: `1px solid ${BORDER}` });
export const inputCls = "w-full px-3 py-2.5 rounded-lg bg-[#0a1628]/80 border border-[#1e3a5f] text-white placeholder-gray-600 focus:border-amber-500/40 focus:outline-none transition text-sm";
export const labelCls = "text-gray-400 text-xs uppercase tracking-wider mb-1.5 block";
