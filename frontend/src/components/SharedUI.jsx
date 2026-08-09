import { useState } from "react";
import { BAD, GOLD, MODAL_SURFACE, OK, SHADOW_LG, SUNKEN, WARN, tint } from "../constants";
import { canSeeAgentTelemetry } from "../api";

// ═══ HEALTH BADGE ═══
// Four things at once: a pale tint, a darker ink, an ICON and a WORD.
//
// The icon is not decoration. Amber is 1.73:1 as a mark on the light page,
// so a badge that leaned on hue would be invisible in greyscale, on a
// projector in a bright room, and to a colourblind reader. The shape has to
// carry the state on its own — which is why on_track and at_risk no longer
// share the same glyph, as they did when both were "●" and only the colour
// told them apart.
const HEALTH_MARK = {
  on_track: (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 6.3 4.6 9 10 3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  at_risk: (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 1.5 11 10.5H1z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6 5v2.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="6" cy="9" r=".7" fill="currentColor" />
    </svg>
  ),
  off_track: (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.2 7.8 7.8 4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  achieved: (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 1.4l1.5 3.1 3.4.5-2.5 2.4.6 3.4L6 9.2 3 10.8l.6-3.4-2.5-2.4 3.4-.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  ),
};

/* compactBelowSm drops the words on a narrow bar and keeps the mark, so a
   header that must also carry a title and a breadcrumb isn't spending 90px on
   a word the colour already says. Opt-in: every existing caller renders
   byte-identically, and the label stays in the accessibility tree either way. */
export const HealthBadge = ({ health, size = "sm", compactBelowSm = false }) => {
  const c = { on_track: "bg-ok-fill text-ok-ink border-ok-line", at_risk: "bg-warn-fill text-warn-ink border-warn-line", off_track: "bg-bad-fill text-bad-ink border-bad-line", achieved: "bg-info-fill text-info-ink border-info-line" };
  const s = size === "sm" ? "text-[10px] px-2 py-0.5 gap-1" : "text-xs px-3 py-1 gap-1.5";
  const key = HEALTH_MARK[health] ? health : "at_risk";
  const label = health?.replace("_", " ").toUpperCase();
  return (
    <span className={`${s} inline-flex items-center rounded-full border font-medium whitespace-nowrap ${c[health] || c.at_risk}`}>
      {HEALTH_MARK[key]}
      {compactBelowSm ? <span className="sr-only sm:not-sr-only">{label}</span> : label}
    </span>
  );
};

// ═══ PROGRESS RING ═══
export const ProgressRing = ({ percent = 0, size = 80, stroke = 6, color }) => {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c - (percent / 100) * c;
  const col = color || (percent >= 70 ? OK : percent >= 40 ? WARN : BAD);
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={SUNKEN} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease" }} />
      <text x="50%" y="50%" textAnchor="middle" dy=".35em" fill={col} fontSize={size * 0.22} fontWeight="700" transform={`rotate(90 ${size/2} ${size/2})`}>{Math.round(percent)}%</text>
    </svg>
  );
};

// ═══ MODAL ═══
// size: "sm" (default) | "lg" | "full". `wide` is kept as an alias for "lg"
// so existing callers keep working unchanged.
const MODAL_SIZES = {
  sm: { shell: "p-6", panel: "relative z-10 w-full max-w-lg min-w-[340px] max-h-[88vh] rounded-2xl" },
  lg: { shell: "p-6", panel: "relative z-10 w-full max-w-4xl min-w-[340px] max-h-[88vh] rounded-2xl" },
  // Full bleed below md, a 2.5% margin from every edge above it.
  full: {
    shell: "p-0",
    panel:
      "fixed z-10 inset-0 rounded-none md:inset-[2.5%] md:rounded-2xl " +
      "w-auto h-auto max-w-none max-h-none",
  },
};

export const Modal = ({ open, onClose, title, children, wide, size, footer }) => {
  if (!open) return null;
  const key = MODAL_SIZES[size] ? size : wide ? "lg" : "sm";
  const s = MODAL_SIZES[key];
  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center ${s.shell}`} onClick={onClose}>
      <div className="absolute inset-0 bg-scrim backdrop-blur-sm" />
      <div className={`${s.panel} flex flex-col overflow-hidden`} data-modal-size={key}
        style={{ background: MODAL_SURFACE, border: `1px solid ${tint(GOLD, 20)}`, boxShadow: SHADOW_LG }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${tint(GOLD, 13)}` }}>
          <h2 className="text-ink font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink transition text-xl leading-none p-1">✕</button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex-shrink-0 px-6 py-4" style={{ borderTop: `1px solid ${tint(GOLD, 13)}` }}>{footer}</div>
        )}
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
    high: { bg: "bg-ok/15", text: "text-ok", border: "border-ok-line", icon: "\u2713", label: "High Confidence" },
    medium: { bg: "bg-warn/15", text: "text-warn", border: "border-warn-line", icon: "\u26A1", label: "Medium Confidence" },
    low: { bg: "bg-bad/15", text: "text-bad", border: "border-bad-line", icon: "\u26A0\uFE0F", label: "Low Confidence" },
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
        <div className="absolute z-50 bottom-full left-0 mb-2 w-64 p-3 rounded-lg border border-hairline-strong bg-dropdown backdrop-blur-sm shadow-xl text-xs" data-testid="confidence-tooltip">
          <div className="flex items-center justify-between mb-2">
            <span className={`font-semibold ${s.text}`}>{s.icon} {s.label} ({score}%)</span>
            <button onClick={() => setShowTooltip(false)} className="text-ink-muted hover:text-ink text-xs">\u2715</button>
          </div>
          {canSeeAgentTelemetry() && agentsUsed && agentsUsed.length > 0 && (
            <div className="mb-2">
              <div className="text-ink-muted uppercase tracking-wider text-[9px] mb-1">Agents involved</div>
              {agentsUsed.map((a, i) => (
                <div key={i} className="text-ink-2 flex items-center gap-1.5 py-0.5">
                  <span className="text-warn/70">\u2022</span> {a.name}{a.role && <span className="text-ink-faint text-[9px]"> \u2014 {a.role}</span>}
                </div>
              ))}
            </div>
          )}
          {validation.warnings && validation.warnings.length > 0 && (
            <div className="mb-2">
              <div className="text-ink-muted uppercase tracking-wider text-[9px] mb-1">Validation warnings</div>
              {validation.warnings.slice(0, 3).map((w, i) => (
                <div key={i} className="text-warn-ink/80 py-0.5">\u26A0\uFE0F {w}</div>
              ))}
            </div>
          )}
          {validation.contradictions && validation.contradictions.length > 0 && (
            <div>
              <div className="text-ink-muted uppercase tracking-wider text-[9px] mb-1">Contradictions found</div>
              {validation.contradictions.slice(0, 3).map((c, i) => (
                <div key={i} className="text-bad-ink/80 py-0.5">\u2716 {c}</div>
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
    <div className="mt-2 rounded-lg border border-warn/20 bg-warn/5" data-testid="validation-warnings">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-warn/90 hover:text-warn-ink transition"
      >
        <span>\u26A0\uFE0F Validation Notes ({total} item{total !== 1 ? "s" : ""})</span>
        <span className="text-[9px]">{expanded ? "\u25B2" : "\u25BC"}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          {warnings.map((w, i) => (
            <div key={`w-${i}`} className="text-[11px] text-warn-ink/80 flex items-start gap-1.5">
              <span className="shrink-0 mt-0.5">\u26A0\uFE0F</span><span>{w}</span>
            </div>
          ))}
          {contradictions.map((c, i) => (
            <div key={`c-${i}`} className="text-[11px] text-bad-ink/80 flex items-start gap-1.5">
              <span className="shrink-0 mt-0.5">\u2716</span><span>{c}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ═══ AGENT ACTIVITY INDICATOR ═══
// Two vocabularies for the same three beats of work. Clients get what is
// happening to their strategy; admins get which agent is doing it, because
// that is the version worth reading when something is stuck.
const AGENT_STEPS = [
  { key: "document", icon: "\uD83D\uDCC4", label: "Reading your sources..." },
  { key: "strategy", icon: "\uD83D\uDCCA", label: "Working through your strategy..." },
  { key: "validation", icon: "\u26A0\uFE0F", label: "Checking the answer..." },
];

const AGENT_STEPS_ADMIN = [
  { key: "document", icon: "\uD83D\uDCC4", label: "Document Analyst working..." },
  { key: "strategy", icon: "\uD83D\uDCCA", label: "Strategy Analyst analyzing..." },
  { key: "validation", icon: "\u26A0\uFE0F", label: "Validation Agent reviewing..." },
];

export const AgentActivityIndicator = ({ agentStep }) => {
  const steps = canSeeAgentTelemetry() ? AGENT_STEPS_ADMIN : AGENT_STEPS;
  const step = steps[agentStep % steps.length] || steps[0];
  return (
    <div className="flex items-center gap-2 px-4 py-2" data-testid="agent-activity-indicator">
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-warn/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
      <span className="text-xs text-warn/80">{step.icon} {step.label}</span>
    </div>
  );
};
