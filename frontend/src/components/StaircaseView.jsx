import { useState, useEffect, useRef } from "react";
import { api, ArtifactsAPI, ActionPlansAPI, ARTIFACT, stairScope } from "../api";
import { GOLD, GOLD_L, TEAL, DEEP, typeColors, typeIcons } from "../constants";
import { HealthBadge } from "./SharedUI";
import { Markdown } from "./Markdown";
import { LoadMatrixButtons } from "./StrategyMatrixToolkit";
import { fireGuidance } from "../guidanceConfig";
import { normalizeAiResult } from "../lib/aiResilience";
import AiUnavailable from "./AiUnavailable";
import LoadFailed from "./LoadFailed";
import { ViewHeader } from "./ViewHeader";

const typeTextStyle = {
  vision: { fontSize: 18, fontWeight: 700, color: "#fff" },
  objective: { fontSize: 16, fontWeight: 700, color: "#fff" },
  key_result: { fontSize: 14, fontWeight: 600, color: "#fff" },
  initiative: { fontSize: 14, fontWeight: 400, color: "#fff" },
  task: { fontSize: 13, fontWeight: 400, color: "#94a3b8" },
};

const NotStartedBadge = () => (
  <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap bg-slate-500/20 text-slate-300 border-slate-500/40">○ NOT STARTED</span>
);

