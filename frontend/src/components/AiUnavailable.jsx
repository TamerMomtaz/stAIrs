/* ═══════════════════════════════════════════════════════════════════
   Stairs — <AiUnavailable />
   The bubble a client sees when the assistant can't answer.

   Design intent: a considered product state, not an accident. No red
   alarm, no status code, no apology spiral. Gold on glass, same language
   as the rest of Stairs, one clear action.
   ═══════════════════════════════════════════════════════════════════ */

import { aiFailureCopy } from "../lib/aiResilience";
import { BORDER_STRONG, CHAMPAGNE, DEEP, GOLD, GOLD_L, GRAD_ACCENT, glass, tint } from "../constants";
export default function AiUnavailable({
  kind = "unavailable",
  lang = "en",
  onRetry,
  onContinueManually,
  retrying = false,
  compact = false,
}) {
  const copy = aiFailureCopy(kind, lang);
  const rtl = lang === "ar";
  const t = {
    retry: rtl ? "إعادة المحاولة" : "Try again",
    manual: rtl ? "المتابعة يدويًا" : "Continue manually",
    saved: rtl ? "تم حفظ مدخلاتك" : "Your inputs are saved",
  };

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      data-testid="ai-unavailable"
      data-kind={kind}
      className={`rounded-2xl ${compact ? "p-3" : "p-4"} ${rtl ? "rounded-br-md" : "rounded-bl-md"}`}
      style={{
        background: tint(GOLD, 6),
        border: `1px solid ${tint(GOLD, 15)}`,
      }}
    >
      <div className="flex items-start gap-3">
        {/* Calm mark — a paused staircase, not a warning triangle */}
        <div
          className="shrink-0 flex items-center justify-center rounded-xl"
          style={{
            width: 32,
            height: 32,
            background: `${tint(GOLD, 8)}`,
            border: `1px solid ${tint(GOLD, 18)}`,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M1.5 13.5h3.2v-3.2h3.2V7.1h3.2V3.9h3.4"
              stroke={GOLD_L}
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
            />
            <circle cx="13.6" cy="3.9" r="1.9" fill={GOLD_L} opacity="0.35">
              <animate
                attributeName="opacity"
                values="0.35;0.9;0.35"
                dur="1.8s"
                repeatCount="indefinite"
              />
            </circle>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium" style={{ color: CHAMPAGNE }}>
            {copy.title}
          </div>
          <div className="text-xs leading-relaxed mt-1 text-ink-3">{copy.body}</div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {onRetry && (
              <button
                onClick={onRetry}
                disabled={retrying}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-[1.03] disabled:opacity-50 disabled:hover:scale-100"
                style={{ background: GRAD_ACCENT, color: DEEP }}
              >
                {retrying ? "…" : t.retry}
              </button>
            )}
            {onContinueManually && (
              <button
                onClick={onContinueManually}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-3 hover:text-ink transition"
                style={{ border: `1px solid ${tint(BORDER_STRONG, 90)}` }}
              >
                {t.manual}
              </button>
            )}
            <span className="text-[10px] text-ink-faint tracking-wide">✓ {t.saved}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
