import { useState } from "react";
import { GOLD, BORDER } from "../constants";

// ═══ HEALTH BADGE ═══
export const HealthBadge = ({ health, size = "sm" }) => {
  const c = { on_track: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", at_risk: "bg-amber-500/20 text-amber-300 border-amber-500/30", off_track: "bg-red-500/20 text-red-300 border-red-500/30", achieved: "bg-blue-500/20 text-blue-300 border-blue-500/30" };
  const d = { on_track: "●", at_risk: "●", off_track: "○", achieved: "★" };
  const s = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-3 py-1";
  return <span className={`${s} rounded-full border font-medium whitespace-nowrap ${c[health] || c.at_risk}`}>{d[health] || "?"} {health?.replace("_", " ").toUpperCase()}</span>;
};

// ═══ PROGRESS RING ═══
export const ProgressRing = ({ percent = 0, size = 80, stroke = 6, color }) => {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c - (percent / 100) * c;
  const col = color || (percent >= 70 ? "#34d399" : percent >= 40 ? "#fbbf24" : "#f87171");
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e3a5f" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease" }} />
      <text x="50%" y="50%" textAnchor="middle" dy=".35em" fill={col} fontSize={size * 0.22} fontWeight="700" transform={`rotate(90 ${size/2} ${size/2})`}>{Math.round(percent)}%</text>
    </svg>
  );
};

// ═══ MODAL ═══
export const Modal = ({ open, onClose, title, children, wide }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className={`relative z-10 w-full ${wide ? "max-w-4xl" : "max-w-lg"} min-w-[340px] max-h-[88vh] flex flex-col rounded-2xl overflow-hidden`}
        style={{ background: "rgba(15, 25, 50, 0.97)", border: `1px solid ${GOLD}33`, boxShadow: "0 25px 50px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: `1px solid ${GOLD}22` }}>
          <h2 className="text-white font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition text-xl leading-none p-1">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
};

// ═══ CONFIDENCE BADGE ═══
export const ConfidenceBadge = ({ validation, agentsUsed }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  if (!validation || validation.confidence_score == null) return null;
  const score = validation.confidence_score;
  const level = score >= 85 ? "high" : score >= 60 ? "medium" : "low";
  const styles = {
    high: { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30", icon: "\u2713", label: "High Confidence" },
    medium: { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30", icon: "\u26A1", label: "Medium Confidence" },
    low: { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30", icon: "\u26A0\uFE0F", label: "Low Confidence" },
  };
  const s = styles[level];
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setShowTooltip(!showTooltip)}
        className={`${s.bg} ${s.text} ${s.border} border text-[10px] px-2 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80 transition`}
        data-testid="confidence-badge"
      >
        {s.icon} {s.label} ({score}%)
      </button>
      {showTooltip && (
        <div className="absolute z-50 bottom-full left-0 mb-2 w-64 p-3 rounded-lg border border-gray-600/50 bg-[#0f1f3a]/95 backdrop-blur-sm shadow-xl text-xs" data-testid="confidence-tooltip">
          <div className="flex items-center justify-between mb-2">
            <span className={`font-semibold ${s.text}`}>{s.icon} {s.label} ({score}%)</span>
            <button onClick={() => setShowTooltip(false)} className="text-gray-500 hover:text-white text-xs">\u2715</button>
          </div>
          {agentsUsed && agentsUsed.length > 0 && (
            <div className="mb-2">
              <div className="text-gray-500 uppercase tracking-wider text-[9px] mb-1">Agents involved</div>
              {agentsUsed.map((a, i) => (
                <div key={i} className="text-gray-300 flex items-center gap-1.5 py-0.5">
                  <span className="text-amber-400/70">\u2022</span> {a.name}{a.role && <span className="text-gray-600 text-[9px]"> \u2014 {a.role}</span>}
                </div>
              ))}
            </div>
          )}
          {validation.warnings && validation.warnings.length > 0 && (
            <div className="mb-2">
              <div className="text-gray-500 uppercase tracking-wider text-[9px] mb-1">Validation warnings</div>
              {validation.warnings.slice(0, 3).map((w, i) => (
                <div key={i} className="text-amber-300/80 py-0.5">\u26A0\uFE0F {w}</div>
              ))}
            </div>
          )}
          {validation.contradictions && validation.contradictions.length > 0 && (
            <div>
              <div className="text-gray-500 uppercase tracking-wider text-[9px] mb-1">Contradictions found</div>
              {validation.contradictions.slice(0, 3).map((c, i) => (
                <div key={i} className="text-red-300/80 py-0.5">\u2716 {c}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ═══ VALIDATION WARNINGS ═══
export const ValidationWarnings = ({ validation }) => {
  const [expanded, setExpanded] = useState(false);
  if (!validation) return null;
  const warnings = validation.warnings || [];
  const contradictions = validation.contradictions || [];
  const total = warnings.length + contradictions.length;
  if (total === 0) return null;
  return (
    <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5" data-testid="validation-warnings">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-amber-400/90 hover:text-amber-300 transition"
      >
        <span>\u26A0\uFE0F Validation Notes ({total} item{total !== 1 ? "s" : ""})</span>
        <span className="text-[9px]">{expanded ? "\u25B2" : "\u25BC"}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          {warnings.map((w, i) => (
            <div key={`w-${i}`} className="text-[11px] text-amber-300/80 flex items-start gap-1.5">
              <span className="shrink-0 mt-0.5">\u26A0\uFE0F</span><span>{w}</span>
            </div>
          ))}
          {contradictions.map((c, i) => (
            <div key={`c-${i}`} className="text-[11px] text-red-300/80 flex items-start gap-1.5">
              <span className="shrink-0 mt-0.5">\u2716</span><span>{c}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ═══ AGENT ACTIVITY INDICATOR ═══
const AGENT_STEPS = [
  { key: "document", icon: "\uD83D\uDCC4", label: "Document Analyst working..." },
  { key: "strategy", icon: "\uD83D\uDCCA", label: "Strategy Analyst analyzing..." },
  { key: "validation", icon: "\u26A0\uFE0F", label: "Validation Agent reviewing..." },
];

export const AgentActivityIndicator = ({ agentStep }) => {
  const step = AGENT_STEPS[agentStep % AGENT_STEPS.length] || AGENT_STEPS[0];
  return (
    <div className="flex items-center gap-2 px-4 py-2" data-testid="agent-activity-indicator">
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-amber-500/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
      <span className="text-xs text-amber-400/80">{step.icon} {step.label}</span>
    </div>
  );
};