export const StaircaseView = ({ tree, lang, onEdit, onAdd, onExport, onMove, strategyContext, onSaveNote, onExecutionRoom, onMatrixClick, failed, retrying, onRetry }) => {
  const [expanded, setExpanded] = useState(null); const [aiAction, setAiAction] = useState(null);
  const [aiResult, setAiResult] = useState({}); const [aiLoading, setAiLoading] = useState(false); const [retryMsg, setRetryMsg] = useState(null);
  // scope_key → ISO timestamp for content read back from the server.
  const [savedAt, setSavedAt] = useState({});
  // stair id → { total, withWork }: how many of a stair's actions have work
  // saved against them, so the row can say where the work went.
  const [savedWork, setSavedWork] = useState({});
  const inFlight = useRef(new Set());
  const isAr = lang === "ar";
  const sourceRef = "When citing frameworks, books, or statistics, include a brief source reference.";

  // Explain/Enhance results used to live only in component state, so they
  // vanished on any navigation and had to be re-asked. Read them back — and
  // while we have the full artifact list, work out how much saved work sits
  // behind each stair so the row can say so.
  useEffect(() => {
    if (!strategyContext?.id) return;
    let cancelled = false;
    Promise.all([
      ArtifactsAPI.forStrategy(strategyContext.id).catch(() => []),
      ActionPlansAPI.getForStrategy(strategyContext.id).catch(() => []),
    ]).then(([artifacts, planGroups]) => {
      if (cancelled) return;

      const results = {}; const stamps = {};
      // taskScope is "<stair id>:<task id>"; stair-level artifacts have no colon.
      const workedTasksByStair = {};
      for (const a of artifacts) {
        if (a.artifact_type === ARTIFACT.STAIR_EXPLAIN) {
          results[a.scope_key] = { ...(results[a.scope_key] || {}), explain: a.content };
          stamps[`explain:${a.scope_key}`] = a.generated_at;
        } else if (a.artifact_type === ARTIFACT.STAIR_ENHANCE) {
          results[a.scope_key] = { ...(results[a.scope_key] || {}), enhance: a.content };
          stamps[`enhance:${a.scope_key}`] = a.generated_at;
        }
        if (![ARTIFACT.EXPLAIN, ARTIFACT.ASSESS_CHAT, ARTIFACT.IMPL_GUIDE].includes(a.artifact_type)) continue;
        const sep = a.scope_key.indexOf(":");
        if (sep < 0) continue;
        const stairId = a.scope_key.slice(0, sep);
        (workedTasksByStair[stairId] ||= new Set()).add(a.scope_key.slice(sep + 1));
      }

      const counts = {};
      for (const g of planGroups || []) {
        const taskIds = new Set();
        for (const p of g.plans || []) {
          (p.tasks || []).forEach((t, i) => taskIds.add(t.id || `task_${i}_${p.id}`));
        }
        const worked = workedTasksByStair[String(g.stair_id)] || new Set();
        // Only count work against tasks the current plan still has, so a
        // regenerated plan doesn't inflate the number with orphaned artifacts.
        const withWork = [...worked].filter(id => taskIds.has(id)).length;
        if (taskIds.size > 0) counts[String(g.stair_id)] = { total: taskIds.size, withWork };
      }

      setAiResult(prev => {
        const merged = { ...prev };
        for (const [k, v] of Object.entries(results)) merged[k] = { ...(merged[k] || {}), ...v };
        return merged;
      });
      setSavedAt(stamps);
      setSavedWork(counts);
    });
    return () => { cancelled = true; };
  }, [strategyContext?.id]);

  const handleAI = async (stair, action) => {
    // One call per stair+action, however fast the button is clicked.
    const opKey = `${action}:${stair.id}`;
    if (inFlight.current.has(opKey)) return;
    inFlight.current.add(opKey);
    setAiAction({ id: stair.id, type: action }); setAiLoading(true);
    try {
      const ctx = strategyContext ? `[Strategy: "${strategyContext.name}" for "${strategyContext.company || strategyContext.name}". Industry: ${strategyContext.industry||"unspecified"}.]\n\n` : "";
      const prompt = action === "explain"
        ? `${ctx}${sourceRef}\n\nExplain: ${stair.element_type} "${stair.title}" (${stair.code||""}), health: ${stair.health}, progress: ${stair.progress_percent}%.\n${stair.description||""}\n\nExplain meaning, importance, success criteria, and risks.`
        : `${ctx}${sourceRef}\n\nEnhance: ${stair.element_type} "${stair.title}" (${stair.code||""}), health: ${stair.health}, progress: ${stair.progress_percent}%.\n${stair.description||""}\n\nSuggest: 1) Better definition, 2) KPIs, 3) Next actions, 4) Sub-elements.`;
      const res = await api.aiPost("/api/v1/ai/chat", { message: prompt, strategy_id: strategyContext?.id || null }, (attempt, max) => setRetryMsg(`AI is thinking... retrying (${attempt}/${max})`), `staircase:${action}`);
      setRetryMsg(null);
      const r = normalizeAiResult(res, { lang });
      if (!r.ok) {
        setAiResult(prev => ({...prev, [stair.id]: {...prev[stair.id], [action]: null, [`${action}_failure`]: r.kind}}));
      } else {
        setAiResult(prev => ({...prev, [stair.id]: {...prev[stair.id], [action]: r.text, [`${action}_failure`]: null}}));
        fireGuidance("ai_insight", { name: stair.title, stair });
        try {
          const saved = await ArtifactsAPI.save({
            artifactType: action === "explain" ? ARTIFACT.STAIR_EXPLAIN : ARTIFACT.STAIR_ENHANCE,
            scopeKey: stairScope(stair.id),
            strategyId: strategyContext?.id || null,
            stairId: stair.id,
            content: r.text,
          });
          setSavedAt(prev => ({ ...prev, [`${action}:${stair.id}`]: saved.generated_at || new Date().toISOString() }));
        } catch (saveErr) {
          console.warn(`[stairs] failed to save ${action} result:`, saveErr.message);
          setAiResult(prev => ({...prev, [stair.id]: {...prev[stair.id], [`${action}_unsaved`]: true}}));
        }
      }
    } catch (e) {
      setRetryMsg(null);
      const r = normalizeAiResult(e, { lang });
      setAiResult(prev => ({...prev, [stair.id]: {...prev[stair.id], [action]: null, [`${action}_failure`]: r.kind}}));
    }
    setAiLoading(false); setAiAction(null); inFlight.current.delete(opKey);
  };

  // "Saved <when>" / "not saved" — a persisted insight should say so.
  const SaveState = ({ stair, action, result }) => {
    if (result?.[`${action}_unsaved`]) {
      return <span className="text-[10px] text-red-300 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/25" title={isAr ? "لم يُحفظ على الخادم" : "Not saved to the server"}>⚠ {isAr ? "غير محفوظ" : "Not saved"}</span>;
    }
    const ts = savedAt[`${action}:${stair.id}`];
    if (!ts) return null;
    const d = new Date(ts);
    if (isNaN(d)) return null;
    return <span className="text-[10px] text-emerald-400/80 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20" title={d.toLocaleString()}>✓ {isAr ? "محفوظ" : "Saved"} {d.toLocaleDateString()}</span>;
  };
  const renderStair = (node, depth=0, si=0, sc=1) => {
    const s = node.stair, color = typeColors[s.element_type]||"#94a3b8", isExp = expanded===s.id, result = aiResult[s.id], isLd = aiLoading&&aiAction?.id===s.id;
    const work = savedWork[String(s.id)];
    return (
      <div key={s.id} style={{ marginLeft: depth*24 }}>
        <div className={`group rounded-xl my-1.5 transition-all ${isExp?"ring-1":""}`} style={{ borderLeft:`3px solid ${color}`, ...(isExp?{ringColor:`${color}40`,background:"rgba(22,37,68,0.4)"}:{}) }}>
          <div className="flex items-center gap-2 p-3 cursor-pointer hover:bg-white/[0.03] rounded-xl transition" onClick={() => setExpanded(prev => { const next = prev===s.id?null:s.id; if (next===s.id) fireGuidance("stair_expanded", { name: isAr&&s.title_ar?s.title_ar:s.title }); return next; })}>
            <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0"><button onClick={e => {e.stopPropagation();onMove(s.id,"up");}} disabled={si===0} className="text-gray-600 hover:text-white text-[10px] disabled:opacity-20 p-0.5">▲</button><button onClick={e => {e.stopPropagation();onMove(s.id,"down");}} disabled={si>=sc-1} className="text-gray-600 hover:text-white text-[10px] disabled:opacity-20 p-0.5">▼</button></div>
            <span className={`text-gray-600 text-[10px] transition-transform ${isExp?"rotate-90":""}`}>▶</span>
            <span style={{color,fontSize:16}}>{typeIcons[s.element_type]||"•"}</span>
            <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="text-xs font-mono opacity-40" style={{color}}>{s.code}</span><span className="truncate" style={typeTextStyle[s.element_type]||{fontSize:14,fontWeight:500,color:"#fff"}}>{isAr&&s.title_ar?s.title_ar:s.title}</span></div>{s.description&&!isExp&&<div className="text-gray-600 text-xs mt-0.5 truncate max-w-md">{s.description}</div>}{work&&work.withWork>0&&(
              <button
                onClick={e => { e.stopPropagation(); if (onExecutionRoom) onExecutionRoom(s); }}
                className="text-[11px] mt-1 text-emerald-400/80 hover:text-emerald-300 transition"
                title={isAr ? "افتح غرفة التنفيذ لعرض العمل المحفوظ" : "Open the Execution Room to see the saved work"}
              >
                💾 {isAr
                  ? `${work.withWork} من ${work.total} إجراء لديها عمل محفوظ`
                  : `${work.withWork} of ${work.total} action${work.total===1?"":"s"} ${work.withWork===1?"has":"have"} saved work`}
              </button>
            )}</div>
            {(!s.progress_percent && (s.health==="off_track"||!s.health)) ? <NotStartedBadge/> : <HealthBadge health={s.health}/>}<div className="w-14 text-right shrink-0"><div className="text-xs font-medium" style={{color}}>{s.progress_percent}%</div><div className="h-1 rounded-full bg-[#1e3a5f] mt-0.5 overflow-hidden"><div className="h-full rounded-full" style={{width:`${s.progress_percent}%`,background:color,transition:"width 0.6s ease"}}/></div></div>
          </div>
          {isExp && (
            <div className="px-4 pb-4 pt-1 space-y-3" style={{ borderTop:`1px solid ${color}15` }}>
              {s.description && <div className="text-gray-400 text-sm leading-relaxed">{s.description}</div>}
              <div className="flex items-center gap-2 flex-wrap" data-tutorial="staircase-actions">
                {onExecutionRoom && <button onClick={e => {e.stopPropagation();onExecutionRoom(s);}} data-tutorial="execution-room" className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition hover:scale-[1.02]" style={{background:`linear-gradient(135deg, ${GOLD}, ${GOLD_L})`,color:DEEP}}>🚀 {isAr?"غرفة التنفيذ":"Execution Room"}</button>}
                <button onClick={e => {e.stopPropagation();handleAI(s,"explain");}} disabled={isLd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-transparent transition hover:scale-[1.02]" style={{borderColor:`${TEAL}60`,color:"#5eead4"}}>{isLd&&aiAction?.type==="explain"?<span className="animate-spin">⟳</span>:"💡"} {isAr?"شرح":"Explain"}</button>
                <button onClick={e => {e.stopPropagation();handleAI(s,"enhance");}} disabled={isLd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-transparent transition hover:scale-[1.02]" style={{borderColor:`${GOLD}60`,color:GOLD}}>{isLd&&aiAction?.type==="enhance"?<span className="animate-spin">⟳</span>:"✨"} {isAr?"تحسين":"Enhance"}</button>
                <button onClick={e => {e.stopPropagation();onEdit(s);}} className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-white underline-offset-2 hover:underline transition">✎ {isAr?"تعديل":"Edit"}</button>
              </div>
              {isLd && <div className="flex items-center gap-2 py-3"><div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-amber-500/40 animate-bounce" style={{animationDelay:`${i*0.15}s`}} />)}</div><span className="text-gray-500 text-xs">{retryMsg || (aiAction?.type==="explain"?"Analyzing...":"Generating...")}</span></div>}
              {result?.explain_failure && !isLd && <AiUnavailable compact kind={result.explain_failure} lang={lang} onRetry={() => handleAI(s, "explain")} />}
              {result?.enhance_failure && !isLd && <AiUnavailable compact kind={result.enhance_failure} lang={lang} onRetry={() => handleAI(s, "enhance")} />}
              {result?.explain && <div className="p-3 rounded-lg" style={{background:`${TEAL}10`,border:`1px solid ${TEAL}25`}}><div className="flex items-center justify-between gap-2 mb-2 flex-wrap"><span className="flex items-center gap-2 flex-wrap"><span className="text-xs font-semibold text-teal-300 uppercase tracking-wider">💡 Explanation</span><SaveState stair={s} action="explain" result={result} /></span>{onSaveNote&&<button onClick={() => onSaveNote(`💡 ${s.title} — Explain`, result.explain, "ai_explain")} className="text-[10px] text-gray-600 hover:text-teal-300 transition px-1.5 py-0.5 rounded hover:bg-teal-500/10">📌 Save</button>}</div><div className="text-sm"><Markdown text={result.explain} onMatrixClick={onMatrixClick}/><LoadMatrixButtons text={result.explain} onLoadMatrix={onMatrixClick}/></div></div>}
              {result?.enhance && <div className="p-3 rounded-lg" style={{background:`${GOLD}08`,border:`1px solid ${GOLD}20`}}><div className="flex items-center justify-between gap-2 mb-2 flex-wrap"><span className="flex items-center gap-2 flex-wrap"><span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">✨ Enhancement</span><SaveState stair={s} action="enhance" result={result} /></span>{onSaveNote&&<button onClick={() => onSaveNote(`✨ ${s.title} — Enhance`, result.enhance, "ai_enhance")} className="text-[10px] text-gray-600 hover:text-amber-300 transition px-1.5 py-0.5 rounded hover:bg-amber-500/10">📌 Save</button>}</div><div className="text-sm"><Markdown text={result.enhance} onMatrixClick={onMatrixClick}/><LoadMatrixButtons text={result.enhance} onLoadMatrix={onMatrixClick}/></div></div>}
              {(result?.explain || result?.enhance) && !isLd && (
                <div className="rounded-xl p-4 flex items-center gap-4 flex-wrap" style={{background:`${GOLD}10`,border:`1px solid ${GOLD}33`}}>
                  <div className="flex-1 min-w-[180px]">
                    <div className="text-white text-sm font-semibold">{isAr?"جاهز للتنفيذ؟":"Ready to execute?"}</div>
                    <div className="text-gray-400 text-xs mt-0.5">{isAr?"حوّل هذه الرؤى إلى خطة عمل قابلة للتنفيذ.":"Turn these insights into an actionable plan."}</div>
                  </div>
                  {onExecutionRoom && <button onClick={e => {e.stopPropagation();onExecutionRoom(s);}} className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold transition hover:scale-[1.02]" style={{background:`linear-gradient(135deg, ${GOLD}, ${GOLD_L})`,color:DEEP}}>🚀 {isAr?"افتح غرفة التنفيذ":"Open Execution Room"}</button>}
                  {onSaveNote && <button onClick={e => {e.stopPropagation(); const parts=[]; if(result?.explain)parts.push(`## 💡 Explain\n\n${result.explain}`); if(result?.enhance)parts.push(`## ✨ Enhance\n\n${result.enhance}`); onSaveNote(`${s.title} — AI Insights`, parts.join("\n\n---\n\n"), "ai_insight");}} className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border bg-transparent transition hover:scale-[1.02]" style={{borderColor:`${GOLD}40`,color:GOLD}}>📌 {isAr?"حفظ في الملاحظات":"Save to Notes"}</button>}
                </div>
              )}
            </div>
          )}
        </div>
        {node.children?.map((ch,ci) => renderStair(ch, depth+1, ci, node.children.length))}
      </div>
    );
  };
  return (
    <div>
      <ViewHeader title={isAr ? "السلم" : "Staircase"} />
      <div className="flex items-center gap-3 mb-4"><button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]" style={{background:`${GOLD}22`,border:`1px solid ${GOLD}33`,color:GOLD}}>+ {isAr?"إضافة":"Add Element"}</button><div className="flex-1"/><button onClick={onExport} data-tutorial="export-btn" className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white transition" style={{border:`1px solid rgba(30, 58, 95, 0.5)`}}>↓ {isAr?"تصدير":"Export"}</button></div>
      {failed && <div className={tree?.length ? "mb-3" : "py-12"}><LoadFailed compact={!!tree?.length} what={isAr ? "السلم" : "your staircase"} lang={lang} onRetry={onRetry} retrying={retrying} /></div>}
      {!failed && !tree?.length && <div className="text-gray-500 text-center py-12">{isAr?"لا توجد عناصر بعد.":"No elements yet. Add your first or use AI Advisor."}</div>}
      {!!tree?.length && <div className="space-y-0.5">{tree.map((n,i) => renderStair(n,0,i,tree.length))}</div>}
    </div>
  );
};
