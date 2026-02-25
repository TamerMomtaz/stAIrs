import { useState } from "react";
import { api } from "../api";
import { GOLD, GOLD_L, TEAL, typeColors, typeIcons } from "../constants";
import { HealthBadge } from "./SharedUI";
import { Markdown } from "./Markdown";

export const StaircaseView = ({ tree, lang, onEdit, onAdd, onExport, onMove, strategyContext, onSaveNote, onExecutionRoom }) => {
  const [expanded, setExpanded] = useState(null); const [aiAction, setAiAction] = useState(null);
  const [aiResult, setAiResult] = useState({}); const [aiLoading, setAiLoading] = useState(false); const [retryMsg, setRetryMsg] = useState(null);
  const isAr = lang === "ar";
  const sourceRef = "When citing frameworks, books, or statistics, include a brief source reference.";
  const handleAI = async (stair, action) => {
    setAiAction({ id: stair.id, type: action }); setAiLoading(true);
    try {
      const ctx = strategyContext ? `[Strategy: "${strategyContext.name}" for "${strategyContext.company || strategyContext.name}". Industry: ${strategyContext.industry||"unspecified"}.]\n\n` : "";
      const prompt = action === "explain"
        ? `${ctx}${sourceRef}\n\nExplain: ${stair.element_type} "${stair.title}" (${stair.code||""}), health: ${stair.health}, progress: ${stair.progress_percent}%.\n${stair.description||""}\n\nExplain meaning, importance, success criteria, and risks.`
        : `${ctx}${sourceRef}\n\nEnhance: ${stair.element_type} "${stair.title}" (${stair.code||""}), health: ${stair.health}, progress: ${stair.progress_percent}%.\n${stair.description||""}\n\nSuggest: 1) Better definition, 2) KPIs, 3) Next actions, 4) Sub-elements.`;
      const res = await api.aiPost("/api/v1/ai/chat", { message: prompt }, (attempt, max) => setRetryMsg(`AI is thinking... retrying (${attempt}/${max})`));
      setRetryMsg(null);
      setAiResult(prev => ({...prev, [stair.id]: {...prev[stair.id], [action]: res.response}}));
    } catch (e) { setRetryMsg(null); setAiResult(prev => ({...prev, [stair.id]: {...prev[stair.id], [action]: `⚠️ ${e.message}`}})); }
    setAiLoading(false); setAiAction(null);
  };
  const renderStair = (node, depth=0, si=0, sc=1) => {
    const s = node.stair, color = typeColors[s.element_type]||"#94a3b8", isExp = expanded===s.id, result = aiResult[s.id], isLd = aiLoading&&aiAction?.id===s.id;
    return (
      <div key={s.id} style={{ marginLeft: depth*24 }}>
        <div className={`group rounded-xl my-1.5 transition-all ${isExp?"ring-1":""}`} style={{ borderLeft:`3px solid ${color}`, ...(isExp?{ringColor:`${color}40`,background:"rgba(22,37,68,0.4)"}:{}) }}>
          <div className="flex items-center gap-2 p-3 cursor-pointer hover:bg-white/[0.03] rounded-xl transition" onClick={() => setExpanded(prev => prev===s.id?null:s.id)}>
            <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0"><button onClick={e => {e.stopPropagation();onMove(s.id,"up");}} disabled={si===0} className="text-gray-600 hover:text-white text-[10px] disabled:opacity-20 p-0.5">▲</button><button onClick={e => {e.stopPropagation();onMove(s.id,"down");}} disabled={si>=sc-1} className="text-gray-600 hover:text-white text-[10px] disabled:opacity-20 p-0.5">▼</button></div>
            <span className={`text-gray-600 text-[10px] transition-transform ${isExp?"rotate-90":""}`}>▶</span>
            <span style={{color,fontSize:16}}>{typeIcons[s.element_type]||"•"}</span>
            <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="text-xs font-mono opacity-40" style={{color}}>{s.code}</span><span className="text-white text-sm font-medium truncate">{isAr&&s.title_ar?s.title_ar:s.title}</span></div>{s.description&&!isExp&&<div className="text-gray-600 text-xs mt-0.5 truncate max-w-md">{s.description}</div>}</div>
            <HealthBadge health={s.health}/><div className="w-14 text-right shrink-0"><div className="text-xs font-medium" style={{color}}>{s.progress_percent}%</div><div className="h-1 rounded-full bg-[#1e3a5f] mt-0.5 overflow-hidden"><div className="h-full rounded-full" style={{width:`${s.progress_percent}%`,background:color,transition:"width 0.6s ease"}}/></div></div>
          </div>
          {isExp && (
            <div className="px-4 pb-4 pt-1 space-y-3" style={{ borderTop:`1px solid ${color}15` }}>
              {s.description && <div className="text-gray-400 text-sm leading-relaxed">{s.description}</div>}
              <div className="flex items-center gap-2 flex-wrap" data-tutorial="staircase-actions">
                <button onClick={e => {e.stopPropagation();handleAI(s,"explain");}} disabled={isLd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:scale-[1.02]" style={{borderColor:`${TEAL}60`,color:"#5eead4",background:`${TEAL}20`}}>{isLd&&aiAction?.type==="explain"?<span className="animate-spin">⟳</span>:"💡"} {isAr?"شرح":"Explain"}</button>
                <button onClick={e => {e.stopPropagation();handleAI(s,"enhance");}} disabled={isLd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:scale-[1.02]" style={{borderColor:`${GOLD}60`,color:GOLD,background:`${GOLD}15`}}>{isLd&&aiAction?.type==="enhance"?<span className="animate-spin">⟳</span>:"✨"} {isAr?"تحسين":"Enhance"}</button>
                {onExecutionRoom && <button onClick={e => {e.stopPropagation();onExecutionRoom(s);}} data-tutorial="execution-room" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:scale-[1.02]" style={{borderColor:"#6366f160",color:"#a5b4fc",background:"#6366f120"}}>🚀 {isAr?"غرفة التنفيذ":"Execution Room"}</button>}
                <button onClick={e => {e.stopPropagation();onEdit(s);}} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#1e3a5f] text-gray-400 hover:text-white transition hover:bg-white/5">✎ {isAr?"تعديل":"Edit"}</button>
              </div>
              {isLd && <div className="flex items-center gap-2 py-3"><div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-amber-500/40 animate-bounce" style={{animationDelay:`${i*0.15}s`}} />)}</div><span className="text-gray-500 text-xs">{retryMsg || (aiAction?.type==="explain"?"Analyzing...":"Generating...")}</span></div>}
              {result?.explain && <div className="p-3 rounded-lg" style={{background:`${TEAL}10`,border:`1px solid ${TEAL}25`}}><div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold text-teal-300 uppercase tracking-wider">💡 Explanation</span>{onSaveNote&&<button onClick={() => onSaveNote(`💡 ${s.title} — Explain`, result.explain, "ai_explain")} className="text-[10px] text-gray-600 hover:text-teal-300 transition px-1.5 py-0.5 rounded hover:bg-teal-500/10">📌 Save</button>}</div><div className="text-sm"><Markdown text={result.explain}/></div></div>}
              {result?.enhance && <div className="p-3 rounded-lg" style={{background:`${GOLD}08`,border:`1px solid ${GOLD}20`}}><div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">✨ Enhancement</span>{onSaveNote&&<button onClick={() => onSaveNote(`✨ ${s.title} — Enhance`, result.enhance, "ai_enhance")} className="text-[10px] text-gray-600 hover:text-amber-300 transition px-1.5 py-0.5 rounded hover:bg-amber-500/10">📌 Save</button>}</div><div className="text-sm"><Markdown text={result.enhance}/></div></div>}
            </div>
          )}
        </div>
        {node.children?.map((ch,ci) => renderStair(ch, depth+1, ci, node.children.length))}
      </div>
    );
  };
  return (
    <div>
      <div className="flex items-center gap-3 mb-4"><button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]" style={{background:`${GOLD}22`,border:`1px solid ${GOLD}33`,color:GOLD}}>+ {isAr?"إضافة":"Add Element"}</button><div className="flex-1"/><button onClick={onExport} data-tutorial="export-btn" className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white transition" style={{border:`1px solid rgba(30, 58, 95, 0.5)`}}>↓ {isAr?"تصدير":"Export"}</button></div>
      {!tree?.length ? <div className="text-gray-500 text-center py-12">{isAr?"لا توجد عناصر بعد.":"No elements yet. Add your first or use AI Advisor."}</div> : <div className="space-y-0.5">{tree.map((n,i) => renderStair(n,0,i,tree.length))}</div>}
    </div>
  );
};
