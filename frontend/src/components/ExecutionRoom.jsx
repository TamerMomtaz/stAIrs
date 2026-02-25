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
  const [actionChatTaskId, setActionChatTaskId] = useState(null);
  const [actionChats, setActionChats] = useState({});
  const [actionChatInput, setActionChatInput] = useState("");
  const [actionChatLoading, setActionChatLoading] = useState(false);
  const actionChatEndRef = useRef(null);
  const [customPlan, setCustomPlan] = useState(null);
  const [customTasks, setCustomTasks] = useState([]);
  const [customPlanLoading, setCustomPlanLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const isAr = lang === "ar";
  const color = typeColors[stair.element_type] || "#94a3b8";

  const stairCtx = `${stair.element_type} "${stair.title}" (code: ${stair.code || "N/A"}), health: ${stair.health || "unknown"}, progress: ${stair.progress_percent || 0}%. Description: ${stair.description || "None"}.`;
  const stratCtx = strategyContext ? `Strategy: "${strategyContext.name}" for "${strategyContext.company || strategyContext.name}". Industry: ${strategyContext.industry || "unspecified"}.` : "";
  const sourceRef = "When citing frameworks, books, or statistics, include a brief source reference.";

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { actionChatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [actionChats, actionChatTaskId]);

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

  const toggleActionChat = (task) => {
    if (actionChatTaskId === task.id) {
      setActionChatTaskId(null);
      setActionChatInput("");
      return;
    }
    setActionChatTaskId(task.id);
    setActionChatInput("");
    if (!actionChats[task.id]) {
      setActionChats(prev => ({
        ...prev,
        [task.id]: [{
          role: "ai",
          text: isAr
            ? `دعنا نقيّم قدرتك على تنفيذ: **${task.name}**\n\nهل تستطيع تنفيذ هذا الإجراء:\n- **بالكامل** — لديك كل ما تحتاجه\n- **جزئياً** — بعض المتطلبات متوفرة\n- **لا أستطيع حالياً** — توجد عوائق\n\nأخبرني أيضاً عن أي قيود تواجهها (ميزانية، وقت، فريق، أدوات، صلاحيات).`
            : `Let's assess your ability to execute: **${task.name}**\n\nCan you carry out this action:\n- **Fully** — you have everything needed\n- **Partially** — some requirements are in place\n- **Not currently** — there are blockers\n\nAlso tell me about any constraints you're facing (budget, time, team, tools, permissions).`,
          ts: new Date().toISOString(),
        }],
      }));
    }
  };

  const sendActionChat = async (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!actionChatInput.trim() || actionChatLoading || !task) return;
    const msg = actionChatInput.trim();
    setActionChatInput("");
    const userMsg = { role: "user", text: msg, ts: new Date().toISOString() };
    setActionChats(prev => ({ ...prev, [taskId]: [...(prev[taskId] || []), userMsg] }));
    setActionChatLoading(true);
    try {
      const history = (actionChats[taskId] || []).map(m => `${m.role === "user" ? "User" : "AI"}: ${m.text}`).join("\n\n");
      const contextMsg = `[${stratCtx} Execution Room for: ${stairCtx}]\n\nThe user is assessing their ability to execute this specific action item:\n- Task: ${task.name}\n- Owner: ${task.owner}\n- Timeline: ${task.timeline}\n- Priority: ${task.priority}\n- Details: ${task.details}\n\nYour role: Help the user honestly assess how far they can go with this action. Ask clarifying questions about their constraints (budget, time, skills, tools, authority). If they can only do it partially, help them identify what portion is achievable and what needs external help or resources. Be practical and specific.\n\nConversation so far:\n${history}\n\nUser: ${msg}`;
      const res = await api.post("/api/v1/ai/chat", { message: contextMsg });
      const aiMsg = { role: "ai", text: res.response, tokens: res.tokens_used, ts: new Date().toISOString() };
      setActionChats(prev => ({ ...prev, [taskId]: [...(prev[taskId] || []), aiMsg] }));
    } catch (e) {
      setActionChats(prev => ({ ...prev, [taskId]: [...(prev[taskId] || []), { role: "ai", text: `Error: ${e.message}`, error: true, ts: new Date().toISOString() }] }));
    }
    setActionChatLoading(false);
  };

  const collectAllFeedback = () => {
    const feedbackEntries = [];
    for (const task of tasks) {
      const chat = actionChats[task.id];
      if (!chat || chat.length <= 1) continue;
      const userMessages = chat.filter(m => m.role === "user").map(m => m.text);
      const aiMessages = chat.filter(m => m.role === "ai" && chat.indexOf(m) > 0).map(m => m.text);
      if (userMessages.length > 0) {
        feedbackEntries.push({
          taskName: task.name,
          priority: task.priority,
          userFeedback: userMessages,
          aiAssessment: aiMessages,
        });
      }
    }
    return feedbackEntries;
  };

  const hasFeedback = () => {
    return tasks.some(t => {
      const chat = actionChats[t.id];
      return chat && chat.length > 1 && chat.some(m => m.role === "user");
    });
  };

  const generateCustomPlan = async () => {
    setCustomPlanLoading(true);
    try {
      const feedback = collectAllFeedback();
      const feedbackSummary = feedback.map(f =>
        `Task: "${f.taskName}" (${f.priority} priority)\n  User said: ${f.userFeedback.join(" | ")}\n  AI assessed: ${f.aiAssessment.map(a => a.slice(0, 300)).join(" | ")}`
      ).join("\n\n");
      const originalTasksSummary = tasks.map(t =>
        `- ${t.name} [${t.priority}] — ${t.details} (Owner: ${t.owner}, Timeline: ${t.timeline})${t.done ? " [COMPLETED]" : ""}`
      ).join("\n");
      const prompt = `[${stratCtx}]\n\n${sourceRef}\n\nYou previously generated an action plan for: ${stairCtx}\n\nOriginal tasks:\n${originalTasksSummary}\n\nThe user has provided feedback on their ability to execute these tasks. Here is all their feedback:\n\n${feedbackSummary}\n\nBased on this feedback, generate a NEW customized action plan that:\n1. Adapts tasks to the user's actual capabilities and constraints\n2. Breaks down tasks the user can only partially do into achievable sub-steps\n3. Suggests alternatives for tasks the user cannot currently do\n4. Prioritizes tasks the user CAN do to build momentum\n5. Adds specific workarounds for the constraints they mentioned\n\nFormat your response EXACTLY as follows:\n\n## Your Customized Action Plan\n\nFor each task, use this format:\n- **Task:** [task name]\n- **Owner:** [suggested role/team]\n- **Timeline:** [estimated duration]\n- **Priority:** [High/Medium/Low]\n- **Details:** [brief description tailored to the user's constraints and abilities]\n\n---\n\n(Repeat for each task. Generate 5-8 concrete tasks. Make them realistic based on what the user told you they can and cannot do.)`;
      const res = await api.post("/api/v1/ai/chat", { message: prompt });
      setCustomPlan(res.response);
      setCustomTasks(parseTasks(res.response));
    } catch (e) { setCustomPlan(`Error generating customized plan: ${e.message}`); }
    setCustomPlanLoading(false);
  };

  const toggleCustomTask = (id) => {
    setCustomTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  const exportPlan = (mode) => {
    setShowExportModal(false);
    const w = window.open("", "_blank");
    if (!w) return;
    const priorityColor = p => ({ High: "#dc2626", Medium: "#d97706", Low: "#059669" }[p] || "#64748b");
    const buildTaskRows = (taskList) => taskList.map(t => `
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
    const buildTaskTable = (taskList) => `<table><thead><tr><th style="width:40px;text-align:center">Done</th><th>Task</th><th style="text-align:center">Owner</th><th style="text-align:center">Timeline</th><th style="text-align:center">Priority</th></tr></thead><tbody>${buildTaskRows(taskList)}</tbody></table>`;
    const buildProgress = (taskList) => {
      const done = taskList.filter(t => t.done).length;
      const total = taskList.length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      return `<div style="margin-top:12px;display:flex;align-items:center;gap:10px"><div style="flex:1;height:8px;border-radius:4px;background:#e5e7eb;overflow:hidden"><div style="height:100%;border-radius:4px;background:#B8904A;width:${pct}%"></div></div><span style="font-size:12px;color:#64748b">${done}/${total} completed (${pct}%)</span></div>`;
    };
    const buildFeedbackNotes = () => {
      const entries = [];
      for (const task of tasks) {
        const chat = actionChats[task.id];
        if (!chat || chat.length <= 1) continue;
        const userMsgs = chat.filter(m => m.role === "user").map(m => m.text);
        const aiMsgs = chat.filter((m, i) => m.role === "ai" && i > 0).map(m => m.text);
        if (userMsgs.length > 0) entries.push({ taskName: task.name, priority: task.priority, userMsgs, aiMsgs });
      }
      if (entries.length === 0) return "";
      const feedbackHtml = entries.map(e => `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:10px">
          <div style="font-weight:600;font-size:13px;color:#1e293b;margin-bottom:6px">${e.taskName} <span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:600;color:white;background:${priorityColor(e.priority)};vertical-align:middle;margin-left:6px">${e.priority}</span></div>
          ${e.userMsgs.map(m => `<div style="font-size:12px;color:#475569;margin-bottom:4px"><span style="color:#B8904A;font-weight:600">User:</span> ${m}</div>`).join("")}
          ${e.aiMsgs.map(m => `<div style="font-size:12px;color:#475569;margin-bottom:4px"><span style="color:#0d9488;font-weight:600">AI Assessment:</span> ${m.replace(/\*\*/g, "").slice(0, 400)}${m.length > 400 ? "..." : ""}</div>`).join("")}
        </div>`).join("");
      return `<div class="section">Feedback Notes</div>${feedbackHtml}`;
    };
    const chatInsights = messages.filter(m => m.role === "ai" && !m.text.startsWith("Welcome")).map(m => `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:8px"><div style="font-size:12px;color:#64748b;margin-bottom:4px">AI Insight</div><div style="font-size:13px;color:#334155;white-space:pre-wrap">${m.text.replace(/\*\*/g, "").replace(/##\s/g, "").slice(0, 500)}${m.text.length > 500 ? "..." : ""}</div></div>`).join("");
    const titleMap = { recommended: "Recommended Action Plan", customized: "Customized Action Plan", both: "Action Plan Comparison" };

    let bodyContent = "";
    if (mode === "recommended") {
      bodyContent = `
        <div class="section">Recommended Action Plan</div>
        ${buildTaskTable(tasks)}
        ${buildProgress(tasks)}
        ${buildFeedbackNotes()}
        ${solutions ? `<div class="section">Solutions &amp; Recommendations</div><div style="font-size:13px;color:#334155;white-space:pre-wrap">${solutions.replace(/\*\*/g, "").replace(/##\s/g, "").replace(/\n/g, "<br>")}</div>` : ""}
        ${chatInsights ? `<div class="section">Chat Insights</div>${chatInsights}` : ""}`;
    } else if (mode === "customized") {
      bodyContent = `
        <div class="section" style="color:#B8904A">&#10024; Customized Action Plan</div>
        <p style="font-size:12px;color:#64748b;margin-bottom:12px">Tailored based on your feedback about capabilities and constraints.</p>
        ${buildTaskTable(customTasks)}
        ${buildProgress(customTasks)}
        ${buildFeedbackNotes()}
        ${chatInsights ? `<div class="section">Chat Insights</div>${chatInsights}` : ""}`;
    } else {
      bodyContent = `
        <div class="section">Action Plan Comparison</div>
        <div style="display:flex;gap:20px;margin-top:16px">
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:700;color:#1e293b;padding-bottom:8px;border-bottom:2px solid #475569;margin-bottom:12px">Recommended Action Plan</div>
            ${buildTaskTable(tasks)}
            ${buildProgress(tasks)}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:700;color:#B8904A;padding-bottom:8px;border-bottom:2px solid #B8904A;margin-bottom:12px">&#10024; Customized Action Plan</div>
            <p style="font-size:11px;color:#64748b;margin-bottom:8px">Tailored to your capabilities and constraints.</p>
            ${buildTaskTable(customTasks)}
            ${buildProgress(customTasks)}
          </div>
        </div>
        ${buildFeedbackNotes()}
        ${solutions ? `<div class="section">Solutions &amp; Recommendations</div><div style="font-size:13px;color:#334155;white-space:pre-wrap">${solutions.replace(/\*\*/g, "").replace(/##\s/g, "").replace(/\n/g, "<br>")}</div>` : ""}
        ${chatInsights ? `<div class="section">Chat Insights</div>${chatInsights}` : ""}`;
    }

    w.document.write(`<!DOCTYPE html><html><head><title>${titleMap[mode]} - ${stair.title}</title>
      <style>@page{margin:20mm 15mm${mode === "both" ? ";size:landscape" : ""}}*{box-sizing:border-box;margin:0;padding:0}body{background:#fff;color:#1e293b;font-family:'Segoe UI',system-ui,sans-serif;line-height:1.5}.header{padding-bottom:16px;border-bottom:2px solid #B8904A;margin-bottom:20px}table{width:100%;border-collapse:collapse}thead th{text-align:left;padding:10px 8px;border-bottom:2px solid #B8904A;color:#B8904A;font-size:11px;text-transform:uppercase;font-weight:600}.section{margin-top:24px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;color:#B8904A;font-size:16px;font-weight:700}.footer{text-align:center;margin-top:30px;padding-top:16px;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:10px}</style></head><body>
      <div class="header">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px"><span style="font-size:28px">${strategyContext?.icon || "🎯"}</span><div><h1 style="font-size:24px;font-weight:700;margin:0">${strategyContext?.name || "Strategy"}</h1><div style="font-size:12px;color:#64748b">${strategyContext?.company || ""} &middot; Exported ${new Date().toLocaleDateString()}</div></div></div>
        <div style="margin-top:12px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11px;color:#B8904A;text-transform:uppercase;font-weight:600;margin-bottom:4px">Execution Room: ${stair.element_type?.replace("_", " ")}</div>
          <div style="font-size:16px;font-weight:700;color:#1e293b">${stair.code ? `<span style="color:#94a3b8;font-family:monospace;font-size:12px">${stair.code}</span> ` : ""}${stair.title}</div>
          ${stair.description ? `<div style="font-size:12px;color:#64748b;margin-top:4px">${stair.description}</div>` : ""}
          <div style="margin-top:8px;font-size:12px"><span style="color:#475569">Health:</span> ${stair.health || "N/A"} &nbsp;|&nbsp; <span style="color:#475569">Progress:</span> ${stair.progress_percent || 0}%</div>
        </div>
      </div>
      ${bodyContent}
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
          <button onClick={() => setShowExportModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:scale-[1.02]" style={{ borderColor: `${GOLD}60`, color: GOLD, background: `${GOLD}15` }}>
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
                  <div key={t.id} className={`rounded-xl transition-all ${t.done ? "opacity-60" : ""}`} style={glass(0.4)}>
                    <div className="flex items-start gap-3 p-4">
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
                          <button
                            onClick={() => toggleActionChat(t)}
                            className={`ml-auto text-[11px] px-2.5 py-1 rounded-lg border transition font-medium ${
                              actionChatTaskId === t.id
                                ? "bg-teal-500/20 text-teal-300 border-teal-500/30"
                                : "border-amber-500/20 text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10"
                            }`}
                          >
                            {actionChatTaskId === t.id
                              ? (isAr ? "✕ إغلاق" : "✕ Close")
                              : (isAr ? "إلى أي مدى أستطيع؟" : "How far can I do this?")}
                          </button>
                        </div>
                      </div>
                    </div>

                    {actionChatTaskId === t.id && (
                      <div className="border-t border-[#1e3a5f] px-4 pb-4 pt-3">
                        <div className="max-h-64 overflow-y-auto space-y-2 mb-3">
                          {(actionChats[t.id] || []).map((m, i) => (
                            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                              <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                                m.role === "user"
                                  ? "bg-amber-500/20 text-amber-100 rounded-br-sm"
                                  : m.error
                                    ? "bg-red-500/10 text-red-300 rounded-bl-sm border border-red-500/20"
                                    : "bg-[#0a1628]/60 text-gray-300 rounded-bl-sm border border-[#1e3a5f]"
                              }`}>
                                {m.role === "ai" ? <Markdown text={m.text} /> : <span className="whitespace-pre-wrap">{m.text}</span>}
                              </div>
                            </div>
                          ))}
                          {actionChatLoading && actionChatTaskId === t.id && (
                            <div className="flex gap-1 px-2 py-1">{[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-teal-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                          )}
                          <div ref={actionChatEndRef} />
                        </div>
                        {(actionChats[t.id] || []).length <= 1 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {(isAr
                              ? ["أستطيع بالكامل", "جزئياً فقط", "لا أستطيع حالياً"]
                              : ["I can do this fully", "Only partially", "I can't right now"]
                            ).map((q, i) => (
                              <button key={i} onClick={() => setActionChatInput(q)} className="text-[10px] px-2.5 py-1 rounded-full border border-teal-500/20 text-teal-400/70 hover:bg-teal-500/10 transition">{q}</button>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={actionChatTaskId === t.id ? actionChatInput : ""}
                            onChange={e => setActionChatInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); sendActionChat(t.id); } }}
                            placeholder={isAr ? "أخبرني عن قدرتك وقيودك..." : "Tell me about your ability and constraints..."}
                            disabled={actionChatLoading}
                            className="flex-1 px-3 py-2 rounded-lg bg-[#0a1628]/60 border border-[#1e3a5f] text-white placeholder-gray-600 focus:border-teal-500/40 focus:outline-none transition text-xs"
                          />
                          <button
                            onClick={() => sendActionChat(t.id)}
                            disabled={actionChatLoading || !actionChatInput.trim()}
                            className="px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-30 transition-all hover:scale-105"
                            style={{ background: `linear-gradient(135deg, ${TEAL}, #2dd4bf)`, color: DEEP }}
                          >
                            {isAr ? "إرسال" : "Send"}
                          </button>
                        </div>
                      </div>
                    )}
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

            {/* Generate Customized Action Plan Button */}
            {tasks.length > 0 && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={generateCustomPlan}
                  disabled={customPlanLoading || !hasFeedback()}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                  style={{
                    background: hasFeedback()
                      ? `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`
                      : `${GOLD}30`,
                    color: hasFeedback() ? DEEP : "#94a3b8",
                    border: `1px solid ${hasFeedback() ? GOLD : GOLD + "40"}`,
                    boxShadow: hasFeedback() ? `0 4px 20px ${GOLD}30` : "none",
                  }}
                  title={!hasFeedback() ? (isAr ? "أضف ملاحظاتك على المهام أولاً باستخدام زر \"إلى أي مدى أستطيع؟\"" : "Add your feedback on tasks first using the \"How far can I do this?\" button") : ""}
                >
                  {customPlanLoading ? (
                    <>
                      <span className="flex gap-1">{[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>
                      {isAr ? "جاري إنشاء خطتك المخصصة..." : "Generating your customized plan..."}
                    </>
                  ) : (
                    <>
                      <span className="text-base">✨</span>
                      {isAr ? "إنشاء خطة عمل مخصصة لي" : "Generate My Customized Action Plan"}
                    </>
                  )}
                </button>
              </div>
            )}
            {tasks.length > 0 && !hasFeedback() && (
              <p className="text-center text-[11px] text-gray-600 mt-2">
                {isAr
                  ? "💡 استخدم زر \"إلى أي مدى أستطيع؟\" على المهام أعلاه لإضافة ملاحظاتك أولاً"
                  : "💡 Use the \"How far can I do this?\" button on tasks above to add your feedback first"}
              </p>
            )}

            {/* Customized Action Plan Section */}
            {(customPlanLoading || customPlan) && (
              <div className="mt-8 pt-6" style={{ borderTop: `1px solid ${GOLD}30` }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-base">✨</span>
                    <h2 className="text-lg font-semibold text-amber-300">{isAr ? "خطة العمل المخصصة لك" : "Your Customized Action Plan"}</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    {customTasks.length > 0 && (
                      <span className="text-xs text-gray-500">
                        {customTasks.filter(t => t.done).length}/{customTasks.length} {isAr ? "مكتمل" : "completed"}
                      </span>
                    )}
                    <button onClick={generateCustomPlan} disabled={customPlanLoading || !hasFeedback()} className="text-xs text-amber-400/70 hover:text-amber-400 transition px-2 py-1 rounded hover:bg-amber-500/10 disabled:opacity-30">
                      {customPlanLoading ? "..." : `↻ ${isAr ? "تجديد" : "Regenerate"}`}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-gray-500 mb-4">
                  {isAr
                    ? "هذه الخطة مصممة خصيصاً بناءً على ملاحظاتك حول قدراتك وقيودك."
                    : "This plan is tailored based on your feedback about your capabilities and constraints."}
                </p>

                {customPlanLoading && !customPlan ? (
                  <LoadingDots label={isAr ? "جاري إنشاء خطتك المخصصة..." : "Generating your customized plan..."} />
                ) : customTasks.length > 0 ? (
                  <div className="space-y-2">
                    {customTasks.map(t => (
                      <div key={t.id} className={`rounded-xl transition-all ${t.done ? "opacity-60" : ""}`} style={{ ...glass(0.4), borderLeft: `3px solid ${GOLD}60` }}>
                        <div className="flex items-start gap-3 p-4">
                          <button onClick={() => toggleCustomTask(t.id)} className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition ${t.done ? "bg-emerald-500/30 border-emerald-500/50 text-emerald-300" : "border-amber-500/40 hover:border-amber-500/70"}`}>
                            {t.done && <span className="text-xs">✓</span>}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-medium ${t.done ? "line-through text-gray-500" : "text-white"}`}>{t.name}</span>
                              <PriorityBadge priority={t.priority} />
                            </div>
                            {t.details && <div className="text-gray-400 text-xs mt-1">{t.details}</div>}
                            <div className="flex items-center gap-4 mt-2">
                              <span className="text-[10px] text-gray-600"><span className="text-gray-500">👤</span> {t.owner}</span>
                              <span className="text-[10px] text-gray-600"><span className="text-gray-500">⏱</span> {t.timeline}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : customPlan ? (
                  <div className="rounded-xl p-4" style={{ ...glass(0.4), borderLeft: `3px solid ${GOLD}60` }}>
                    <Markdown text={customPlan} />
                  </div>
                ) : null}

                {customTasks.length > 0 && (
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-[#1e3a5f] overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${customTasks.length ? (customTasks.filter(t => t.done).length / customTasks.length) * 100 : 0}%`, background: `linear-gradient(90deg, ${GOLD}, ${GOLD_L})` }} />
                    </div>
                    <span className="text-xs text-gray-500">{Math.round(customTasks.length ? (customTasks.filter(t => t.done).length / customTasks.length) * 100 : 0)}%</span>
                  </div>
                )}

                {customPlan && onSaveNote && (
                  <div className="mt-4">
                    <button onClick={() => onSaveNote(`✨ Customized Plan: ${stair.title}`, customPlan, "custom_plan")} className="text-xs text-gray-600 hover:text-amber-400 transition px-2 py-1 rounded hover:bg-amber-500/10">
                      📌 {isAr ? "حفظ في الملاحظات" : "Save to Notes"}
                    </button>
                  </div>
                )}
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

      {/* Export Options Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl border p-6 w-full max-w-md mx-4" style={{ background: DEEP, borderColor: BORDER }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white text-lg font-semibold">{isAr ? "خيارات التصدير" : "Export Options"}</h3>
              <button onClick={() => setShowExportModal(false)} className="text-gray-500 hover:text-white transition text-lg">✕</button>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => exportPlan("recommended")}
                disabled={tasks.length === 0}
                className="w-full text-left p-4 rounded-xl border transition hover:scale-[1.01] disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ borderColor: `${BORDER}`, background: "rgba(255,255,255,0.03)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">📋</span>
                  <span className="text-white text-sm font-semibold">{isAr ? "خطة العمل الموصى بها" : "Recommended Action Plan"}</span>
                </div>
                <p className="text-gray-500 text-xs ml-7">{isAr ? "تصدير خطة العمل المقترحة من الذكاء الاصطناعي مع الحلول والملاحظات" : "Export the AI-suggested action plan with solutions and feedback notes"}</p>
              </button>
              <button
                onClick={() => exportPlan("customized")}
                disabled={customTasks.length === 0}
                className="w-full text-left p-4 rounded-xl border transition hover:scale-[1.01] disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ borderColor: `${GOLD}40`, background: `${GOLD}08` }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">✨</span>
                  <span className="text-amber-300 text-sm font-semibold">{isAr ? "خطة العمل المخصصة" : "Customized Action Plan"}</span>
                </div>
                <p className="text-gray-500 text-xs ml-7">{isAr ? "تصدير خطتك المخصصة بناءً على ملاحظاتك وقدراتك" : "Export your tailored plan based on your feedback and capabilities"}</p>
                {customTasks.length === 0 && <p className="text-amber-500/60 text-[10px] ml-7 mt-1">{isAr ? "أنشئ خطة مخصصة أولاً" : "Generate a customized plan first"}</p>}
              </button>
              <button
                onClick={() => exportPlan("both")}
                disabled={tasks.length === 0 || customTasks.length === 0}
                className="w-full text-left p-4 rounded-xl border transition hover:scale-[1.01] disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ borderColor: `${BORDER}`, background: "rgba(255,255,255,0.03)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">⚖️</span>
                  <span className="text-white text-sm font-semibold">{isAr ? "مقارنة الخطتين" : "Both — Side-by-Side Comparison"}</span>
                </div>
                <p className="text-gray-500 text-xs ml-7">{isAr ? "تصدير الخطتين جنباً إلى جنب للمقارنة مع الملاحظات والحلول" : "Export both plans side-by-side for comparison with feedback notes and solutions"}</p>
                {(tasks.length === 0 || customTasks.length === 0) && <p className="text-amber-500/60 text-[10px] ml-7 mt-1">{isAr ? "يتطلب وجود كلتا الخطتين" : "Requires both plans to be generated"}</p>}
              </button>
            </div>
            <button onClick={() => setShowExportModal(false)} className="w-full mt-4 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 transition">
              {isAr ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
