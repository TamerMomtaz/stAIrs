import { useState, useEffect, useRef } from "react";
import { api, ConvStore } from "../api";
import { GOLD, GOLD_L, DEEP, BORDER, glass } from "../constants";
import { Markdown } from "./Markdown";
import { LoadMatrixButtons } from "./StrategyMatrixToolkit";
import { buildHeader, openExportWindow } from "../exportUtils";

export const AIChatView = ({ lang, userId, strategyContext, onSaveNote, onMatrixClick }) => {
  const storeRef = useRef(null); if (!storeRef.current && userId) storeRef.current = new ConvStore(userId); const store = storeRef.current;
  const [convs, setConvs] = useState([]); const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]); const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false); const [retryMsg, setRetryMsg] = useState(null); const [showHist, setShowHist] = useState(false);
  const endRef = useRef(null); const isAr = lang === "ar";
  useEffect(() => { if (!store) return; const cs = store.list(); setConvs(cs); const aid = store.activeId(); if (aid&&cs.find(c => c.id===aid)) { setActiveId(aid); setMessages(store.msgs(aid)); } else if (cs.length>0) { setActiveId(cs[0].id); setMessages(store.msgs(cs[0].id)); } }, [store]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  const welcomeText = strategyContext ? `I'm the ST.AIRS Strategy Advisor for **${strategyContext.name}** (${strategyContext.company||""}).\n\nI can analyze risks, suggest improvements, and generate strategic elements.` : "Welcome! I'm the ST.AIRS Strategy Advisor.";
  const welc = () => ({ role: "ai", text: welcomeText, ts: new Date().toISOString() });
  const newChat = () => { if (!store) return; const c = store.create("New"); store.saveMsgs(c.id,[welc()]); store.setActive(c.id); setActiveId(c.id); setMessages([welc()]); setConvs(store.list()); };
  const loadConv = (id) => { if (!store) return; store.setActive(id); setActiveId(id); setMessages(store.msgs(id)); setShowHist(false); };
  const delConv = (id) => { if (!store) return; store.remove(id); const rem = store.list(); setConvs(rem); if (id===activeId) { if (rem.length>0) loadConv(rem[0].id); else { setActiveId(null); setMessages([]); } } };
  const send = async () => {
    if (!input.trim()||loading) return; const msg = input.trim(); setInput(""); let cid = activeId;
    if (!cid&&store) { const c = store.create(msg.slice(0,50)); store.saveMsgs(c.id,[welc()]); store.setActive(c.id); cid=c.id; setActiveId(c.id); setConvs(store.list()); setMessages([welc()]); }
    const srcRule = "When citing frameworks, books, or statistics, include a brief source reference.";
    let contextMsg = strategyContext ? `[CONTEXT: Strategy "${strategyContext.name}" for "${strategyContext.company||strategyContext.name}"${strategyContext.industry?`, industry: ${strategyContext.industry}`:""}. ${srcRule}]\n\n${msg}` : `[${srcRule}]\n\n${msg}`;
    const userMsg = { role: "user", text: msg, ts: new Date().toISOString() }; const newMsgs = [...messages, userMsg]; setMessages(newMsgs); if (store&&cid) store.saveMsgs(cid,newMsgs); setLoading(true);
    try {
      const res = await api.aiPost("/api/v1/ai/chat", { message: contextMsg }, (attempt, max) => setRetryMsg(`AI is thinking... retrying (${attempt}/${max})`));
      setRetryMsg(null);
      const aiMsg = { role: "ai", text: res.response, tokens: res.tokens_used, provider_display: res.provider_display || null, ts: new Date().toISOString() }; const final = [...newMsgs, aiMsg]; setMessages(final);
      if (store&&cid) { store.saveMsgs(cid,final); const conv = store.list().find(c => c.id===cid); if (conv) { if (conv.title==="New") conv.title=msg.slice(0,60); conv.updated_at=new Date().toISOString(); conv.count=final.length; store.save(conv); setConvs(store.list()); } }
    } catch (e) { setRetryMsg(null); const err = { role: "ai", text: `⚠️ ${e.message}`, error: true, ts: new Date().toISOString() }; const final = [...newMsgs, err]; setMessages(final); if (store&&cid) store.saveMsgs(cid,final); }
    setLoading(false);
  };
  const exportConversation = () => {
    if (messages.length <= 1) return;
    const msgHtml = messages.map(m => {
      if (m.role === "user") return `<div class="chat-msg user"><div class="role" style="color:#B8904A">You</div><div class="text">${m.text}</div></div>`;
      const cleaned = m.text.replace(/\*\*/g, "").replace(/##\s/g, "").replace(/\n/g, "<br>");
      return `<div class="chat-msg ai"><div class="role" style="color:#0369a1">AI Advisor${m.provider_display ? ` · ${m.provider_display}` : ""}${m.tokens ? ` · ${m.tokens} tokens` : ""}</div><div class="text">${cleaned}</div></div>`;
    }).join("");
    const convTitle = activeConv?.title || "AI Conversation";
    const body = `${buildHeader(strategyContext, "AI Chat Export")}
      <div class="section">🤖 ${convTitle}</div>
      <p style="font-size:12px;color:#64748b;margin-bottom:16px">${messages.length} messages · Exported ${new Date().toLocaleDateString()}</p>
      ${msgHtml}`;
    openExportWindow(`AI Chat — ${convTitle}`, body);
  };
  const quicks = isAr ? ["ما هي أكبر المخاطر؟","اقترح تحسينات"] : ["What are the biggest risks?","Suggest improvements","Generate KRs for objectives"];
  const activeConv = convs.find(c => c.id===activeId);
  return (
    <div className="flex h-[calc(100vh-180px)] gap-3">
      <div className={`${showHist?"w-60 opacity-100":"w-0 opacity-0 overflow-hidden"} transition-all duration-300 flex flex-col rounded-xl shrink-0`} style={glass(0.5)}>
        <div className="flex items-center justify-between px-3 py-3" style={{ borderBottom:`1px solid ${BORDER}` }}><span className="text-xs text-gray-400 uppercase tracking-wider">{isAr?"السجل":"History"}</span><button onClick={newChat} className="text-xs text-amber-400 hover:bg-amber-500/10 px-2 py-1 rounded transition">+ {isAr?"جديد":"New"}</button></div>
        <div className="flex-1 overflow-y-auto py-1">{convs.map(c => <div key={c.id} className={`group px-3 py-2 mx-1 my-0.5 rounded-lg cursor-pointer transition ${c.id===activeId?"bg-amber-500/10 border border-amber-500/20":"hover:bg-white/5 border border-transparent"}`} onClick={() => loadConv(c.id)}><div className="flex items-start justify-between gap-2"><div className="text-sm text-white truncate flex-1">{c.title}</div><button onClick={e => {e.stopPropagation();delConv(c.id);}} className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 text-xs transition">✕</button></div></div>)}</div>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setShowHist(!showHist)} className={`p-2 rounded-lg transition ${showHist?"bg-amber-500/15 text-amber-400":"text-gray-500 hover:text-gray-300"}`}><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="12" width="14" height="2" rx="1"/></svg></button>
          {activeConv && <span className="text-sm text-gray-400 truncate">{activeConv.title}</span>}<div className="flex-1"/>
          {messages.length > 1 && <button onClick={exportConversation} className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 transition" style={{ border: `1px solid ${BORDER}` }}>↓ {isAr ? "تصدير" : "Export"}</button>}
          <button onClick={newChat} className="text-xs px-3 py-1.5 rounded-lg text-amber-400/70 border border-amber-500/20 hover:bg-amber-500/10 transition">+ {isAr?"محادثة جديدة":"New Chat"}</button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 pb-4 px-1 min-h-0">
          {messages.length===0 && <div className="text-gray-600 text-center py-12 text-sm">{isAr?"ابدأ محادثة جديدة":"Start a new conversation"}</div>}
          {messages.map((m,i) => <div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}><div className={`group/msg relative max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed ${m.role==="user"?"bg-amber-500/20 text-amber-100 rounded-br-md":m.error?"bg-red-500/10 text-red-300 rounded-bl-md border border-red-500/20":"bg-[#162544] text-gray-200 rounded-bl-md border border-[#1e3a5f]"}`}>{m.role==="ai"?<><Markdown text={m.text} onMatrixClick={onMatrixClick}/><LoadMatrixButtons text={m.text} onLoadMatrix={onMatrixClick}/></>:<div className="whitespace-pre-wrap">{m.text}</div>}{m.role==="ai"&&!m.error&&<div className="flex items-center gap-2 mt-2">{m.provider_display&&<span className="text-[10px] text-gray-500 bg-gray-700/30 px-1.5 py-0.5 rounded">⚡ {m.provider_display}</span>}{m.tokens>0&&<span className="text-[10px] text-gray-600">{m.tokens} tokens</span>}<div className="flex-1"/>{onSaveNote&&<button onClick={() => onSaveNote(m.text.slice(0,60), m.text, "ai_chat")} className="opacity-0 group-hover/msg:opacity-100 text-[10px] text-gray-600 hover:text-amber-400 transition px-1.5 py-0.5 rounded hover:bg-amber-500/10" title="Save to Notes">📌 Save</button>}</div>}</div></div>)}
          {loading && <div className="flex items-center gap-2 px-4 py-2">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-amber-500/40 animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}{retryMsg && <span className="text-amber-400/80 text-xs ml-1">{retryMsg}</span>}</div>}
          <div ref={endRef}/>
        </div>
        {messages.length<=1 && <div className="shrink-0 flex flex-wrap gap-2 mb-3">{quicks.map((q,i) => <button key={i} onClick={() => setInput(q)} className="text-xs px-3 py-1.5 rounded-full border border-amber-500/20 text-amber-400/70 hover:bg-amber-500/10 transition">{q}</button>)}</div>}
        <div className="shrink-0 flex gap-2">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key==="Enter"&&!e.shiftKey) { e.preventDefault(); send(); } }} placeholder={isAr?"اسأل المستشار... (Shift+Enter لسطر جديد)":"Ask the strategy AI... (Shift+Enter for new line)"} disabled={loading} rows={3} className="flex-1 px-4 py-3 rounded-xl bg-[#0a1628]/60 border border-[#1e3a5f] text-white placeholder-gray-600 focus:border-amber-500/40 focus:outline-none transition text-sm resize-none" />
          <button onClick={send} disabled={loading||!input.trim()} className="px-5 py-3 rounded-xl font-medium text-sm disabled:opacity-30 transition-all hover:scale-105 self-end" style={{ background:`linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, color:DEEP }}>{isAr?"إرسال":"Send"}</button>
        </div>
      </div>
    </div>
  );
};
