import { useState, useEffect, useRef, useCallback } from "react";
import { GOLD, GOLD_L, DEEP } from "../constants";
import { GUIDANCE, GUIDANCE_SEEN_KEY } from "../guidanceConfig";

const AUTO_DISMISS_MS = 8000;

const loadSeen = () => {
  try { return new Set(JSON.parse(localStorage.getItem(GUIDANCE_SEEN_KEY) || "[]")); }
  catch { return new Set(); }
};
const persistSeen = (set) => {
  try { localStorage.setItem(GUIDANCE_SEEN_KEY, JSON.stringify([...set])); } catch {}
};

const GuidanceToast = ({ entry, onAction, onClose }) => {
  const [shown, setShown] = useState(false);
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef(null);
  const def = GUIDANCE[entry.id];
  const { params } = entry;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (hovered) { clearTimeout(timerRef.current); return; }
    timerRef.current = setTimeout(() => onClose(), AUTO_DISMISS_MS);
    return () => clearTimeout(timerRef.current);
  }, [hovered, onClose]);

  if (!def) return null;
  const actions = def.actions(params) || [];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        maxWidth: 400,
        width: "calc(100vw - 3rem)",
        zIndex: 70,
        background: "rgba(10, 22, 40, 0.95)",
        borderLeft: `4px solid ${GOLD}`,
        border: `1px solid rgba(184, 144, 74, 0.35)`,
        borderLeftWidth: 4,
        borderRadius: 14,
        backdropFilter: "blur(20px)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
        padding: "16px 18px",
        transform: shown ? "translateX(0)" : "translateX(120%)",
        opacity: shown ? 1 : 0,
        transition: "transform 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.4s ease",
      }}
    >
      <div className="flex items-start gap-3">
        <span style={{ fontSize: 20, lineHeight: 1 }}>{def.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-bold text-white">{def.title(params)}</div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white transition text-sm leading-none -mt-0.5"
              aria-label="Dismiss"
            >✕</button>
          </div>
          <div className="text-xs text-gray-300 mt-1.5 leading-relaxed whitespace-pre-line">
            {def.body(params)}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {actions.map((a, i) => (
              <button
                key={i}
                onClick={() => onAction(a)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition hover:scale-[1.03]"
                style={a.primary ? {
                  background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`,
                  color: DEEP,
                } : {
                  background: "rgba(255,255,255,0.04)",
                  color: "#94a3b8",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >{a.label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Listens for window "stairs-guidance" events, queues them, and shows one
// toast at a time. Persists "once" guidance so it never repeats.
export const GuidanceManager = ({ suppressed, onView, onExec, onMatrix }) => {
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const seenRef = useRef(loadSeen());

  useEffect(() => {
    const handler = (e) => {
      const { id, params } = e.detail || {};
      const def = GUIDANCE[id];
      if (!def) return;
      if (def.mode === "once") {
        if (seenRef.current.has(id)) return;
        setQueue((q) => (q.some((x) => x.id === id) ? q : [...q, { id, params: params || {} }]));
      } else {
        setQueue((q) => [...q, { id, params: params || {} }]);
      }
    };
    window.addEventListener("stairs-guidance", handler);
    return () => window.removeEventListener("stairs-guidance", handler);
  }, []);

  useEffect(() => {
    if (current || suppressed || queue.length === 0) return;
    const [next, ...rest] = queue;
    const def = GUIDANCE[next.id];
    // Re-check seen at display time (it may have been queued before suppression).
    if (def.mode === "once" && seenRef.current.has(next.id)) { setQueue(rest); return; }
    if (def.mode === "once") {
      seenRef.current.add(next.id);
      persistSeen(seenRef.current);
    }
    setCurrent(next);
    setQueue(rest);
  }, [queue, current, suppressed]);

  const close = useCallback(() => setCurrent(null), []);

  const handleAction = useCallback((a) => {
    if (a.view && onView) onView(a.view);
    else if (a.exec && onExec && current?.params?.stair) onExec(current.params.stair);
    else if (a.matrix && onMatrix) onMatrix(a.matrix);
    setCurrent(null);
  }, [current, onView, onExec, onMatrix]);

  if (!current) return null;
  return <GuidanceToast entry={current} onAction={handleAction} onClose={close} />;
};
