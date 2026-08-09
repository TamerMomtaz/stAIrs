/* ═══════════════════════════════════════════════════════════════════
   Stairs — <ExecutionPicker />

   The Execution Room is per-step: there is no "the Execution Room", only
   "the Execution Room for step X". That is why it never had a nav item,
   and why its two read-only outputs — Action Plans and Manifest Room —
   ended up in the sidebar while the thing that produces them did not.

   This is the missing screen. Not a menu on the way to the room: the
   answer to "what should I work on next", which is the question an
   execution tool exists to answer. Each card says how much work is
   already banked against that step, so the list tells you where you
   stand rather than only where you can go.

   The destination never changes. Clicking Execution Room in the sidebar
   always lands here — a nav item that goes somewhere different depending
   on history is the "I don't know where things go" complaint, not a fix
   for it. Resuming is one click on the pinned card at the top.
   ═══════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from "react";
import { GOLD, GOLD_L, INK_3, INK_MUTED, glass, tint, typeColors, typeIcons } from "../constants";
import { HealthBadge } from "./SharedUI";
import { ViewHeader } from "./ViewHeader";
import LoadFailed from "./LoadFailed";
import { loadSavedWork, mostRecentlyWorked, flattenTree } from "../lib/savedWork";

const when = (iso, isAr) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return isAr ? "اليوم" : "today";
  if (days === 1) return isAr ? "أمس" : "yesterday";
  if (days < 7) return isAr ? `قبل ${days} أيام` : `${days} days ago`;
  return d.toLocaleDateString(isAr ? "ar" : "en-GB", { day: "numeric", month: "short" });
};

const workLine = (work, isAr) => {
  if (!work || work.total === 0) {
    return work?.lastWorkedAt
      ? { text: isAr ? "عمل محفوظ على هذه الخطوة" : "Work saved on this step", tone: "some" }
      : { text: isAr ? "لا توجد خطة عمل بعد" : "No action plan yet", tone: "none" };
  }
  if (work.withWork === 0) {
    return { text: isAr ? `${work.total} إجراء، لم يبدأ العمل` : `${work.total} action${work.total === 1 ? "" : "s"}, none worked yet`, tone: "none" };
  }
  if (work.withWork >= work.total) {
    return { text: isAr ? `كل الإجراءات الـ${work.total} لديها عمل محفوظ` : `All ${work.total} actions have saved work`, tone: "done" };
  }
  return { text: isAr ? `${work.withWork} من ${work.total} إجراء لديها عمل محفوظ` : `${work.withWork} of ${work.total} actions have saved work`, tone: "some" };
};

const TONE = {
  none: "text-ink-muted",
  some: "text-emerald-400/80",
  done: "text-emerald-400",
};

const StepCard = ({ node, work, isAr, onOpen, pinned }) => {
  const s = node.stair;
  const colour = typeColors[s.element_type] || INK_3;
  const line = workLine(work, isAr);
  const stamp = when(work?.lastWorkedAt, isAr);
  return (
    <button
      onClick={() => onOpen(s)}
      data-testid={pinned ? "picker-resume" : "picker-step"}
      className="w-full text-left rounded-xl p-4 transition-all hover:scale-[1.01] flex items-start gap-3"
      style={{
        ...glass(pinned ? 0.6 : 0.4),
        borderInlineStart: `3px solid ${pinned ? GOLD : colour}`,
        ...(pinned ? { boxShadow: `0 0 0 1px ${tint(GOLD, 20)}` } : {}),
      }}
    >
      <span className="shrink-0 mt-0.5" style={{ color: colour, fontSize: 16 }}>{typeIcons[s.element_type] || "•"}</span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2 flex-wrap">
          {s.code && <span className="text-xs font-mono opacity-50" style={{ color: colour }}>{s.code}</span>}
          <span className="text-ink text-sm font-medium">{isAr && s.title_ar ? s.title_ar : s.title}</span>
          <HealthBadge health={s.health} />
        </span>
        <span className={`block text-xs mt-1.5 ${TONE[line.tone]}`}>
          {line.tone !== "none" && "💾 "}{line.text}
          {stamp && <span className="text-ink-faint"> · {isAr ? "آخر عمل" : "last worked"} {stamp}</span>}
        </span>
      </span>
      <span className="shrink-0 text-xs font-medium self-center" style={{ color: pinned ? GOLD_L : INK_MUTED }}>
        {s.progress_percent || 0}%
      </span>
    </button>
  );
};

export const ExecutionPicker = ({ tree, strategyContext, lang, onOpen, treeFailed, onRetryTree }) => {
  const isAr = lang === "ar";
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    if (!strategyContext?.id) { setLoading(false); return; }
    setLoading(true); setFailed(false);
    try {
      const { counts } = await loadSavedWork(strategyContext.id);
      setCounts(counts);
    } catch (e) {
      // Losing the counts costs you the annotations, not the ability to open
      // a step — the list below renders from the tree either way.
      console.warn("[stairs] load saved work:", e.message);
      setFailed(true);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [strategyContext?.id]);

  const header = (
    <ViewHeader
      title={isAr ? "غرفة التنفيذ" : "Execution Room"}
      subtitle={isAr ? "اختر الخطوة التي ستعمل عليها" : "Pick the step you're working on"}
    />
  );

  // The tree comes from the shell, so its failure is reported by the shell's retry.
  if (treeFailed && !tree?.length) return (
    <div>{header}<div className="py-8"><LoadFailed what={isAr ? "خطواتك" : "your steps"} lang={lang} onRetry={onRetryTree} /></div></div>
  );

  const steps = flattenTree(tree);

  if (!steps.length) return (
    <div>{header}
      <div className="text-center py-16">
        <div className="text-4xl mb-4">🪜</div>
        <h3 className="text-ink text-lg font-semibold mb-2">{isAr ? "لا توجد خطوات بعد" : "No steps to work on yet"}</h3>
        <p className="text-ink-muted text-sm max-w-md mx-auto">
          {isAr
            ? "ابنِ سلّمك أولاً — كل خطوة تضيفها يمكن العمل عليها هنا."
            : "Build your staircase first. Every step you add becomes something you can work on here."}
        </p>
      </div>
    </div>
  );

  const resume = mostRecentlyWorked(counts);
  const resumeNode = resume && steps.find(n => String(n.stair.id) === String(resume.stairId));

  return (
    <div>
      {header}
      {failed && <div className="mb-4"><LoadFailed compact what={isAr ? "حالة العمل" : "where your work stands"} lang={lang} onRetry={load} /></div>}

      {resumeNode && (
        <div className="mb-6" data-testid="picker-resume-block">
          <h3 className="text-ink-3 text-xs uppercase tracking-wider mb-2">
            {isAr ? "تابع من حيث توقفت" : "Continue where you left off"}
          </h3>
          <StepCard node={resumeNode} work={counts[String(resumeNode.stair.id)]} isAr={isAr} onOpen={onOpen} pinned />
        </div>
      )}

      <h3 className="text-ink-3 text-xs uppercase tracking-wider mb-2">
        {isAr ? "كل الخطوات" : "All steps"}
        {loading && <span className="text-ink-faint normal-case tracking-normal"> · {isAr ? "جارٍ حساب العمل المحفوظ..." : "checking saved work…"}</span>}
      </h3>
      <div className="space-y-2">
        {steps.map(node => (
          <div key={node.stair.id} style={{ marginInlineStart: node.depth * 20 }}>
            <StepCard node={node} work={counts[String(node.stair.id)]} isAr={isAr} onOpen={onOpen} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExecutionPicker;
