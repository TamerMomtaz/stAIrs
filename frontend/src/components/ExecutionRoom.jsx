import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import { GOLD, GOLD_L, TEAL, DEEP, BORDER, glass, typeColors, typeIcons } from "../constants";
import { HealthBadge } from "./SharedUI";
import { Markdown } from "./Markdown";

// ═══ EXECUTION ROOM ═══
export const ExecutionRoom = ({ stair, strategyContext, lang, onBack, onSaveNote }) => {
  const [actionPlan, setActionPlan] = useState(null);
  const [solutions, setSolutions] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [solLoading, setSolLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("plan");
  const chatEndRef = useRef(null);
  const isAr = lang === "ar";
  const color = typeColors[stair.element_type] || "#94a3b8";

  const stairCtx = `${stair.element_type} "${stair.title}" (code: ${stair.code || "N/A"}), health: ${stair.health || "unknown"}, progress: ${stair.progress_percent || 0}%. Description: ${stair.description || "None"}.`;
  const stratCtx = strategyContext ? `Strategy: "${strategyContext.name}" for "${strategyContext.company || strategyContext.name}". Industry: ${strategyContext.industry || "unspecified"}.` : "";
  const sourceRef = "When citing frameworks, books, or statistics, include a brief source reference.";

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    generateActionPlan();
    generateSolutions();
    setMessages([{ role: "ai", text: `Welcome to the Execution Room for **${stair.title}**.\n\nI have full context of your strategy and this specific step. Ask me anything about execution, risks, resources, timelines, or alternative approaches.`, ts: new Date().toISOString() }]);
  }, [stair.id]);

  const generateActionPlan = async () => {
    setPlanLoading(true);
    try {
      const prompt = `[${stratCtx}]\n\n${sourceRef}\n\nGenerate a detailed, actionable execution plan for: ${stairCtx}\n\nFormat your response EXACTLY as follows:\n\n## Action Plan\n\nFor each task, use this format:\n- **Task:** [task name]\n- **Owner:** [suggested role/team]\n- **Timeline:** [estimated duration]\n- **Priority:** [High/Medium/Low]\n- **Details:** [brief description of what needs to be done]\n\n---\n\n(Repeat for each task. Generate 5-8 concrete tasks. Make them specific, measurable, and directly related to executing this strategic element.)`;
      const res = await api.post("/api/v1/ai/chat", { message: prompt });
      setActionPlan(res.response);
      const parsed = parseTasks(res.response);
      setTasks(parsed);
    } catch (e) { setActionPlan(`Error generating plan: ${e.message}`); }
    setPlanLoading(false);
  };

  const generateSolutions = async () => {
    setSolLoading(true);
    try {
      const prompt = `[${stratCtx}]\n\n${sourceRef}\n\nProvide practical, specific solutions and recommendations for executing: ${stairCtx}\n\nInclude:\n## Solutions & Recommendations\n\n1. **Quick Wins** — Actions that can be taken immediately with minimal resources\n2. **Strategic Moves** — Medium-term initiatives that drive significant progress\n3. **Risk Mitigation** — Specific ways to address potential obstacles\n4. **Resource Optimization** — How to maximize impact with available resources\n5. **Success Metrics** — How to measure successful execution\n\nBe specific and practical. Provide concrete examples where possible.`;
      const res = await api.post("/api/v1/ai/chat", { message: prompt });
      setSolutions(res.response);
    } catch (e) { setSolutions(`Error generating solutions: ${e.message}`); }
    setSolLoading(false);
  };

  const parseTasks = (text) => {
    if (!text) return [];
    const taskBlocks = text.split(/---|\n(?=- \*\*Task:\*\*)/g).filter(b => b.includes("**Task:**"));
    return taskBlocks.map((block, i) => {
      const nameMatch = block.match(/\*\*Task:\*\*\s*(.+)/);
      const ownerMatch = block.match(/\*\*Owner:\*\*\s*(.+)/);
      const timeMatch = block.match(/\*\*Timeline:\*\*\s*(.+)/);
      const priorityMatch = block.match(/\*\*Priority:\*\*\s*(.+)/);
      const detailsMatch = block.match(/\*\*Details:\*\*\s*(.+)/);
      return {
        id: `task_${i}_${Date.now()}`,
        name: nameMatch?.[1]?.trim() || `Task ${i + 1}`,
        owner: ownerMatch?.[1]?.trim() || "TBD",
        timeline: timeMatch?.[1]?.trim() || "TBD",
        priority: priorityMatch?.[1]?.trim() || "Medium",
        details: detailsMatch?.[1]?.trim() || "",
        done: false,
      };
    });
  };

  const toggleTask = (id) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    const userMsg = { role: "user", text: msg, ts: new Date().toISOString() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setChatLoading(true);
    try {
      const contextMsg = `[${stratCtx} Currently in Execution Room for: ${stairCtx}]\n\nThe user has an action plan and solutions generated. They are asking follow-up questions about execution.\n\n${sourceRef}\n\n${msg}`;
      const res = await api.post("/api/v1/ai/chat", { message: contextMsg });
      const aiMsg = { role: "ai", text: res.response, tokens: res.tokens_used, ts: new Date().toISOString() };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "ai", text: `Error: ${e.message}`, error: true, ts: new Date().toISOString() }]);
    }
    setChatLoading(false);
  };

  const exportPlan = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const priorityColor = p => ({ High: "#dc2626", Medium: "#d97706", Low: "#059669" }[p] || "#64748b");
    const taskRows = tasks.map((t, i) => `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:10px 8px;text-align:center;vertical-align:middle;font-size:16px">${t.done ? "&#9745;" : "&#9744;"}</td>
        <td style="padding:10px 8px;vertical-align:top">
          <div style="font-weight:600;color:#1e293b;font-size:13px">${t.name}</div>
          ${t.details ? `<div style="color:#64748b;font-size:11px;margin-top:2px">${t.details}</div>` : ""}
        </td>
        <td style="padding:10px 8px;text-align:center;vertical-align:middle;font-size:12px;color:#475569">${t.owner}</td>
        <td style="padding:10px 8px;text-align:center;vertical-align:middle;font-size:12px;color:#475569">${t.timeline}</td>
        <td style="padding:10px 8px;text-align:center;vertical-align:middle">
          <span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;color:white;background:${priorityColor(t.priority)}">${t.priority}</span>
        </td>
      </tr>`).join("");
    const completedCount = tasks.filter(t => t.done).length;
    const chatInsights = messages.filter(m => m.role === "ai" && !m.text.startsWith("Welcome")).map(m => `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:8px"><div style="font-size:12px;color:#64748b;margin-bottom:4px">AI Insight</div><div style="font-size:13px;color:#334155;white-space:pre-wrap">${m.text.replace(/\*\*/g, "").replace(/##\s/g, "").slice(0, 500)}${m.text.length > 500 ? "..." : ""}</div></div>`).join("");
    w.document.write(`<!DOCTYPE html><html><head><title>Execution Plan - ${stair.title}</title>
      <style>@page{margin:20mm 15mm}*{box-sizing:border-box;margin:0;padding:0}body{background:#fff;color:#1e293b;font-family:'Segoe UI',system-ui,sans-serif;line-height:1.5}.header{padding-bottom:16px;border-bottom:2px solid #B8904A;margin-bottom:20px}table{width:100%;border-collapse:collapse}thead th{text-align:left;padding:10px 8px;border-bottom:2px solid #B8904A;color:#B8904A;font-size:11px;text-transform:uppercase;font-weight:600}.section{margin-top:24px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;color:#B8904A;font-size:16px;font-weight:700}.footer{text-align:center;margin-top:30px;padding-top:16px;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:10px}</style></head><body>
      <div class="header">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px"><span style="font-size:28px">${strategyContext?.icon || "🎯"}</span><div><h1 style="font-size:24px;font-weight:700;margin:0">${strategyContext?.name || "Strategy"}</h1><div style="font-size:12px;color:#64748b">${strategyContext?.company || ""} &middot; Exported ${new Date().toLocaleDateString()}</div></div></div>
        <div style="margin-top:12px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11px;color:#B8904A;text-transform:uppercase;font-weight:600;margin-bottom:4px">Execution Room: ${stair.element_type?.replace("_", " ")}</div>
          <div style="font-size:16px;font-weight:700;color:#1e293b">${stair.code ? `<span style="color:#94a3b8;font-family:monospace;font-size:12px">${stair.code}</span> ` : ""}${stair.title}</div>
          ${stair.description ? `<div style="font-size:12px;color:#64748b;margin-top:4px">${stair.description}</div>` : ""}
          <div style="margin-top:8px;font-size:12px"><span style="color:#475569">Health:</span> ${stair.health || "N/A"} &nbsp;|&nbsp; <span style="color:#475569">Progress:</span> ${stair.progress_percent || 0}% &nbsp;|&nbsp; <span style="color:#475569">Tasks:</span> ${completedCount}/${tasks.length} completed</div>
        </div>
      </div>
      <div class="section">Action Plan</div>
      <table><thead><tr><th style="width:40px;text-align:center">Done</th><th>Task</th><th style="text-align:center">Owner</th><th style="text-align:center">Timeline</th><th style="text-align:center">Priority</th></tr></thead><tbody>${taskRows}</tbody></table>
      ${solutions ? `<div class="section">Solutions &amp; Recommendations</div><div style="font-size:13px;color:#334155;white-space:pre-wrap">${solutions.replace(/\*\*/g, "").replace(/##\s/g, "").replace(/\n/g, "<br>")}</div>` : ""}
      ${chatInsights ? `<div class="section">Chat Insights</div>${chatInsights}` : ""}
      <div class="footer">ST.AIRS v3.6.0 &middot; Execution Room Export &middot; By DEVONEERS &middot; "Human IS the Loop"</div></body></html>`);
    w.document.close();
    w.print();
  };

  const LoadingDots = ({ label }) => (
    <div className="flex items-center gap-2 py-6 justify-center">
      <div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-amber-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
      <span className="text-gray-500 text-xs">{label}</span>
    </div>
  );

  const PriorityBadge = ({ priority }) => {
    const c = { High: "bg-red-500/20 text-red-300 border-red-500/30", Medium: "bg-amber-500/20 text-amber-300 border-amber-500/30", Low: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" };
    return <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${c[priority] || c.Medium}`}>{priority}</span>;
  };

  const tabs = [
    { key: "plan", icon: "📋", label: isAr ? "خطة العمل" : "Action Plan" },
    { key: "solutions", icon: "💡", label: isAr ? "الحلول" : "Solutions" },
    { key: "chat", icon: "💬", label: isAr ? "المحادثة" : "Chat" },
  ];

  return (
    <div className="fixed inset-0 z-[90] flex flex-col" style={{ background: `linear-gradient(180deg, ${DEEP} 0%, #0f1f3a 50%, ${DEEP} 100%)` }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 transition group" title={isAr ? "رجوع" : "Back to Staircase"}>
            <span className="text-lg group-hover:-translate-x-0.5 transition-transform">←</span>
            <span className="text-sm font-medium">{isAr ? "رجوع" : "Back"}</span>
          </button>
          <span className="text-gray-600">|</span>
          <span style={{ color, fontSize: 16 }}>{typeIcons[stair.element_type] || "•"}</span>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color }}>{stair.element_type?.replace("_", " ")}</div>
            <div className="text-white text-sm font-medium truncate">{stair.code && <span className="text-gray-500 font-mono text-xs mr-1.5">{stair.code}</span>}{stair.title}</div>
          </div>
          <HealthBadge health={stair.health} />
          <div className="text-xs font-medium" style={{ color }}>{stair.progress_percent || 0}%</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportPlan} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:scale-[1.02]" style={{ borderColor: `${GOLD}60`, color: GOLD, background: `${GOLD}15` }}>
            ↓ {isAr ? "تصدير" : "Export Plan"}
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="flex items-center gap-1 px-6 py-2 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${activeTab === t.key ? "bg-amber-500/15 text-amber-300 border border-amber-500/20" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
            {t.icon} {t.label}
          </button>
        ))}
        <div className="flex-1" />
        {strategyContext && <span className="text-xs text-gray-600">{strategyContext.icon} {strategyContext.name}</span>}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {/* Action Plan Tab */}
        {activeTab === "plan" && (
          <div className="h-full overflow-y-auto px-6 py-5 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">{isAr ? "خطة العمل" : "Action Plan"}</h2>
              <div className="flex items-center gap-3">
                {tasks.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {tasks.filter(t => t.done).length}/{tasks.length} {isAr ? "مكتمل" : "completed"}
                  </span>
                )}
                <button onClick={generateActionPlan} disabled={planLoading} className="text-xs text-amber-400/70 hover:text-amber-400 transition px-2 py-1 rounded hover:bg-amber-500/10">
                  {planLoading ? "..." : `↻ ${isAr ? "تجديد" : "Regenerate"}`}
                </button>
              </div>
            </div>

            {planLoading && !actionPlan ? (
              <LoadingDots label={isAr ? "جاري إنشاء خطة العمل..." : "Generating action plan..."} />
            ) : tasks.length > 0 ? (
              <div className="space-y-2">
                {tasks.map(t => (
                  <div key={t.id} className={`rounded-xl p-4 transition-all ${t.done ? "opacity-60" : ""}`} style={glass(0.4)}>
                    <div className="flex items-start gap-3">
                      <button onClick={() => toggleTask(t.id)} className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition ${t.done ? "bg-emerald-500/30 border-emerald-500/50 text-emerald-300" : "border-gray-600 hover:border-amber-500/50"}`}>
                        {t.done && <span className="text-xs">✓</span>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${t.done ? "line-through text-gray-500" : "text-white"}`}>{t.name}</span>
                          <PriorityBadge priority={t.priority} />
                        </div>
                        {t.details && <div className="text-gray-400 text-xs mt-1">{t.details}</div>}
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-[10px] text-gray-600">
                            <span className="text-gray-500">👤</span> {t.owner}
                          </span>
                          <span className="text-[10px] text-gray-600">
                            <span className="text-gray-500">⏱</span> {t.timeline}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : actionPlan ? (
              <div className="rounded-xl p-4" style={glass(0.4)}>
                <Markdown text={actionPlan} />
              </div>
            ) : null}

            {tasks.length > 0 && (
              <div className="mt-4 flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-[#1e3a5f] overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${tasks.length ? (tasks.filter(t => t.done).length / tasks.length) * 100 : 0}%` }} />
                </div>
                <span className="text-xs text-gray-500">{Math.round(tasks.length ? (tasks.filter(t => t.done).length / tasks.length) * 100 : 0)}%</span>
              </div>
            )}

            {actionPlan && onSaveNote && (
              <div className="mt-4">
                <button onClick={() => onSaveNote(`📋 Action Plan: ${stair.title}`, actionPlan, "execution_plan")} className="text-xs text-gray-600 hover:text-amber-400 transition px-2 py-1 rounded hover:bg-amber-500/10">
                  📌 {isAr ? "حفظ في الملاحظات" : "Save to Notes"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Solutions Tab */}
        {activeTab === "solutions" && (
          <div className="h-full overflow-y-auto px-6 py-5 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">{isAr ? "الحلول والتوصيات" : "Solutions & Recommendations"}</h2>
              <button onClick={generateSolutions} disabled={solLoading} className="text-xs text-amber-400/70 hover:text-amber-400 transition px-2 py-1 rounded hover:bg-amber-500/10">
                {solLoading ? "..." : `↻ ${isAr ? "تجديد" : "Regenerate"}`}
              </button>
            </div>

            {solLoading && !solutions ? (
              <LoadingDots label={isAr ? "جاري إنشاء الحلول..." : "Generating solutions..."} />
            ) : solutions ? (
              <div className="rounded-xl p-5" style={glass(0.4)}>
                <Markdown text={solutions} />
              </div>
            ) : null}

            {solutions && onSaveNote && (
              <div className="mt-4">
                <button onClick={() => onSaveNote(`💡 Solutions: ${stair.title}`, solutions, "execution_solutions")} className="text-xs text-gray-600 hover:text-amber-400 transition px-2 py-1 rounded hover:bg-amber-500/10">
                  📌 {isAr ? "حفظ في الملاحظات" : "Save to Notes"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Chat Tab */}
        {activeTab === "chat" && (
          <div className="h-full flex flex-col px-6 py-4 max-w-5xl mx-auto">
            <div className="flex-1 overflow-y-auto space-y-3 pb-4 min-h-0">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`group/msg relative max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-amber-500/20 text-amber-100 rounded-br-md"
                      : m.error
                        ? "bg-red-500/10 text-red-300 rounded-bl-md border border-red-500/20"
                        : "bg-[#162544] text-gray-200 rounded-bl-md border border-[#1e3a5f]"
                  }`}>
                    {m.role === "ai" ? <Markdown text={m.text} /> : <div className="whitespace-pre-wrap">{m.text}</div>}
                    {m.role === "ai" && !m.error && (
                      <div className="flex items-center gap-2 mt-2">
                        {m.tokens > 0 && <span className="text-[10px] text-gray-600">{m.tokens} tokens</span>}
                        <div className="flex-1" />
                        {onSaveNote && <button onClick={() => onSaveNote(m.text.slice(0, 60), m.text, "execution_chat")} className="opacity-0 group-hover/msg:opacity-100 text-[10px] text-gray-600 hover:text-amber-400 transition px-1.5 py-0.5 rounded hover:bg-amber-500/10" title="Save to Notes">📌 Save</button>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex gap-1 px-4 py-2">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-amber-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
              )}
              <div ref={chatEndRef} />
            </div>

            {messages.length <= 1 && (
              <div className="shrink-0 flex flex-wrap gap-2 mb-3">
                {(isAr
                  ? ["ما هي المخاطر المحتملة؟", "كيف أقيس النجاح؟", "ما الموارد المطلوبة؟"]
                  : ["What resources do I need?", "What are the key risks?", "How do I measure success?", "Suggest alternative approaches"]
                ).map((q, i) => (
                  <button key={i} onClick={() => setChatInput(q)} className="text-xs px-3 py-1.5 rounded-full border border-amber-500/20 text-amber-400/70 hover:bg-amber-500/10 transition">{q}</button>
                ))}
              </div>
            )}

            <div className="shrink-0 flex gap-2">
              <textarea
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder={isAr ? "اسأل عن تنفيذ هذه الخطوة..." : "Ask about executing this step... (Shift+Enter for new line)"}
                disabled={chatLoading}
                rows={3}
                className="flex-1 px-4 py-3 rounded-xl bg-[#0a1628]/60 border border-[#1e3a5f] text-white placeholder-gray-600 focus:border-amber-500/40 focus:outline-none transition text-sm resize-none"
              />
              <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()} className="px-5 py-3 rounded-xl font-medium text-sm disabled:opacity-30 transition-all hover:scale-105 self-end" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, color: DEEP }}>
                {isAr ? "إرسال" : "Send"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
