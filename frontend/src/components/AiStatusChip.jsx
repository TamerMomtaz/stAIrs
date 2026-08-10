/* ═══════════════════════════════════════════════════════════════════
   Stairs — <AiStatusChip />
   The ⚡ mark in the header, which used to be a span that did nothing.

   It carried a background, a hairline border, padding and a radius —
   the exact vocabulary the buttons beside it are built from — and its
   only behaviour was a title attribute. The affordance audit calls that
   category A2a, and it was the only instance of it in the application.

   So it became what it looked like. The data was already there: an
   admin had nowhere in the product to see whether the assistant was
   healthy, which model was answering, whether it had fallen back today,
   or how the last hour went. Now that is what opening the chip shows.

   Admin and owner only, twice over — the header already asks
   canSeeAgentTelemetry() before rendering this, and this asks again, so
   the component cannot be mounted somewhere that forgot. The endpoints
   behind it are gated to the same two roles server-side, which is the
   half that #65 missed.
   ═══════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from "react";
import { api, canSeeAgentTelemetry } from "../api";
import { GOLD, OK, WARN, BAD, cast, tint } from "../constants";

const dot = (health) => ({ healthy: OK, degraded: WARN, down: BAD }[health]);

export default function AiStatusChip({ provider, isAr = false }) {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState(null);
  const [state, setState] = useState("idle");   // idle | loading | ready | failed
  const closeRef = useRef(null);

  const t = {
    title: isAr ? "حالة المساعد" : "Assistant status",
    healthy: isAr ? "يعمل" : "Operational",
    degraded: isAr ? "متدهور" : "Degraded",
    down: isAr ? "متوقف" : "Unavailable",
    model: isAr ? "النموذج" : "Model",
    success: isAr ? "نسبة النجاح" : "Success rate",
    calls: isAr ? "المكالمات" : "Calls",
    fallback: isAr ? "تبديل احتياطي اليوم" : "Fallbacks today",
    providers: isAr ? "المزودون" : "Providers",
    lastError: isAr ? "آخر خطأ" : "Last error",
    unreachable: isAr ? "تعذر جلب الحالة" : "Status unavailable",
    none: isAr ? "لا يوجد" : "none",
  };

  // Escape closes it, and focus goes back to the chip — otherwise a
  // keyboard user who opens this is left standing in the document body.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); closeRef.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!canSeeAgentTelemetry() || !provider) return null;

  const load = async () => {
    setState("loading");
    try {
      setHealth(await api.get("/api/v1/ai/health"));
      setState("ready");
    } catch {
      // A failed status call is itself a status. Say so rather than
      // leaving the panel spinning.
      setHealth(null);
      setState("failed");
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) load();
  };

  const level = state !== "ready" ? null
    : !health?.healthy ? "down" : health?.degraded ? "degraded" : "healthy";

  const Row = ({ label, value }) => (
    <div className="flex items-baseline justify-between gap-4 px-4 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-ink-faint shrink-0">{label}</span>
      <span className="text-xs text-ink-2 text-right break-all">{value}</span>
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={closeRef}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="ai-status-chip"
        title={t.title}
        className="text-[10px] text-ink-muted flex items-center gap-1 px-2 py-1 rounded-md border border-hairline bg-sunken
                   hover:text-accent-ink hover:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/30 transition"
      >
        ⚡ {provider.provider_display}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label={t.title}
            data-testid="ai-status-panel"
            className={`absolute ${isAr ? "left-0" : "right-0"} top-full mt-2 w-72 rounded-xl z-50 py-2`}
            style={{
              background: "rgb(var(--surface-raised-rgb) / 0.97)",
              border: `1px solid ${tint(GOLD, 19)}`,
              backdropFilter: "blur(20px)",
              boxShadow: `0 12px 40px ${cast(0.5)}`,
            }}
          >
            <div className="px-4 py-2 border-b flex items-center gap-2" style={{ borderColor: tint(GOLD, 8) }}>
              {level && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot(level) }} data-testid="ai-status-dot" data-level={level} />}
              <span className="text-sm font-medium text-ink">
                {state === "loading" ? "…" : state === "failed" ? t.unreachable : t[level]}
              </span>
            </div>

            {state === "ready" && health && (
              <div className="py-1">
                <Row label={t.model} value={health.active_model || t.none} />
                <Row label={t.success} value={health.success_rate === null ? t.none : `${health.success_rate}%`} />
                <Row label={t.calls} value={`${health.calls_ok} ok · ${health.calls_failed} failed`} />
                <Row label={t.fallback} value={health.fallback_switches_today} />
                {health.providers && (
                  <div className="px-4 pt-2 mt-1 border-t" style={{ borderColor: tint(GOLD, 8) }}>
                    <div className="text-[10px] uppercase tracking-wider text-ink-faint mb-1">{t.providers}</div>
                    {Object.entries(health.providers).map(([key, p]) => (
                      <div key={key} className="flex items-center justify-between gap-3 py-0.5">
                        <span className="text-xs text-ink-2">{p.display_name}</span>
                        <span className="text-[10px] text-ink-faint">
                          {p.has_key ? "🔑" : "—"}{p.failures_last_hour > 0 ? ` · ${p.failures_last_hour} fail` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {health.last_error && (
                  <div className="px-4 pt-2 mt-1 border-t" style={{ borderColor: tint(GOLD, 8) }}>
                    <div className="text-[10px] uppercase tracking-wider text-ink-faint mb-1">{t.lastError}</div>
                    <div className="text-[11px] text-ink-3 break-words leading-relaxed">{health.last_error}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
