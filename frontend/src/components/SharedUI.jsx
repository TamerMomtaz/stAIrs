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
