import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import { GOLD, GOLD_L, TEAL, DEEP, BORDER, glass, typeColors, typeIcons, inputCls, labelCls } from "../constants";
import { Markdown } from "./Markdown";
import { Modal } from "./SharedUI";

export const StrategyWizard = ({ open, onClose, onCreate, lang }) => {
  const [step, setStep] = useState(0);
  const [info, setInfo] = useState({ name: "", company: "", industry: "", description: "", icon: "🎯", color: GOLD });
  const [aiMessages, setAiMessages] = useState([]); const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false); const [generatedElements, setGeneratedElements] = useState([]);
  const endRef = useRef(null);
  const iconOpts = ["🎯","🌱","🚀","🗝️","💡","🏭","📊","🌍","⚡","🔬","🛡️","🌐"];
  const colorOpts = [GOLD, TEAL, "#60a5fa", "#a78bfa", "#f87171", "#34d399", "#fbbf24", "#ec4899"];
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [aiMessages]);

  const startAISession = () => { if (!info.name.trim()) return; setStep(1); setAiMessages([{ role: "ai", text: `Great! Let's build the strategy for **${info.company || info.name}**.\n\nTell me about your business goals, challenges, and what you want to achieve.\n\nExamples:\n- "We want to expand across the MENA region"\n- "Our goal is $5M ARR by 2027"` }]); };

  const sendToAI = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const msg = aiInput.trim(); setAiInput("");
    setAiMessages(prev => [...prev, { role: "user", text: msg }]); setAiLoading(true);
    try {
      const contextMessage = `[CONTEXT: Creating strategy "${info.name}" for "${info.company || info.name}" in ${info.industry || "unspecified"} industry. ${info.description || ""} Generate structured strategy elements. Cite sources when referencing frameworks or research.]\n\nUser: ${msg}`;
      const res = await api.post("/api/v1/ai/chat", { message: contextMessage });
      setAiMessages(prev => [...prev, { role: "ai", text: res.response, tokens: res.tokens_used }]);
      const extracted = extractElements(res.response);
      if (extracted.length > 0) setGeneratedElements(prev => [...prev, ...extracted]);
    } catch (e) { setAiMessages(prev => [...prev, { role: "ai", text: `⚠️ ${e.message}`, error: true }]); }
    setAiLoading(false);
  };

  const extractElements = (text) => {
    const elements = []; const lines = text.split("\n");
    for (const line of lines) {
      const clean = line.replace(/\*\*/g, "").replace(/^[-–•]\s*/, "").trim();
      if (!clean) continue;
      let m;
      m = clean.match(/\[?Vision\]?\s*[:;–-]\s*(.+)/i); if (m) { elements.push({ element_type: "vision", title: m[1].trim(), _num: "V" }); continue; }
      m = clean.match(/\[?Objective\s*(\d+)\]?\s*[:;–-]\s*(.+)/i); if (m) { elements.push({ element_type: "objective", title: m[2].trim(), _num: m[1] }); continue; }
      m = clean.match(/\[?(?:Key Result|KR)\s*(\d+)\.?(\d*)\]?\s*[:;–-]\s*(.+)/i); if (m) { elements.push({ element_type: "key_result", title: m[3].trim(), _num: `${m[1]}.${m[2]||"0"}`, _parentNum: m[1] }); continue; }
      m = clean.match(/\[?Initiative\s*(\d+)\.?(\d*)\]?\s*[:;–-]\s*(.+)/i); if (m) { elements.push({ element_type: "initiative", title: m[3].trim(), _num: `I${m[1]}.${m[2]||"0"}`, _parentNum: m[1] }); continue; }
      m = clean.match(/\[?Task\s*(\d+)\.?(\d*)\]?\s*[:;–-]\s*(.+)/i); if (m) { elements.push({ element_type: "task", title: m[3].trim(), _num: `T${m[1]}.${m[2]||"0"}`, _parentNum: m[1] }); continue; }
    }
    return elements;
  };

  const askForStrategy = () => { setAiInput(`Based on our discussion, generate a complete strategic staircase for ${info.company || info.name}. Format:\n[Vision]: ...\n[Objective 1]: ...\n[KR 1.1]: ...\n[Initiative 1.1]: ...\nBe specific.`); };

  const finishWizard = async () => {
    const localElements = [];
    if (generatedElements.length > 0) {
      const codePrefix = { vision: "VIS", objective: "OBJ", key_result: "KR", initiative: "INI", task: "TSK" };
      const els = generatedElements.map((el, i) => ({ ...el, id: `el_${Date.now()}_${i}`, code: `${codePrefix[el.element_type]||"EL"}-${String(i+1).padStart(3,"0")}`, health: "on_track", progress_percent: 0, parent_id: null }));
      const visionId = els.find(e => e.element_type === "vision")?.id;
      const objMap = {};
      els.forEach(el => { if (el.element_type === "objective") { el.parent_id = visionId || null; objMap[el._num] = el.id; } });
      els.forEach(el => { if (["key_result","initiative","task"].includes(el.element_type)) { if (el._parentNum && objMap[el._parentNum]) el.parent_id = objMap[el._parentNum]; else { const lo = [...els].reverse().find(e => e.element_type === "objective"); el.parent_id = lo?.id || visionId || null; } } });
      els.forEach(el => { delete el._num; delete el._parentNum; });
      localElements.push(...els);
    }
    await onCreate({ name: info.name, company: info.company || info.name, description: info.description, icon: info.icon, color: info.color, industry: info.industry, _localElements: localElements });
    setStep(0); setInfo({ name: "", company: "", industry: "", description: "", icon: "🎯", color: GOLD }); setAiMessages([]); setGeneratedElements([]); onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={step === 0 ? "New Strategy" : step === 1 ? "AI Strategy Builder" : "Review & Create"} wide={step > 0}>
      {step === 0 && (
        <div className="space-y-4">
          <div><label className={labelCls}>Strategy Name *</label><input value={info.name} onChange={e => setInfo(f => ({...f, name: e.target.value}))} placeholder="e.g., Growth Plan 2026" className={inputCls} /></div>
          <div><label className={labelCls}>Company / Product</label><input value={info.company} onChange={e => setInfo(f => ({...f, company: e.target.value}))} className={inputCls} /></div>
          <div><label className={labelCls}>Industry</label><input value={info.industry} onChange={e => setInfo(f => ({...f, industry: e.target.value}))} className={inputCls} /></div>
          <div><label className={labelCls}>Brief Description</label><textarea value={info.description} onChange={e => setInfo(f => ({...f, description: e.target.value}))} rows={2} className={`${inputCls} resize-none`} /></div>
          <div className="flex gap-6">
            <div><label className={labelCls}>Icon</label><div className="flex flex-wrap gap-1.5">{iconOpts.map(ic => <button key={ic} onClick={() => setInfo(f => ({...f, icon: ic}))} className={`w-9 h-9 rounded-lg text-base flex items-center justify-center transition ${info.icon===ic ? "bg-amber-500/20 border border-amber-500/40 scale-110" : "bg-[#0a1628]/60 border border-[#1e3a5f]"}`}>{ic}</button>)}</div></div>
            <div><label className={labelCls}>Color</label><div className="flex flex-wrap gap-1.5">{colorOpts.map(c => <button key={c} onClick={() => setInfo(f => ({...f, color: c}))} className={`w-7 h-7 rounded-full transition ${info.color===c ? "scale-125 ring-2 ring-white/30" : "hover:scale-110"}`} style={{ background: c }} />)}</div></div>
          </div>
          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">Cancel</button>
            <button onClick={startAISession} disabled={!info.name.trim()} className="px-5 py-2 rounded-lg text-sm font-semibold text-[#0a1628] disabled:opacity-40 transition-all hover:scale-[1.02]" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` }}>Next → Build with AI</button>
          </div>
        </div>
      )}
      {step === 1 && (
        <div className="flex flex-col" style={{ height: "60vh" }}>
          <div className="flex-1 overflow-y-auto space-y-3 pb-4 min-h-0">
            {aiMessages.map((m, i) => (<div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}><div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed ${m.role==="user"?"bg-amber-500/20 text-amber-100 rounded-br-md":m.error?"bg-red-500/10 text-red-300 rounded-bl-md border border-red-500/20":"bg-[#162544] text-gray-200 rounded-bl-md border border-[#1e3a5f]"}`}>{m.role==="ai"?<Markdown text={m.text}/>:<div className="whitespace-pre-wrap">{m.text}</div>}</div></div>))}
            {aiLoading && <div className="flex gap-1 px-4 py-2">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-amber-500/40 animate-bounce" style={{ animationDelay:`${i*0.15}s` }} />)}</div>}
            <div ref={endRef} />
          </div>
          {generatedElements.length > 0 && (<div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg" style={glass(0.3)}><span className="text-amber-400 text-xs">✓ {generatedElements.length} elements captured</span><div className="flex-1"/><button onClick={() => setStep(2)} className="text-xs px-3 py-1 rounded-md bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition">Review & Create →</button></div>)}
          {aiMessages.length >= 3 && generatedElements.length === 0 && (<div className="mb-2"><button onClick={askForStrategy} className="text-xs px-3 py-1.5 rounded-full border border-amber-500/30 text-amber-400/80 hover:bg-amber-500/10 transition">✨ Ask AI to generate the staircase now</button></div>)}
          <div className="shrink-0 flex gap-2 pt-2">
            <textarea value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => { if (e.key==="Enter"&&!e.shiftKey) { e.preventDefault(); sendToAI(); } }} placeholder="Describe your goals... (Shift+Enter for new line)" disabled={aiLoading} rows={2} className="flex-1 px-4 py-3 rounded-xl bg-[#0a1628]/60 border border-[#1e3a5f] text-white placeholder-gray-600 focus:border-amber-500/40 focus:outline-none transition text-sm resize-none" />
            <button onClick={sendToAI} disabled={aiLoading||!aiInput.trim()} className="px-5 py-3 rounded-xl font-medium text-sm disabled:opacity-30 transition-all hover:scale-105 self-end" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, color: DEEP }}>Send</button>
          </div>
          <div className="flex justify-between mt-3"><button onClick={() => setStep(0)} className="text-xs text-gray-500 hover:text-gray-300 transition">← Back</button><button onClick={() => setStep(2)} className="text-xs text-gray-500 hover:text-gray-300 transition">Skip AI → Create empty</button></div>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-xl" style={glass(0.4)}><span className="text-2xl">{info.icon}</span><div><div className="text-white font-semibold">{info.name}</div><div className="text-gray-500 text-xs">{info.company} {info.industry ? `· ${info.industry}` : ""}</div></div></div>
          {generatedElements.length > 0 ? (<div><label className={labelCls}>{generatedElements.length} elements will be created:</label><div className="max-h-60 overflow-y-auto space-y-1 p-3 rounded-lg" style={glass(0.3)}>{generatedElements.map((el,i) => (<div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded" style={{ borderLeft: `2px solid ${typeColors[el.element_type]||"#94a3b8"}` }}><span style={{ color: typeColors[el.element_type], fontSize: 12 }}>{typeIcons[el.element_type]}</span><span className="text-[10px] text-gray-500 uppercase w-16 shrink-0">{el.element_type.replace("_"," ")}</span><span className="text-sm text-gray-200 truncate">{el.title}</span><button onClick={() => setGeneratedElements(prev => prev.filter((_,j) => j!==i))} className="ml-auto text-gray-600 hover:text-red-400 text-xs shrink-0">✕</button></div>))}</div></div>) : (<div className="text-gray-500 text-sm text-center py-6">No elements generated. Add them manually after creation.</div>)}
          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}><button onClick={() => setStep(1)} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">← Back to AI</button><button onClick={finishWizard} className="px-5 py-2 rounded-lg text-sm font-semibold text-[#0a1628] transition-all hover:scale-[1.02]" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` }}>Create Strategy {generatedElements.length > 0 ? `(${generatedElements.length} el)` : ""}</button></div>
        </div>
      )}
    </Modal>
  );
};
