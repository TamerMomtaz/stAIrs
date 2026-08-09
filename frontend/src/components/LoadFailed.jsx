/* ═══════════════════════════════════════════════════════════════════
   Stairs — <LoadFailed />
   What a client sees when data didn't arrive.

   The sibling of <AiUnavailable />, and the same design intent: a
   considered product state, not an accident. No red alarm, no status
   code, one clear action.

   The reason it exists: every list view in the app used to turn a load
   failure into its empty state. A blip on the connection and the
   dashboard reported 0% progress across 0 elements, the staircase said
   "No elements yet", and a client reasonably concluded their strategy
   was gone. The copy below has one job above all others — say that
   nothing has changed, only that we couldn't reach it.
   ═══════════════════════════════════════════════════════════════════ */

import { CHAMPAGNE, DEEP, GOLD, GOLD_L, GRAD_ACCENT, tint } from "../constants";
// `what` names the thing that didn't load, so the sentence is about the
// client's strategy rather than about software. Callers pass an already
// localised noun; without one the copy stays general.
const COPY = {
  en: {
    title: (what) => (what ? `We couldn't load ${what}` : "We couldn't load this"),
    body: "Nothing has changed and nothing is lost — this is a connection problem, not your strategy. Try again in a moment.",
    retry: "Try again",
    retrying: "Trying…",
  },
  ar: {
    title: (what) => (what ? `تعذّر تحميل ${what}` : "تعذّر تحميل هذا المحتوى"),
    body: "لم يتغيّر شيء ولم يُفقد شيء — هذه مشكلة في الاتصال وليست في استراتيجيتك. أعد المحاولة بعد لحظات.",
    retry: "إعادة المحاولة",
    retrying: "جارٍ المحاولة…",
  },
};

export default function LoadFailed({ what, lang = "en", onRetry, retrying = false, compact = false }) {
  const rtl = lang === "ar";
  const t = COPY[rtl ? "ar" : "en"];

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      data-testid="load-failed"
      className={`rounded-2xl ${compact ? "p-3" : "p-5"} mx-auto`}
      style={{
        background: tint(GOLD, 6),
        border: `1px solid ${tint(GOLD, 15)}`,
        maxWidth: compact ? "none" : "34rem",
      }}
    >
      <div className="flex items-start gap-3">
        {/* A staircase with a step missing — we couldn't draw what isn't here.
            Same family as the AiUnavailable mark, different state. */}
        <div
          className="shrink-0 flex items-center justify-center rounded-xl"
          style={{ width: 32, height: 32, background: `${tint(GOLD, 8)}`, border: `1px solid ${tint(GOLD, 18)}` }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M1.5 13.5h3.2v-3.2h3.2" stroke={GOLD_L} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
            <path d="M11.1 7.1h0.4M14.3 3.9h0.2" stroke={GOLD_L} strokeWidth="1.4" strokeLinecap="round" opacity="0.35" />
            <path d="M8 10.3V7.1h1.6" stroke={GOLD_L} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1.6 1.8" opacity="0.5" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium" style={{ color: CHAMPAGNE }}>{t.title(what)}</div>
          <div className="text-xs leading-relaxed mt-1 text-ink-3">{t.body}</div>
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={retrying}
              data-testid="load-failed-retry"
              className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-[1.03] disabled:opacity-50 disabled:hover:scale-100"
              style={{ background: GRAD_ACCENT, color: DEEP }}
            >
              {retrying ? t.retrying : t.retry}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
