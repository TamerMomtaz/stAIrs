import { useState, useEffect, useRef } from "react";
import { api, ActionPlansAPI, SourcesAPI, ManifestStore, ArtifactsAPI, ARTIFACT, stairScope, taskScope, canSeeAgentTelemetry } from "../api";
import { BORDER, DEEP, DEEP_MID, GOLD, GOLD_INK, GRAD_ACCENT, GRAD_ACCENT_90, GRAD_BLUE, GRAD_TEAL, GRAD_VIOLET, GRAD_VIOLET_90, HUE, INK_3, INK_ON_ACCENT, INK_MUTED, TEAL, cast, glass, tint, typeColors, typeIcons } from "../constants";
import { HealthBadge, ConfidenceBadge, ValidationWarnings, AgentActivityIndicator } from "./SharedUI";
import { Markdown } from "./Markdown";
import { logoUrl, printDocument } from "../exportUtils";
import { LoadMatrixButtons } from "./StrategyMatrixToolkit";
import { fireGuidance } from "../guidanceConfig";
import { normalizeAiResult } from "../lib/aiResilience";
import AiUnavailable from "./AiUnavailable";

/* ═══ WHERE YOU ARE, IN THE ROOM ═══
   The room is a full-screen overlay by decision, so it never gets the sidebar
   and has to supply its own orientation rather than borrowing it. It used to
   have one exit — an arrow whose tooltip said "Back to Staircase" while its
   handler went to the step picker — and a person arriving by deep link had
   nothing above them at all, since browser Back leaves the site when there is
   no history to pop.

   Three segments, and the parent is the Execution Room picker rather than the
   Staircase: it is the screen the sidebar names, the screen Back already went
   to, and a legitimate index of workable steps, so "up" keeps meaning one
   thing across both navigation surfaces.

   The last segment is not a link. It names where you are and carries
   aria-current="page" — a link that reloads the page you are on teaches
   exactly the lesson this change exists to remove.

   TWO RTL DETAILS, one of which is the opposite of what it looks like.

   THE SEPARATOR IS NOT SWAPPED BY HAND. U+203A is Bidi_Mirrored, so the text
   engine already renders it as ‹ inside an RTL run — mirroring is a required
   part of the Unicode Bidirectional Algorithm, not a font nicety. Hand-swapping
   to ‹ for Arabic double-flips it and points the crumbs the wrong way. Measured
   in Chromium rather than assumed: the same codepoint rendered under dir=ltr
   and dir=rtl in identically positioned boxes produces different bitmaps, and
   RTL › is bitmap-identical to LTR ‹. One codepoint, both directions.

   THE CODE IS ISOLATED. <bdi dir="ltr"> around the element code, because a
   Latin-and-digits string with hyphens reorders visually inside an RTL run —
   the hyphens are bidi-neutral and take the paragraph direction, so
   OBJ-2608-A9C9 renders scrambled without it. */
export const RoomBreadcrumb = ({ stair, strategyContext, isAr, onNavigate }) => {
  const stratName = (isAr && strategyContext?.name_ar) || strategyContext?.name;
  const link = "text-ink-3 hover:text-amber-400 hover:underline underline-offset-2 transition rounded";
  return (
    <nav aria-label={isAr ? "مسار التنقل" : "Breadcrumb"}
      data-testid="room-breadcrumb"
      className="flex items-center gap-1.5 min-w-0 text-[11px] leading-tight">
      {strategyContext && (
        <>
          <button onClick={() => onNavigate?.("dashboard")} title={stratName}
            className={`${link} truncate max-w-[7rem] sm:max-w-[16rem]`}>
            {strategyContext.icon} {stratName}
          </button>
          <span aria-hidden="true" className="text-ink-faint shrink-0">&rsaquo;</span>
        </>
      )}
      <button onClick={() => onNavigate?.("execroom")} className={`${link} shrink-0`}>
        {isAr ? "الغرفة التنفيذية" : "Execution Room"}
      </button>
      <span aria-hidden="true" className="text-ink-faint shrink-0">&rsaquo;</span>
      {/* Never truncated. It is the one string here that identifies THIS room,
          and a half-printed code is worse than useless in a support thread. */}
      <span aria-current="page" className="shrink-0 text-ink-2">
        {stair.code
          ? <bdi dir="ltr" className="font-mono text-[10.5px]">{stair.code}</bdi>
          : <span className="truncate max-w-[12rem] inline-block align-bottom">{stair.title}</span>}
      </span>
    </nav>
  );
};

// ═══ EXECUTION ROOM ═══
export const ExecutionRoom = ({ stair, strategyContext, lang, onNavigate, onSaveNote, onMatrixClick, onOpenManifest }) => {
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
  const [planView, setPlanView] = useState("recommended"); // "recommended" | "customized" | "comparison"
  const [expandedDesc, setExpandedDesc] = useState({}); // task id -> show full description
  const [hasSavedPlan, setHasSavedPlan] = useState(false);
  const [savedPlanId, setSavedPlanId] = useState(null);
  const [retryMsg, setRetryMsg] = useState(null);
  // Failure *kinds* for the panels that hold a document rather than a chat.
  const [planFailure, setPlanFailure] = useState(null);
  const [solutionsFailure, setSolutionsFailure] = useState(null);
  const [customPlanFailure, setCustomPlanFailure] = useState(null);
  const [savedCustomPlanId, setSavedCustomPlanId] = useState(null);
  const [planValidation, setPlanValidation] = useState(null);
  const [planAgentsUsed, setPlanAgentsUsed] = useState(null);
  const [agentStep, setAgentStep] = useState(0);
  const agentStepRef = useRef(null);
  // ── Explain chat state ──
  const [explainTaskId, setExplainTaskId] = useState(null);
  const [explainChats, setExplainChats] = useState({});
  const [explainChatInput, setExplainChatInput] = useState("");
  const [explainChatLoading, setExplainChatLoading] = useState(false);
  const explainChatEndRef = useRef(null);
  // ── Implementation Room state ──
  const [implRoomTaskId, setImplRoomTaskId] = useState(null);
  const [implRoomData, setImplRoomData] = useState({});
  const [implRoomLoading, setImplRoomLoading] = useState(false);
  const [implRoomChatInput, setImplRoomChatInput] = useState("");
  const [implRoomChatLoading, setImplRoomChatLoading] = useState(false);
  const implRoomEndRef = useRef(null);
  // ── Split-view wizard state ──
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [isNarrow, setIsNarrow] = useState(typeof window !== "undefined" && window.innerWidth < 900);
  // ── Persistence state ──
  // `loaded` gates every generate path: nothing may call the AI until the
  // server read has finished and we know whether the answer already exists.
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // scope_key → ISO timestamp, so persisted content can say when it was made
  // instead of just appearing.
  const [generatedAt, setGeneratedAt] = useState({});
  // Content that reached the screen but not the server. Never silent.
  const [unsaved, setUnsaved] = useState([]);
  // Operation keys currently in flight. A double-click, a remount, or React
  // StrictMode's double-invoked effect all collapse to one request.
  const inFlight = useRef(new Set());
  // Flipped on unmount so a late response can't write into a dead tree or,
  // worse, into the next stair's Execution Room.
  const alive = useRef(true);

  const isAr = lang === "ar";
  const color = typeColors[stair.element_type] || INK_3;
  const manifestStoreRef = useRef(strategyContext?.id ? new ManifestStore(strategyContext.id) : null);

  const beginOp = (key) => {
    if (inFlight.current.has(key)) return false;
    inFlight.current.add(key);
    return true;
  };
  const endOp = (key) => inFlight.current.delete(key);

  const stampKey = (type, scope) => `${type}:${scope}`;

  // Server first, localStorage second. A failed write is reported, not swallowed.
  const persist = async ({ type, scope, content, payload, label }) => {
    try {
      const saved = await ArtifactsAPI.save({
        artifactType: type,
        scopeKey: scope,
        strategyId: strategyContext?.id || null,
        stairId: stair.id,
        content: content ?? null,
        payload: payload || {},
      });
      if (!alive.current) return saved;
      setGeneratedAt(prev => ({ ...prev, [stampKey(type, scope)]: saved.generated_at || new Date().toISOString() }));
      setUnsaved(prev => prev.filter(u => u.key !== stampKey(type, scope)));
      return saved;
    } catch (e) {
      console.warn(`[stairs] failed to save ${type}:`, e.message);
      if (alive.current) {
        setUnsaved(prev => prev.some(u => u.key === stampKey(type, scope))
          ? prev
          : [...prev, { key: stampKey(type, scope), label: label || type }]);
      }
      return null;
    }
  };

  // The manifest store is now a mirror of what the server already holds, kept
  // so the Manifest Room stays readable offline. The server is the source of
  // truth — this never decides what gets shown.
  const saveManifest = (taskId, updates) => {
    if (manifestStoreRef.current && stair?.id && taskId) {
      manifestStoreRef.current.set(stair.id, taskId, { ...updates, task_id: taskId });
      // Dispatch custom event for same-tab sync (storage events only fire cross-tab)
      window.dispatchEvent(new CustomEvent("manifest-updated", { detail: { strategyId: strategyContext?.id } }));
    }
  };

  const stairCtx = `${stair.element_type} "${stair.title}" (code: ${stair.code || "N/A"}), health: ${stair.health || "unknown"}, progress: ${stair.progress_percent || 0}%. Description: ${stair.description || "None"}.`;
  const stratCtx = strategyContext ? `Strategy: "${strategyContext.name}" for "${strategyContext.company || strategyContext.name}". Industry: ${strategyContext.industry || "unspecified"}.` : "";
  const sourceRef = "When citing frameworks, books, or statistics, include a brief source reference.";

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { actionChatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [actionChats, actionChatTaskId]);
  useEffect(() => { explainChatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [explainChats, explainTaskId]);
  useEffect(() => { implRoomEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [implRoomData, implRoomTaskId]);

  // Track narrow screens (<900px) to collapse the split view into a single column
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Sync impl step progress from ManifestRoom via storage events
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === `stairs_manifest_${strategyContext?.id}` && manifestStoreRef.current) {
        try {
          const allManifests = JSON.parse(e.newValue || "{}");
          setImplRoomData(prev => {
            const updated = { ...prev };
            for (const [key, manifest] of Object.entries(allManifests)) {
              if (manifest.stair_id === stair.id && manifest.impl_steps && updated[manifest.task_id]) {
                updated[manifest.task_id] = { ...updated[manifest.task_id], steps: manifest.impl_steps };
              }
            }
            return updated;
          });
        } catch {}
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [strategyContext?.id, stair.id]);

  // Read every persisted artefact for this stair before anything can be
  // generated. This effect NEVER calls the AI: if a plan, a set of solutions,
  // an explanation or an implementation guide already exists it is loaded; if
  // it doesn't, the UI offers a Generate button and waits for the client.
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    const load = async () => {
      setLoaded(false);
      setLoadFailed(false);
      try {
        const [plans, artifacts] = await Promise.all([
          ActionPlansAPI.getForStair(stair.id).catch(() => { throw new Error("plans"); }),
          ArtifactsAPI.forStair(stair.id).catch(() => []),
        ]);
        if (cancelled) return;

        // ── Action plans ──
        const mapTasks = (list, planId, prefix) => (list || []).map((t, i) => ({
          id: t.id || `${prefix}_${i}_${planId}`,
          name: t.name || `Task ${i + 1}`,
          owner: t.owner || "TBD",
          timeline: t.timeline || "TBD",
          priority: t.priority || "Medium",
          details: t.details || "",
          done: !!t.done,
        }));
        const recommended = (plans || []).find(p => p.plan_type === "recommended");
        const customized = (plans || []).find(p => p.plan_type === "customized");
        if (recommended) {
          setHasSavedPlan(true);
          setActionPlan(recommended.raw_text);
          setTasks(mapTasks(recommended.tasks, recommended.id, "task"));
          setSavedPlanId(recommended.id);
          setGeneratedAt(prev => ({ ...prev, [stampKey("action_plan", stair.id)]: recommended.created_at }));
        }
        if (customized) {
          setHasSavedPlan(true);
          setCustomPlan(customized.raw_text);
          setCustomTasks(mapTasks(customized.tasks, customized.id, "ctask"));
          setSavedCustomPlanId(customized.id);
          setGeneratedAt(prev => ({ ...prev, [stampKey("custom_plan", stair.id)]: customized.created_at }));
        }

        // ── Generated artifacts ──
        const idx = ArtifactsAPI.index(artifacts);
        const stamps = {};
        for (const a of artifacts || []) stamps[stampKey(a.artifact_type, a.scope_key)] = a.generated_at;
        setGeneratedAt(prev => ({ ...prev, ...stamps }));

        const sol = idx[ARTIFACT.SOLUTIONS]?.[stairScope(stair.id)];
        if (sol) setSolutions(sol.content);

        const explains = idx[ARTIFACT.EXPLAIN] || {};
        const explainChatsLoaded = {};
        for (const [scope, a] of Object.entries(explains)) {
          const taskId = scope.slice(scope.indexOf(":") + 1);
          explainChatsLoaded[taskId] = [
            { role: "ai", text: a.content, sources_used: a.payload?.sources_used || [], ts: a.generated_at },
            ...(a.payload?.follow_ups || []),
          ];
        }
        if (Object.keys(explainChatsLoaded).length) setExplainChats(explainChatsLoaded);

        const assessments = idx[ARTIFACT.ASSESS_CHAT] || {};
        const assessLoaded = {};
        for (const [scope, a] of Object.entries(assessments)) {
          const taskId = scope.slice(scope.indexOf(":") + 1);
          if (a.payload?.messages?.length) assessLoaded[taskId] = a.payload.messages;
        }
        if (Object.keys(assessLoaded).length) setActionChats(assessLoaded);

        const guides = idx[ARTIFACT.IMPL_GUIDE] || {};
        const implLoaded = {};
        for (const [scope, a] of Object.entries(guides)) {
          const taskId = scope.slice(scope.indexOf(":") + 1);
          implLoaded[taskId] = {
            content: a.content,
            task_name: a.payload?.task_name,
            steps: a.payload?.steps || [],
            sources_used: a.payload?.sources_used || [],
            messages: a.payload?.messages || [],
            ts: a.generated_at,
          };
        }
        if (Object.keys(implLoaded).length) setImplRoomData(implLoaded);

        const roomChat = idx[ARTIFACT.ROOM_CHAT]?.[stairScope(stair.id)];
        setMessages(roomChat?.payload?.messages?.length
          ? roomChat.payload.messages
          : [{ role: "ai", text: `Welcome to the Execution Room for **${stair.title}**.\n\nI have full context of your strategy and this specific step. Ask me anything about execution, risks, resources, timelines, or alternative approaches.`, ts: new Date().toISOString() }]);
      } catch {
        if (cancelled) return;
        // A failed read must not look like "nothing here yet" — that is exactly
        // how a network blip used to turn into a regenerated plan and a
        // duplicate row. Say so and let the client retry.
        setLoadFailed(true);
      }
      if (!cancelled) setLoaded(true);
    };
    load();
    return () => { cancelled = true; alive.current = false; };
  }, [stair.id]);

  const generateActionPlan = async () => {
    // Explicit user action only. Guarded so a double-click, or a click that
    // lands before `planLoading` has re-rendered the disabled button, is one call.
    if (!loaded || !beginOp("plan")) return;
    setPlanLoading(true);
    setAgentStep(0); agentStepRef.current = setInterval(() => setAgentStep(s => s + 1), 2500);
    try {
      const prompt = `[${stratCtx}]\n\n${sourceRef}\n\nGenerate a detailed, actionable execution plan for: ${stairCtx}\n\nFormat your response EXACTLY as follows:\n\n## Action Plan\n\nFor each task, use this format:\n- **Task:** [task name]\n- **Owner:** [suggested role/team]\n- **Timeline:** [estimated duration]\n- **Priority:** [High/Medium/Low]\n- **Details:** [brief description of what needs to be done]\n\n---\n\n(Repeat for each task. Generate 5-8 concrete tasks. Make them specific, measurable, and directly related to executing this strategic element.)`;
      const res = await api.aiPost("/api/v1/ai/chat", { message: prompt, strategy_id: strategyContext?.id || null }, (attempt, max) => setRetryMsg(`AI is thinking... retrying (${attempt}/${max})`), "execroom:generate-action-plan");
      setRetryMsg(null);
      const r = normalizeAiResult(res, { lang });
      if (!r.ok) { setPlanFailure(r.kind); setActionPlan(null); }
      else {
      setPlanFailure(null);
      setActionPlan(r.text);
      fireGuidance("action_plan_created", { name: stair?.title });
      setPlanValidation(res.validation || null);
      setPlanAgentsUsed(res.agents_used || null);
      const parsed = parseTasks(r.text);
      setTasks(parsed);
      try {
        const taskData = parsed.map(t => ({ id: t.id, name: t.name, owner: t.owner, timeline: t.timeline, priority: t.priority, details: t.details, done: false }));
        const saved = await ActionPlansAPI.save(stair.id, "recommended", r.text, taskData);
        setSavedPlanId(saved.id);
        setHasSavedPlan(true);
        setGeneratedAt(prev => ({ ...prev, [stampKey("action_plan", stair.id)]: saved.created_at || new Date().toISOString() }));
        setUnsaved(prev => prev.filter(u => u.key !== stampKey("action_plan", stair.id)));
      } catch (saveErr) {
        console.warn("Auto-save action plan failed:", saveErr);
        setUnsaved(prev => prev.some(u => u.key === stampKey("action_plan", stair.id)) ? prev
          : [...prev, { key: stampKey("action_plan", stair.id), label: isAr ? "خطة العمل" : "Action plan" }]);
      }
      }
    } catch (e) { setRetryMsg(null); setPlanFailure(normalizeAiResult(e, { lang }).kind); setActionPlan(null); }
    clearInterval(agentStepRef.current); setPlanLoading(false); endOp("plan");
  };

  const generateSolutions = async () => {
    // Was fired unconditionally on every mount of this component, with no
    // persistence and no check — the single largest source of repeat calls.
    // Now: explicit action only, result is stored and read back.
    if (!loaded || !beginOp("solutions")) return;
    setSolLoading(true);
    try {
      const prompt = `[${stratCtx}]\n\n${sourceRef}\n\nProvide practical, specific solutions and recommendations for executing: ${stairCtx}\n\nInclude:\n## Solutions & Recommendations\n\n1. **Quick Wins** — Actions that can be taken immediately with minimal resources\n2. **Strategic Moves** — Medium-term initiatives that drive significant progress\n3. **Risk Mitigation** — Specific ways to address potential obstacles\n4. **Resource Optimization** — How to maximize impact with available resources\n5. **Success Metrics** — How to measure successful execution\n\nBe specific and practical. Provide concrete examples where possible.`;
      const res = await api.aiPost("/api/v1/ai/chat", { message: prompt, strategy_id: strategyContext?.id || null }, (attempt, max) => setRetryMsg(`AI is thinking... retrying (${attempt}/${max})`), "execroom:generate-solutions");
      setRetryMsg(null);
      const r = normalizeAiResult(res, { lang });
      if (!r.ok) { setSolutionsFailure(r.kind); setSolutions(null); }
      else {
        setSolutionsFailure(null);
        setSolutions(r.text);
        await persist({
          type: ARTIFACT.SOLUTIONS, scope: stairScope(stair.id), content: r.text,
          label: isAr ? "التوصيات" : "Recommendations",
        });
      }
    } catch (e) { setRetryMsg(null); setSolutionsFailure(normalizeAiResult(e, { lang }).kind); setSolutions(null); }
    setSolLoading(false); endOp("solutions");
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
    setTasks(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, done: !t.done } : t);
      if (savedPlanId) {
        const idx = prev.findIndex(t => t.id === id);
        if (idx >= 0) {
          ActionPlansAPI.updateTaskDone(savedPlanId, idx, !prev[idx].done)
            .catch(err => console.warn("Failed to persist task toggle:", err.message));
        }
      }
      return updated;
    });
  };

  const sendChat = async (retryText) => {
    if ((!retryText && !chatInput.trim()) || chatLoading) return;
    const msg = retryText || chatInput.trim();
    if (!retryText) setChatInput("");
    if (!retryText) setMessages(prev => [...prev, { role: "user", text: msg, ts: new Date().toISOString() }]);
    setChatLoading(true);
    try {
      const contextMsg = `[${stratCtx} Currently in Execution Room for: ${stairCtx}]\n\nThe user has an action plan and solutions generated. They are asking follow-up questions about execution.\n\n${sourceRef}\n\n${msg}`;
      const res = await api.aiPost("/api/v1/ai/chat", { message: contextMsg, strategy_id: strategyContext?.id || null }, (attempt, max) => setRetryMsg(`AI is thinking... retrying (${attempt}/${max})`), "execroom:room-chat");
      setRetryMsg(null);
      const r = normalizeAiResult(res, { lang });
      if (!r.ok) setMessages(prev => [...prev, { role: "ai", failure: r.kind, retry: () => sendChat(msg), ts: new Date().toISOString() }]);
      else {
        const aiMsg = { role: "ai", text: r.text, tokens: res.tokens_used, ts: new Date().toISOString() };
        setMessages(prev => {
          const next = [...prev, aiMsg];
          // Persist the transcript, minus retry closures which can't serialise.
          persist({
            type: ARTIFACT.ROOM_CHAT, scope: stairScope(stair.id),
            payload: { messages: next.filter(m => !m.failure).map(({ retry, ...m }) => m) },
            label: isAr ? "محادثة غرفة التنفيذ" : "Execution Room chat",
          });
          return next;
        });
      }
    } catch (e) {
      setRetryMsg(null);
      setMessages(prev => [...prev, { role: "ai", failure: normalizeAiResult(e, { lang }).kind, retry: () => sendChat(msg), ts: new Date().toISOString() }]);
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

  // ── Explain Chat Functions ──
  // Opening a panel is navigation, not a request to generate. Previously this
  // fired an AI call the moment an action card was clicked, so simply browsing
  // the wizard billed a call per action. The panel now opens empty and offers a
  // Generate button; the client decides.
  const toggleExplainChat = (task) => {
    if (explainTaskId === task.id) {
      setExplainTaskId(null);
      setExplainChatInput("");
      return;
    }
    setExplainTaskId(task.id);
    setExplainChatInput("");
  };

  // The fetch on its own, so "Try again" doesn't have to fight the toggle.
  // Guarded on `loaded` (a persisted explanation may be on its way) and on the
  // in-flight set (opening the same step twice must not stack two calls).
  const runExplain = (task) => {
    if (!task || !loaded) return;
    if (!beginOp(`explain:${task.id}`)) return;
    {
      setExplainChatLoading(true);
      const explainPrompt = `[${stratCtx} Execution Room for: ${stairCtx}]

${sourceRef}

The user wants to understand this specific action item BEFORE assessing their ability to do it. Explain it in simple, practical terms.

Action Item:
- Task: ${task.name}
- Owner: ${task.owner}
- Timeline: ${task.timeline}
- Priority: ${task.priority}
- Details: ${task.details}

Provide a clear explanation covering:
1. **What it means** — Plain-language breakdown of this action
2. **Why it matters** — How this task contributes to the strategic goal
3. **What success looks like** — Concrete outcomes when done well
4. **Resources needed** — People, tools, budget, time, or permissions required

IMPORTANT: Use the strategy's Source of Truth data (uploaded documents, verified sources, company data) to make your explanation specific to the user's actual situation. Reference specific data points from their documents where relevant. Do NOT give generic advice — ground everything in their real data.

Keep the explanation concise but thorough. The user should feel confident they understand exactly what this action involves before deciding how far they can do it.`;
      api.aiPost("/api/v1/ai/chat", {
        message: explainPrompt,
        strategy_id: strategyContext?.id || null,
        context_stair_id: stair.id,
      }, (attempt, max) => setRetryMsg(`AI is thinking... retrying (${attempt}/${max})`), "execroom:explain-action")
        .then(async res => {
          setRetryMsg(null);
          const r = normalizeAiResult(res, { lang });
          if (!r.ok) {
            setExplainChats(prev => ({ ...prev, [task.id]: [{ role: "ai", failure: r.kind, ts: new Date().toISOString() }] }));
            return;
          }
          setExplainChats(prev => ({
            ...prev,
            [task.id]: [{
              role: "ai",
              text: r.text,
              tokens: res.tokens_used,
              sources_used: res.sources_used,
              ts: new Date().toISOString(),
            }],
          }));
          await persist({
            type: ARTIFACT.EXPLAIN, scope: taskScope(stair.id, task.id), content: r.text,
            payload: { task_name: task.name, sources_used: res.sources_used || [], follow_ups: [] },
            label: isAr ? `شرح: ${task.name}` : `Explanation: ${task.name}`,
          });
          saveManifest(task.id, { task_name: task.name, explanation: r.text, sources_used: res.sources_used || [] });
        })
        .catch(e => {
          setRetryMsg(null);
          setExplainChats(prev => ({
            ...prev,
            [task.id]: [{ role: "ai", failure: normalizeAiResult(e, { lang }).kind, ts: new Date().toISOString() }],
          }));
        })
        .finally(() => { setExplainChatLoading(false); endOp(`explain:${task.id}`); });
    }
  };

  const sendExplainChat = async (taskId) => {
    const task = tasks.find(t => t.id === taskId) || customTasks.find(t => t.id === taskId);
    if (!explainChatInput.trim() || explainChatLoading || !task) return;
    const msg = explainChatInput.trim();
    setExplainChatInput("");
    const userMsg = { role: "user", text: msg, ts: new Date().toISOString() };
    setExplainChats(prev => ({ ...prev, [taskId]: [...(prev[taskId] || []), userMsg] }));
    setExplainChatLoading(true);
    try {
      const history = (explainChats[taskId] || []).filter(m => !m.failure).map(m => `${m.role === "user" ? "User" : "AI"}: ${m.text}`).join("\n\n");
      const contextMsg = `[${stratCtx} Execution Room for: ${stairCtx}]

${sourceRef}

The user is asking follow-up questions about this action item's explanation. They want to understand it better before assessing their ability to execute it.

Action Item: ${task.name} (${task.priority} priority)
Details: ${task.details}

Continue using the strategy's Source of Truth data to give specific, grounded answers. Reference their uploaded documents and verified sources.

Conversation so far:
${history}

User: ${msg}`;
      const res = await api.aiPost("/api/v1/ai/chat", {
        message: contextMsg,
        strategy_id: strategyContext?.id || null,
        context_stair_id: stair.id,
      }, (attempt, max) => setRetryMsg(`AI is thinking... retrying (${attempt}/${max})`), "execroom:explain-followup");
      setRetryMsg(null);
      const r = normalizeAiResult(res, { lang });
      const aiMsg = r.ok
        ? { role: "ai", text: r.text, tokens: res.tokens_used, sources_used: res.sources_used, ts: new Date().toISOString() }
        : { role: "ai", failure: r.kind, ts: new Date().toISOString() };
      setExplainChats(prev => {
        const next = { ...prev, [taskId]: [...(prev[taskId] || []), aiMsg] };
        if (r.ok) {
          // The head of the thread is the stored explanation; the rest are
          // follow-ups riding along in the same artifact.
          const [head, ...followUps] = next[taskId];
          persist({
            type: ARTIFACT.EXPLAIN, scope: taskScope(stair.id, taskId), content: head?.text ?? null,
            payload: { task_name: task.name, sources_used: head?.sources_used || [], follow_ups: followUps.filter(m => !m.failure) },
            label: isAr ? `شرح: ${task.name}` : `Explanation: ${task.name}`,
          });
        }
        return next;
      });
    } catch (e) {
      setRetryMsg(null);
      setExplainChats(prev => ({ ...prev, [taskId]: [...(prev[taskId] || []), { role: "ai", failure: normalizeAiResult(e, { lang }).kind, ts: new Date().toISOString() }] }));
    }
    setExplainChatLoading(false);
  };

  // ── Implementation Room Functions ──
  // Same as the Understand step: reaching step 4 opens the room, it does not
  // commission a guide. Persisted guides show immediately; otherwise the client
  // presses Generate.
  const openImplRoom = async (task, isCustomTask = false) => {
    if (implRoomTaskId === task.id) {
      setImplRoomTaskId(null);
      setImplRoomChatInput("");
      return;
    }
    setImplRoomTaskId(task.id);
    setImplRoomChatInput("");
  };

  const runImplRoom = async (task) => {
    if (!task || !loaded) return;
    if (!beginOp(`impl:${task.id}`)) return;
    {
      setImplRoomLoading(true);
      try {
        const feedbackContext = actionChats[task.id]
          ? actionChats[task.id].filter(m => !m.failure).map(m => `${m.role === "user" ? "User" : "AI"}: ${m.text}`).join("\n")
          : "";
        const implPrompt = `[${stratCtx} Execution Room for: ${stairCtx}]

${sourceRef}

The user has already assessed their ability to execute this action and received a customized plan. Now they want a detailed, step-by-step implementation guide — like having a personal coach walking them through execution.

Action Item:
- Task: ${task.name}
- Owner: ${task.owner}
- Timeline: ${task.timeline}
- Priority: ${task.priority}
- Details: ${task.details}
${feedbackContext ? `\nUser's feedback from assessment:\n${feedbackContext}\n` : ""}

Generate a comprehensive implementation guide with these EXACT sections:

## Prerequisites
What the user needs before starting (tools, access, approvals, information). Be specific to their situation using Source of Truth data.

## Step-by-Step Instructions
Numbered, concrete, actionable steps written for someone who has never done this before. Each step should be:
- Clear enough to follow without asking questions
- Include specific details (not vague directives)
- Reference the user's actual company data, documents, and verified sources where relevant

Format each step as:
**Step N: [Step Title]**
[Detailed instructions]

## Resources from Source of Truth
Specific references to data from the user's uploaded documents that apply to this implementation. Cite document names and specific data points.

## Timeline
Realistic time estimate for each step. Format as:
- Step 1: [time estimate]
- Step 2: [time estimate]
- Total estimated time: [total]

## Success Criteria
How to know this action has been completed successfully. Include measurable indicators.

IMPORTANT: Ground ALL guidance in the user's actual data from Source of Truth. Reference specific numbers, documents, and verified information. Do NOT give generic advice.`;
        const res = await api.aiPost("/api/v1/ai/chat", {
          message: implPrompt,
          strategy_id: strategyContext?.id || null,
          context_stair_id: stair.id,
        }, (attempt, max) => setRetryMsg(`AI is thinking... retrying (${attempt}/${max})`), "execroom:implementation-guide");
        setRetryMsg(null);
        const r = normalizeAiResult(res, { lang });
        if (!r.ok) {
          setImplRoomData(prev => ({ ...prev, [task.id]: { content: null, failure: r.kind, steps: [], messages: [], ts: new Date().toISOString() } }));
          setImplRoomLoading(false);
          endOp(`impl:${task.id}`);
          return;
        }
        // Parse steps from the response to create checkboxes
        const stepMatches = r.text.match(/\*\*Step\s+\d+[:.]\s*(.+?)\*\*/g) || [];
        const steps = stepMatches.map((s, i) => ({
          id: `impl_step_${task.id}_${i}`,
          label: s.replace(/\*\*/g, "").replace(/^Step\s+\d+[:.]\s*/, "").trim(),
          done: false,
        }));
        setImplRoomData(prev => ({
          ...prev,
          [task.id]: {
            content: r.text,
            steps,
            tokens: res.tokens_used,
            sources_used: res.sources_used,
            messages: [],
            ts: new Date().toISOString(),
          },
        }));
        await persist({
          type: ARTIFACT.IMPL_GUIDE, scope: taskScope(stair.id, task.id), content: r.text,
          payload: { task_name: task.name, steps, sources_used: res.sources_used || [], messages: [] },
          label: isAr ? `دليل التنفيذ: ${task.name}` : `Implementation guide: ${task.name}`,
        });
        // Save implementation guide and steps to manifest
        saveManifest(task.id, { task_name: task.name, impl_guide: r.text, impl_steps: steps, impl_sources_used: res.sources_used || [] });
        fireGuidance("manifest_saved");
      } catch (e) {
        setRetryMsg(null);
        setImplRoomData(prev => ({
          ...prev,
          [task.id]: {
            content: null,
            failure: normalizeAiResult(e, { lang }).kind,
            steps: [],
            messages: [],
            ts: new Date().toISOString(),
          },
        }));
      }
      setImplRoomLoading(false);
      endOp(`impl:${task.id}`);
    }
  };

  const toggleImplStep = (taskId, stepId) => {
    setImplRoomData(prev => {
      const data = prev[taskId];
      if (!data) return prev;
      const updatedSteps = data.steps.map(s => s.id === stepId ? { ...s, done: !s.done } : s);
      // Checking a step is user-created state: persist it, don't just mirror it.
      const taskName = data.task_name || tasks.find(t => t.id === taskId)?.name || customTasks.find(t => t.id === taskId)?.name;
      persist({
        type: ARTIFACT.IMPL_GUIDE, scope: taskScope(stair.id, taskId), content: data.content,
        payload: { task_name: taskName, steps: updatedSteps, sources_used: data.sources_used || [], messages: data.messages || [] },
        label: isAr ? "تقدم الخطوات" : "Step progress",
      });
      // Sync step progress to manifest store
      saveManifest(taskId, { impl_steps: updatedSteps });
      return {
        ...prev,
        [taskId]: {
          ...data,
          steps: updatedSteps,
        },
      };
    });
  };

  // ── Split-view wizard helpers (layout only — all AI logic stays in the toggle/open fns) ──
  const wizardSteps = [
    { n: 1, key: "understand", label: isAr ? "افهم" : "Understand", icon: "📖", color: HUE.blue, tutorial: "explain" },
    { n: 2, key: "assess", label: isAr ? "قيّم" : "Assess", icon: "🎯", color: TEAL, tutorial: "how-far" },
    { n: 3, key: "customize", label: isAr ? "خصّص" : "Customize", icon: "✨", color: GOLD_INK, tutorial: "custom-plan" },
    { n: 4, key: "implement", label: isAr ? "نفّذ" : "Implement", icon: "🚀", color: HUE.violet, tutorial: "impl-room" },
  ];

  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;

  const getActionStatus = (t) => {
    const impl = implRoomData[t.id];
    const allStepsDone = impl?.steps?.length > 0 && impl.steps.every(s => s.done);
    if (t.done || allStepsDone) return { key: "complete", icon: "✅", label: isAr ? "مكتمل" : "Complete", cls: "text-emerald-400" };
    const started = !!explainChats[t.id] || (actionChats[t.id] || []).some(m => m.role === "user") || !!impl;
    if (started) return { key: "progress", icon: "🟡", label: isAr ? "قيد التنفيذ" : "In progress", cls: "text-amber-400" };
    return { key: "notstarted", icon: "🔘", label: isAr ? "لم يبدأ" : "Not started", cls: "text-ink-muted" };
  };

  // These guards re-use the existing toggle/open functions without ever toggling a panel closed.
  const ensureExplainOpen = (task) => { if (task && explainTaskId !== task.id) toggleExplainChat(task); };
  const ensureAssessOpen = (task) => { if (task && actionChatTaskId !== task.id) toggleActionChat(task); };
  const ensureImplOpen = (task) => { if (task && implRoomTaskId !== task.id) openImplRoom(task); };

  const selectAction = (task) => {
    setSelectedTaskId(task.id);
    setWizardStep(1);
    ensureExplainOpen(task);
  };

  const goToStep = (n) => {
    const task = tasks.find(t => t.id === selectedTaskId);
    if (!task) return;
    const clamped = Math.max(1, Math.min(4, n));
    setWizardStep(clamped);
    if (clamped === 1) ensureExplainOpen(task);
    if (clamped === 2) ensureAssessOpen(task);
    if (clamped === 4) ensureImplOpen(task);
  };

  const sendImplRoomChat = async (taskId) => {
    const task = tasks.find(t => t.id === taskId) || customTasks.find(t => t.id === taskId);
    const data = implRoomData[taskId];
    if (!implRoomChatInput.trim() || implRoomChatLoading || !task || !data) return;
    const msg = implRoomChatInput.trim();
    setImplRoomChatInput("");
    const userMsg = { role: "user", text: msg, ts: new Date().toISOString() };
    setImplRoomData(prev => ({
      ...prev,
      [taskId]: { ...prev[taskId], messages: [...(prev[taskId].messages || []), userMsg] },
    }));
    setImplRoomChatLoading(true);
    try {
      const chatHistory = (data.messages || []).filter(m => !m.failure).map(m => `${m.role === "user" ? "User" : "AI"}: ${m.text}`).join("\n\n");
      const contextMsg = `[${stratCtx} Execution Room for: ${stairCtx}]

${sourceRef}

The user is in the Implementation Room for task: "${task.name}". They have a step-by-step implementation guide and are asking follow-up questions. Help them like a personal coach — be specific, practical, and reference their Source of Truth data.

Implementation guide summary: ${data.content?.slice(0, 1000)}

${chatHistory ? `Previous Q&A:\n${chatHistory}\n` : ""}
User question: ${msg}`;
      const res = await api.aiPost("/api/v1/ai/chat", {
        message: contextMsg,
        strategy_id: strategyContext?.id || null,
        context_stair_id: stair.id,
      }, (attempt, max) => setRetryMsg(`AI is thinking... retrying (${attempt}/${max})`), "execroom:impl-coach-chat");
      setRetryMsg(null);
      const r = normalizeAiResult(res, { lang });
      const aiMsg = r.ok
        ? { role: "ai", text: r.text, tokens: res.tokens_used, ts: new Date().toISOString() }
        : { role: "ai", failure: r.kind, ts: new Date().toISOString() };
      setImplRoomData(prev => {
        const entry = { ...prev[taskId], messages: [...(prev[taskId].messages || []), aiMsg] };
        if (r.ok) {
          persist({
            type: ARTIFACT.IMPL_GUIDE, scope: taskScope(stair.id, taskId), content: entry.content,
            payload: { task_name: task.name, steps: entry.steps || [], sources_used: entry.sources_used || [], messages: entry.messages.filter(m => !m.failure) },
            label: isAr ? `دليل التنفيذ: ${task.name}` : `Implementation guide: ${task.name}`,
          });
        }
        return { ...prev, [taskId]: entry };
      });
    } catch (e) {
      setRetryMsg(null);
      setImplRoomData(prev => ({
        ...prev,
        [taskId]: { ...prev[taskId], messages: [...(prev[taskId].messages || []), { role: "ai", failure: normalizeAiResult(e, { lang }).kind, ts: new Date().toISOString() }] },
      }));
    }
    setImplRoomChatLoading(false);
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
      const history = (actionChats[taskId] || []).filter(m => !m.failure).map(m => `${m.role === "user" ? "User" : "AI"}: ${m.text}`).join("\n\n");
      const contextMsg = `[${stratCtx} Execution Room for: ${stairCtx}]\n\nThe user is assessing their ability to execute this specific action item:\n- Task: ${task.name}\n- Owner: ${task.owner}\n- Timeline: ${task.timeline}\n- Priority: ${task.priority}\n- Details: ${task.details}\n\nYour role: Help the user honestly assess how far they can go with this action. Ask clarifying questions about their constraints (budget, time, skills, tools, authority). If they can only do it partially, help them identify what portion is achievable and what needs external help or resources. Be practical and specific.\n\nConversation so far:\n${history}\n\nUser: ${msg}`;
      const res = await api.aiPost("/api/v1/ai/chat", { message: contextMsg, strategy_id: strategyContext?.id || null }, (attempt, max) => setRetryMsg(`AI is thinking... retrying (${attempt}/${max})`), "execroom:assess-chat");
      setRetryMsg(null);
      const r = normalizeAiResult(res, { lang });
      if (!r.ok) {
        setActionChats(prev => ({ ...prev, [taskId]: [...(prev[taskId] || []), { role: "ai", failure: r.kind, ts: new Date().toISOString() }] }));
      } else {
        const aiMsg = { role: "ai", text: r.text, tokens: res.tokens_used, ts: new Date().toISOString() };
        const allMsgs = [...(actionChats[taskId] || []), userMsg, aiMsg];
        setActionChats(prev => ({ ...prev, [taskId]: [...(prev[taskId] || []), aiMsg] }));
        // Save ability assessment to manifest
        const assessmentText = allMsgs.filter(m => m.role === "user").map(m => `User: ${m.text}`).join("\n") + "\n" + allMsgs.filter(m => m.role === "ai" && !m.error && !m.failure).slice(-1).map(m => `AI Assessment: ${m.text}`).join("\n");
        await persist({
          type: ARTIFACT.ASSESS_CHAT, scope: taskScope(stair.id, taskId), content: assessmentText,
          payload: { task_name: task.name, messages: allMsgs.filter(m => !m.failure) },
          label: isAr ? `تقييم: ${task.name}` : `Assessment: ${task.name}`,
        });
        saveManifest(taskId, { task_name: task.name, ability_assessment: assessmentText });
      }
    } catch (e) {
      setRetryMsg(null);
      setActionChats(prev => ({ ...prev, [taskId]: [...(prev[taskId] || []), { role: "ai", failure: normalizeAiResult(e, { lang }).kind, ts: new Date().toISOString() }] }));
    }
    setActionChatLoading(false);
  };

  const collectAllFeedback = () => {
    const feedbackEntries = [];
    for (const task of tasks) {
      const chat = actionChats[task.id];
      if (!chat || chat.length <= 1) continue;
      const userMessages = chat.filter(m => m.role === "user").map(m => m.text);
      const aiMessages = chat.filter(m => m.role === "ai" && !m.failure && chat.indexOf(m) > 0).map(m => m.text);
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
    if (!loaded || !beginOp("custom-plan")) return;
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
      const res = await api.aiPost("/api/v1/ai/chat", { message: prompt, strategy_id: strategyContext?.id || null }, (attempt, max) => setRetryMsg(`AI is thinking... retrying (${attempt}/${max})`), "execroom:generate-custom-plan");
      setRetryMsg(null);
      const r = normalizeAiResult(res, { lang });
      if (!r.ok) { setCustomPlanFailure(r.kind); setCustomPlan(null); setCustomPlanLoading(false); endOp("custom-plan"); return; }
      setCustomPlanFailure(null);
      setCustomPlan(r.text);
      const parsedCustom = parseTasks(r.text);
      setCustomTasks(parsedCustom);
      setPlanView("customized");
      // Save customized plan to manifest for each task with feedback
      for (const f of feedback) {
        const task = tasks.find(t => t.name === f.taskName);
        if (task) saveManifest(task.id, { task_name: task.name, customized_plan: r.text });
      }
      try {
        const taskData = parsedCustom.map(t => ({ id: t.id, name: t.name, owner: t.owner, timeline: t.timeline, priority: t.priority, details: t.details, done: false }));
        const saved = await ActionPlansAPI.save(stair.id, "customized", r.text, taskData, feedback);
        setSavedCustomPlanId(saved.id);
        setHasSavedPlan(true);
        setGeneratedAt(prev => ({ ...prev, [stampKey("custom_plan", stair.id)]: saved.created_at || new Date().toISOString() }));
        setUnsaved(prev => prev.filter(u => u.key !== stampKey("custom_plan", stair.id)));
      } catch (saveErr) {
        console.warn("Auto-save customized plan failed:", saveErr.message);
        setUnsaved(prev => prev.some(u => u.key === stampKey("custom_plan", stair.id)) ? prev
          : [...prev, { key: stampKey("custom_plan", stair.id), label: isAr ? "الخطة المخصصة" : "Customized plan" }]);
      }
      // Log feedback to Source of Truth
      if (strategyContext?.id && feedback.length > 0) {
        try {
          const feedbackContent = feedback.map(f => `Task: ${f.taskName}\nFeedback: ${f.userFeedback.join("; ")}`).join("\n\n");
          await SourcesAPI.create(strategyContext.id, "feedback", feedbackContent, {
            context: "feedback_response",
            stair_id: stair.id,
            stair_title: stair.title,
            task_count: feedback.length,
          });
        } catch (e) { console.warn("Failed to log feedback source:", e); }
      }
    } catch (e) { setRetryMsg(null); setCustomPlanFailure(normalizeAiResult(e, { lang }).kind); setCustomPlan(null); }
    setCustomPlanLoading(false); endOp("custom-plan");
  };

  const toggleCustomTask = (id) => {
    setCustomTasks(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, done: !t.done } : t);
      if (savedCustomPlanId) {
        const idx = prev.findIndex(t => t.id === id);
        if (idx >= 0) {
          ActionPlansAPI.updateTaskDone(savedCustomPlanId, idx, !prev[idx].done)
            .catch(err => console.warn("Failed to persist custom task toggle:", err.message));
        }
      }
      return updated;
    });
  };

  const exportPlan = (mode) => {
    setShowExportModal(false);
    const w = window.open("", "_blank");
    if (!w) return;
    const priorityColor = p => ({ High: HUE.red, Medium: HUE.amber, Low: HUE.green }[p] || INK_MUTED);
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
    const chatInsights = messages.filter(m => m.role === "ai" && !m.failure && typeof m.text === "string" && !m.text.startsWith("Welcome")).map(m => `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:8px"><div style="font-size:12px;color:#64748b;margin-bottom:4px">AI Insight</div><div style="font-size:13px;color:#334155;white-space:pre-wrap">${m.text.replace(/\*\*/g, "").replace(/##\s/g, "").slice(0, 500)}${m.text.length > 500 ? "..." : ""}</div></div>`).join("");
    const titleMap = { recommended: "Recommended Action Plan", customized: "Customized Action Plan", both: "Action Plan Comparison" };

    let bodyContent = "";
    if (mode === "recommended") {
      bodyContent = `
        <div class="section">Recommended Action Plan</div>
        ${buildTaskTable(tasks)}
        ${buildProgress(tasks)}
        ${buildFeedbackNotes()}
        ${solutions && !solutionsFailure ? `<div class="section">Solutions &amp; Recommendations</div><div style="font-size:13px;color:#334155;white-space:pre-wrap">${solutions.replace(/\*\*/g, "").replace(/##\s/g, "").replace(/\n/g, "<br>")}</div>` : ""}
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
        ${solutions && !solutionsFailure ? `<div class="section">Solutions &amp; Recommendations</div><div style="font-size:13px;color:#334155;white-space:pre-wrap">${solutions.replace(/\*\*/g, "").replace(/##\s/g, "").replace(/\n/g, "<br>")}</div>` : ""}
        ${chatInsights ? `<div class="section">Chat Insights</div>${chatInsights}` : ""}`;
    }

    printDocument(w, `<!DOCTYPE html><html><head><title>${titleMap[mode]} - ${stair.title}</title>
      <style>@page{margin:20mm 15mm${mode === "both" ? ";size:landscape" : ""}}*{box-sizing:border-box;margin:0;padding:0}body{background:#fff;color:#1e293b;font-family:'Segoe UI',system-ui,sans-serif;line-height:1.5}.header{padding-bottom:16px;border-bottom:2px solid #B8904A;margin-bottom:20px}table{width:100%;border-collapse:collapse}thead th{text-align:left;padding:10px 8px;border-bottom:2px solid #B8904A;color:#B8904A;font-size:11px;text-transform:uppercase;font-weight:600}.section{margin-top:24px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;color:#B8904A;font-size:16px;font-weight:700}.footer{text-align:center;margin-top:30px;padding-top:16px;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:10px}</style></head><body>
      <div class="header">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px"><img src="${logoUrl()}" style="height:32px" alt="DEVONEERS" /><div><div style="font-size:14px;font-weight:700;color:#B8904A;letter-spacing:2px;margin-bottom:4px">Stairs <span style="color:#64748b;font-weight:400;font-size:12px;letter-spacing:1px">&nbsp;|&nbsp; ${strategyContext?.name || "Strategy"} &nbsp;|&nbsp; ${new Date().toLocaleDateString()}</span></div><h1 style="font-size:24px;font-weight:700;margin:0">${strategyContext?.name || "Strategy"}</h1><div style="font-size:12px;color:#64748b">${strategyContext?.company || ""} &middot; Execution Room Export &middot; ${new Date().toLocaleDateString()}</div></div></div>
        <div style="margin-top:12px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11px;color:#B8904A;text-transform:uppercase;font-weight:600;margin-bottom:4px">Execution Room: ${stair.element_type?.replace("_", " ")}</div>
          <div style="font-size:16px;font-weight:700;color:#1e293b">${stair.code ? `<span style="color:#94a3b8;font-family:monospace;font-size:12px">${stair.code}</span> ` : ""}${stair.title}</div>
          ${stair.description ? `<div style="font-size:12px;color:#64748b;margin-top:4px">${stair.description}</div>` : ""}
          <div style="margin-top:8px;font-size:12px"><span style="color:#475569">Health:</span> ${stair.health || "N/A"} &nbsp;|&nbsp; <span style="color:#475569">Progress:</span> ${stair.progress_percent || 0}%</div>
        </div>
      </div>
      ${bodyContent}
      <div class="footer" style="text-align:center;margin-top:40px;padding-top:20px;border-top:2px solid #B8904A"><div style="font-size:14px;font-weight:700;color:#B8904A;letter-spacing:3px;margin-bottom:4px">BY DEVONEERS &bull; Stairs &bull; HUMAN IS THE LOOP &bull; ${new Date().getFullYear()}</div></div></body></html>`);
  };

  const LoadingDots = ({ label }) => (
    <div className="flex items-center gap-2 py-6 justify-center">
      <div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-amber-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
      <span className="text-ink-muted text-xs">{retryMsg || label}</span>
    </div>
  );

  // How much of this room's work is on the server. Drives the Manifest Room
  // signpost, so the client can see their work has a home and go find it.
  const savedWorkCount = Object.keys(generatedAt).length;

  // "Saved <when>" — persisted content should read as saved, not just present.
  const SavedStamp = ({ type, scope }) => {
    const ts = generatedAt[stampKey(type, scope)];
    if (!ts) return null;
    const d = new Date(ts);
    if (isNaN(d)) return null;
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20 whitespace-nowrap"
        title={`${isAr ? "محفوظ على الخادم" : "Saved on the server"} — ${d.toLocaleString()}`}>
        ✓ {isAr ? "محفوظ" : "Saved"} {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    );
  };

  // An empty step offers the work rather than doing it unasked.
  // `accent` tints the card and dashes its border — decoration, and a mark
  // colour is the right thing for that. The BUTTON is not decoration: it took
  // the same mark colour, built a gradient out of it inline and printed
  // --surface-app on the result, which is 2.78:1 for gold on paper and 2.40:1
  // for teal on the dark ground. A fill and its ink are one decision, so they
  // arrive together and as tokens — which also makes the pair measurable
  // instead of invisible to the audit.
  const GenerateCard = ({ title, body, cta, onGenerate, busy, accent, grad, ink }) => (
    <div className="rounded-lg p-4 text-center" style={{ background: `${tint(accent, 3)}`, border: `1px dashed ${tint(accent, 25)}` }}>
      <div className="text-sm font-medium text-ink-2 mb-1">{title}</div>
      <p className="text-xs text-ink-muted mb-3 max-w-md mx-auto leading-relaxed">{body}</p>
      <button onClick={onGenerate} disabled={busy || !loaded}
        className="px-4 py-2 rounded-lg text-xs font-semibold transition hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
        style={{ background: grad, color: ink }}>
        {busy ? (isAr ? "جاري الإنشاء..." : "Generating...") : cta}
      </button>
    </div>
  );

  const PriorityBadge = ({ priority }) => {
    const c = { High: "bg-red-500/20 text-red-300 border-red-500/30", Medium: "bg-amber-500/10 text-amber-300 border-amber-500/30", Low: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" };
    return <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${c[priority] || c.Medium}`}>{priority}</span>;
  };

  const tabs = [
    { key: "plan", icon: "📋", label: isAr ? "خطة العمل" : "Action Plan", sub: isAr ? "مهام منشأة بالذكاء الاصطناعي لتنفيذ هذا العنصر" : "AI-generated tasks to execute this element" },
    { key: "solutions", icon: "💡", label: isAr ? "التوصيات" : "Recommendations", sub: isAr ? "نصائح استراتيجية مرتبة حسب مستوى التأثير" : "Strategic advice organized by impact level" },
    { key: "chat", icon: "💬", label: isAr ? "المحادثة" : "Chat", sub: isAr ? "اطرح أسئلة متابعة حول هذا العنصر" : "Ask follow-up questions about this element" },
  ];

  return (
    <div data-testid="execution-room" className="fixed inset-0 z-[90] flex flex-col" style={{ background: `linear-gradient(180deg, ${DEEP} 0%, ${DEEP_MID} 50%, ${DEEP} 100%)` }}>
      {/* Header */}
      {/* Two rows. The breadcrumb is a thin, quiet strip above the identity
          line rather than another control beside it — it costs vertical space,
          which the room has, instead of horizontal space, which it does not.
          It also pays for itself: it absorbs the Back button, the step code
          that was printed twice, and the inert strategy name that used to sit
          at the right edge of the tab bar. Net one control lighter. */}
      <header className="shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="px-6 pt-2 pb-1">
          <RoomBreadcrumb stair={stair} strategyContext={strategyContext} isAr={isAr} onNavigate={onNavigate} />
        </div>
        <div className="flex items-center justify-between gap-4 px-6 pb-2.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span style={{ color, fontSize: 15 }} className="shrink-0">{typeIcons[stair.element_type] || "•"}</span>
          <span className="hidden sm:inline text-[10px] uppercase tracking-wider font-semibold shrink-0" style={{ color }}>{stair.element_type?.replace("_", " ")}</span>
          <span className="text-ink text-sm font-medium truncate min-w-0">{stair.title}</span>
          <span className="shrink-0"><HealthBadge health={stair.health} compactBelowSm /></span>
          <div className="text-xs font-medium shrink-0" style={{ color }}>{stair.progress_percent || 0}%</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {unsaved.length > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-red-500/15 text-red-300 border border-red-500/30"
              title={`${isAr ? "لم يتم الحفظ على الخادم" : "Not saved to the server"}: ${unsaved.map(u => u.label).join(", ")}`}>
              ⚠ {isAr ? `${unsaved.length} غير محفوظ` : `${unsaved.length} not saved`}
            </span>
          )}
          {/* The cluster is what sheds words as the bar narrows — the
              breadcrumb is the last thing to give up space, because below 640
              with no sidebar it is the only navigation on screen. Every label
              that hides visually stays in aria-label: display:none content is
              dropped from the accessible name, so an icon-only chip without
              one is unnamed to a screen reader. */}
          {hasSavedPlan && (
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
              title={isAr ? "الخطة محفوظة" : "Plan saved"}>
              <span className="text-emerald-400" aria-hidden="true">✓</span>
              <span className="sr-only xl:not-sr-only">{isAr ? "الخطة محفوظة" : "Plan saved"}</span>
            </span>
          )}
          {/* Where the saved work lives. "Plan saved" tells you it went
              somewhere; this says where and takes you there. */}
          {onOpenManifest && savedWorkCount > 0 && (
            <button onClick={onOpenManifest}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition hover:scale-[1.02] text-ink-2 hover:text-ink"
              style={{ borderColor: BORDER, background: "rgb(var(--surface-hover-rgb) / 0.04)" }}
              title={isAr ? "افتح سجل التنفيذ لرؤية كل ما تم إنشاؤه وحفظه" : "Open the Manifest Room to see everything you've generated and saved"}>
              <span aria-hidden="true">📦</span>
              <span>{savedWorkCount}</span>
              <span className="sr-only md:not-sr-only">{isAr
                ? "عنصر محفوظ — سجل التنفيذ"
                : `saved ${savedWorkCount === 1 ? "item" : "items"} · Manifest Room`}</span>
            </button>
          )}
          <button onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:scale-[1.02] shrink-0"
            style={{ borderColor: `${tint(GOLD, 38)}`, color: GOLD_INK, background: "transparent" }}>
            <span aria-hidden="true">↓</span>
            <span className="sr-only sm:not-sr-only">{isAr ? "تصدير" : "Export Plan"}</span>
          </button>
        </div>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="flex items-center gap-1 px-6 py-2 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 rounded-lg text-left whitespace-nowrap transition ${activeTab === t.key ? "bg-amber-500/15 border border-amber-500/20" : "border border-transparent hover:bg-lift/5"}`}>
            <div className={`text-xs font-medium ${activeTab === t.key ? "text-amber-300" : "text-ink-muted"}`}>{t.icon} {t.label}</div>
            <div className={`text-[10px] mt-0.5 ${activeTab === t.key ? "text-amber-300/60" : "text-ink-faint"}`}>{t.sub}</div>
          </button>
        ))}
        {/* The strategy name used to sit here as a plain <span> — it named a
            destination and never went there. It is now segment 1 of the
            breadcrumb, where it is a link. */}
      </nav>

      {/* Save / load failures — surfaced, never silent */}
      {unsaved.length > 0 && (
        <div className="px-6 py-2 shrink-0 flex items-center gap-2 text-[11px] bg-red-500/10 border-b border-red-500/20 text-red-300">
          <span>⚠</span>
          <span className="flex-1">
            {isAr
              ? `تعذّر حفظ ${unsaved.length} عنصر على الخادم (${unsaved.map(u => u.label).join("، ")}). ما زال معروضًا هنا — لا تُغلق الصفحة قبل إعادة المحاولة.`
              : `Couldn't save ${unsaved.length} item${unsaved.length > 1 ? "s" : ""} to the server (${unsaved.map(u => u.label).join(", ")}). Still shown here — don't close this page before retrying.`}
          </span>
        </div>
      )}
      {loadFailed && (
        <div className="px-6 py-2 shrink-0 flex items-center gap-2 text-[11px] bg-amber-500/10 border-b border-amber-500/20 text-amber-300">
          <span>⚠</span>
          <span className="flex-1">
            {isAr
              ? "تعذّر تحميل المحتوى المحفوظ. لن يُعاد الإنشاء تلقائيًا حتى لا تفقد عملك — أعد المحاولة."
              : "Couldn't load your saved content. Nothing was regenerated automatically so your work isn't overwritten — reopen this room to retry."}
          </span>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {/* Action Plan Tab — Split View + 4-Step Wizard */}
        {activeTab === "plan" && (
          <div className="h-full flex flex-col">
            {/* Top bar */}
            <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="text-lg font-semibold text-ink shrink-0">{isAr ? "خطة العمل" : "Action Plan"}</h2>
                {tasks.length > 0 && (
                  <span className="text-xs text-ink-muted shrink-0">
                    {tasks.filter(t => t.done).length}/{tasks.length} {isAr ? "مكتمل" : "completed"}
                  </span>
                )}
                <SavedStamp type="action_plan" scope={stair.id} />
                {planValidation && (
                  <div className="hidden sm:flex items-center gap-2 min-w-0">
                    <ConfidenceBadge validation={planValidation} agentsUsed={planAgentsUsed} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {actionPlan && onSaveNote && (
                  <button onClick={() => onSaveNote(`📋 Action Plan: ${stair.title}`, actionPlan, "execution_plan")} className="text-xs text-ink-faint hover:text-amber-400 transition px-2 py-1 rounded hover:bg-amber-500/10">
                    📌 {isAr ? "حفظ" : "Save"}
                  </button>
                )}
                {(actionPlan || tasks.length > 0) && (
                  <button onClick={generateActionPlan} disabled={planLoading || !loaded} className="text-xs text-amber-400/70 hover:text-amber-400 transition px-2 py-1 rounded hover:bg-amber-500/10 disabled:opacity-30">
                    {planLoading ? "..." : `↻ ${isAr ? "تجديد" : "Regenerate"}`}
                  </button>
                )}
              </div>
            </div>

            {!loaded ? (
              <div className="flex-1 flex items-center justify-center text-ink-faint text-sm">
                {isAr ? "جاري تحميل المحتوى المحفوظ..." : "Loading your saved work..."}
              </div>
            ) : planLoading && !actionPlan ? (
              <div className="flex-1 overflow-y-auto p-6">
                <AgentActivityIndicator agentStep={agentStep} />
              </div>
            ) : planFailure && tasks.length === 0 ? (
              <div className="flex-1 overflow-y-auto p-6 mx-auto w-full" style={{ maxWidth: 900 }}>
                <AiUnavailable kind={planFailure} lang={lang} onRetry={generateActionPlan} retrying={planLoading} />
              </div>
            ) : tasks.length === 0 && !actionPlan ? (
              <div className="flex-1 overflow-y-auto p-6 mx-auto w-full flex items-center" style={{ maxWidth: 620 }}>
                <div className="w-full">
                  <GenerateCard
                    accent={GOLD} grad={GRAD_ACCENT} ink={INK_ON_ACCENT}
                    title={isAr ? "لا توجد خطة عمل بعد" : "No action plan yet"}
                    body={isAr
                      ? "أنشئ خطة عمل لهذه الخطوة. ستُحفظ تلقائيًا وتظهر في كل مرة تفتح فيها غرفة التنفيذ."
                      : "Generate an action plan for this step. It's saved automatically and will be here every time you open the Execution Room."}
                    cta={isAr ? "✨ إنشاء خطة العمل" : "✨ Generate action plan"}
                    onGenerate={generateActionPlan}
                    busy={planLoading}
                  />
                </div>
              </div>
            ) : tasks.length === 0 && actionPlan ? (
              <div className="flex-1 overflow-y-auto p-6 mx-auto w-full" style={{ maxWidth: 900 }}>
                <div className="rounded-xl p-5" style={{ ...glass(0.5), borderLeft: `3px solid ${HUE.teal}` }}>
                  <Markdown text={actionPlan} onMatrixClick={onMatrixClick} />
                  <LoadMatrixButtons text={actionPlan} onLoadMatrix={onMatrixClick} />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex min-h-0">
                {/* ───── LEFT PANEL — Compact action cards ───── */}
                {(!isNarrow || !selectedTaskId) && (
                  <div
                    className={`${isNarrow ? "w-full" : "w-[30%] min-w-[260px] max-w-[380px]"} h-full overflow-y-auto p-4 space-y-2 shrink-0`}
                    style={{ borderRight: isNarrow ? "none" : `1px solid ${BORDER}` }}
                  >
                    {planValidation && <div className="mb-2"><ValidationWarnings validation={planValidation} /></div>}
                    {tasks.map(t => {
                      const st = getActionStatus(t);
                      const active = selectedTaskId === t.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => selectAction(t)}
                          className={`rounded-lg p-3 cursor-pointer transition ${active ? "ring-1 ring-amber-500/40" : "hover:bg-white/[0.03]"} ${t.done ? "opacity-60" : ""}`}
                          style={active ? { ...glass(0.6), borderLeft: `3px solid ${GOLD}` } : glass(0.3)}
                        >
                          <div className="flex items-start gap-2.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}
                              className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition text-[10px] ${t.done ? "bg-emerald-500/30 border-emerald-500/50 text-emerald-300" : "border-hairline-strong hover:border-amber-500/50"}`}
                            >
                              {t.done && "✓"}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-1.5 justify-between">
                                <span className={`text-xs font-semibold leading-snug ${t.done ? "line-through text-ink-muted" : "text-ink"}`}>{t.name}</span>
                                <span className="shrink-0"><PriorityBadge priority={t.priority} /></span>
                              </div>
                              <div className="flex items-center gap-3 mt-2 flex-wrap">
                                <span className="text-[10px] text-ink-muted"><span className="opacity-70">⏱</span> {t.timeline}</span>
                                <span className={`text-[10px] font-medium ${st.cls}`}>{st.icon} {st.label}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ───── RIGHT PANEL — Detail wizard for selected action ───── */}
                {(!isNarrow || selectedTaskId) && (
                  <div className={`${isNarrow ? "w-full" : "flex-1"} h-full overflow-y-auto`}>
                    {!selectedTask ? (
                      <div className="h-full flex flex-col items-center justify-center text-center px-6">
                        <div className="text-4xl mb-3">👈</div>
                        <h3 className="text-ink text-base font-semibold mb-1">{isAr ? "اختر إجراءً للبدء" : "Select an action to begin"}</h3>
                        <p className="text-ink-muted text-sm max-w-sm">
                          {isAr
                            ? "اختر إجراءً من القائمة على اليسار لتمر عبر خطوات الفهم والتقييم والتخصيص والتنفيذ."
                            : "Pick an action from the list to walk through Understand → Assess → Customize → Implement."}
                        </p>
                      </div>
                    ) : (
                      <div className="p-6 mx-auto w-full" style={{ maxWidth: 760 }}>
                        {/* Selected action header */}
                        {isNarrow && (
                          <button
                            onClick={() => setSelectedTaskId(null)}
                            className="flex items-center gap-1.5 text-xs text-ink-3 hover:text-amber-400 transition mb-3 px-2 py-1 rounded hover:bg-amber-500/10"
                          >
                            <span>←</span> {isAr ? "كل الإجراءات" : "All actions"}
                          </button>
                        )}
                        <div className="mb-5">
                          <div className="flex items-start gap-2 flex-wrap">
                            <h3 className="text-base font-semibold text-ink-2 leading-snug">{selectedTask.name}</h3>
                            <PriorityBadge priority={selectedTask.priority} />
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-[11px] text-ink-muted">
                            <span><span className="opacity-70">👤</span> {selectedTask.owner}</span>
                            <span><span className="opacity-70">⏱</span> {selectedTask.timeline}</span>
                          </div>
                        </div>

                        {/* Step indicator + progress bar */}
                        <div className="mb-5">
                          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {wizardSteps.map(s => {
                                const isActive = wizardStep === s.n;
                                const isDone = wizardStep > s.n;
                                return (
                                  <button
                                    key={s.n}
                                    data-tutorial={s.tutorial}
                                    onClick={() => goToStep(s.n)}
                                    className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full border font-medium transition ${
                                      isActive
                                        ? "text-ink"
                                        : isDone
                                          ? "text-ink-3 border-transparent hover:bg-lift/5"
                                          : "text-ink-faint border-transparent hover:bg-lift/5"
                                    }`}
                                    /* No `color` here on purpose. It used to set the step's own
                                       hue, which silently beat the `text-ink` class above it —
                                       inline style always does — and left the ACTIVE step, the
                                       one thing on this row that has to be readable, at 1.88:1
                                       for Assess and under 4.5:1 for three of the four in dark.
                                       The hue still identifies the step through the background
                                       tint and the border; the label just reads. */
                                    style={isActive ? { background: `${tint(s.color, 15)}`, borderColor: `${tint(s.color, 38)}` } : {}}
                                  >
                                    <span>{isDone ? "✓" : s.icon}</span> {s.label}
                                  </button>
                                );
                              })}
                            </div>
                            <span className="text-xs font-medium text-ink-3 shrink-0">
                              {isAr ? `الخطوة ${wizardStep}/4` : `Step ${wizardStep}/4`}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-hairline-strong overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${(wizardStep / 4) * 100}%`, background: GRAD_ACCENT_90 }}
                            />
                          </div>
                        </div>

                        {/* Step content */}
                        <div className="rounded-xl p-4 mb-5" style={{ ...glass(0.4), borderLeft: `3px solid ${wizardSteps[wizardStep - 1].color}` }}>

                          {/* ── Step 1: UNDERSTAND ── */}
                          {wizardStep === 1 && (
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-blue-400 text-sm font-semibold">📖 {isAr ? "افهم: ماذا يعني هذا ولماذا يهم" : "Understand: what it means & why it matters"}</span>
                                {explainChats[selectedTaskId]?.[0]?.sources_used?.length > 0 && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400/70 border border-blue-500/15">
                                    {isAr ? "مدعوم بمصدر الحقيقة" : "Grounded in Source of Truth"}
                                  </span>
                                )}
                                <SavedStamp type={ARTIFACT.EXPLAIN} scope={taskScope(stair.id, selectedTaskId)} />
                              </div>
                              {loaded && !explainChats[selectedTaskId] && !explainChatLoading && (
                                <div className="mb-3">
                                  <GenerateCard
                                    accent={HUE.blue} grad={GRAD_BLUE} ink={DEEP}
                                    title={isAr ? "لم يُنشأ شرح بعد" : "No explanation yet"}
                                    body={isAr
                                      ? "اطلب شرحًا لهذا الإجراء بلغة بسيطة، مبنيًا على مستنداتك في مصدر الحقيقة. يُحفظ الشرح ويظهر في كل زيارة."
                                      : "Ask for a plain-language explanation of this action, grounded in your Source of Truth documents. It's saved and will be here next time."}
                                    cta={isAr ? "📖 اشرح هذا الإجراء" : "📖 Explain this action"}
                                    onGenerate={() => runExplain(selectedTask)}
                                    busy={explainChatLoading}
                                  />
                                </div>
                              )}
                              <div className="max-h-[420px] overflow-y-auto space-y-2 mb-3">
                                {explainChatLoading && !explainChats[selectedTaskId] && (
                                  <div className="flex items-center gap-2 py-6 justify-center">
                                    <div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                                    <span className="text-ink-muted text-xs">{retryMsg || (isAr ? "جاري إعداد الشرح..." : "Preparing explanation...")}</span>
                                  </div>
                                )}
                                {(explainChats[selectedTaskId] || []).map((m, i) => m.failure ? (
                                  <div key={i} className="flex justify-start"><div className="max-w-[85%] w-full"><AiUnavailable compact kind={m.failure} lang={lang} onRetry={() => { setExplainChats(prev => { const n = { ...prev }; delete n[selectedTaskId]; return n; }); runExplain(selectedTask); }} /></div></div>
                                ) : (
                                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                                      m.role === "user"
                                        ? "bg-blue-500/20 text-blue-100 rounded-br-sm"
                                        : m.error
                                          ? "bg-red-500/10 text-red-300 rounded-bl-sm border border-red-500/20"
                                          : "bg-input text-ink-2 rounded-bl-sm border border-blue-500/15"
                                    }`}>
                                      {m.role === "ai" ? <><Markdown text={m.text} onMatrixClick={onMatrixClick} /><LoadMatrixButtons text={m.text} onLoadMatrix={onMatrixClick} /></> : <span className="whitespace-pre-wrap">{m.text}</span>}
                                    </div>
                                  </div>
                                ))}
                                {explainChatLoading && explainChats[selectedTaskId] && (
                                  <div className="flex gap-1 px-2 py-1">{[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                                )}
                                <div ref={explainChatEndRef} />
                              </div>
                              {explainChats[selectedTaskId] && explainChats[selectedTaskId].length === 1 && !explainChats[selectedTaskId][0].error && !explainChats[selectedTaskId][0].failure && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                  {(isAr
                                    ? ["هل يمكنك تبسيط أكثر؟", "ما الذي قد يفشل؟", "أعطني مثالاً عملياً"]
                                    : ["Can you simplify further?", "What could go wrong?", "Give me a real example"]
                                  ).map((q, i) => (
                                    <button key={i} onClick={() => setExplainChatInput(q)} className="text-[10px] px-2.5 py-1 rounded-full border border-blue-500/20 text-blue-400/70 hover:bg-blue-500/10 transition">{q}</button>
                                  ))}
                                </div>
                              )}
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={explainChatInput}
                                  onChange={e => setExplainChatInput(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); sendExplainChat(selectedTaskId); } }}
                                  placeholder={isAr ? "اسأل لفهم أعمق..." : "Ask to understand more..."}
                                  disabled={explainChatLoading}
                                  className="flex-1 px-3 py-2 rounded-lg bg-input border border-blue-500/20 text-ink placeholder-ink-faint focus:border-blue-500/40 focus:outline-none transition text-xs"
                                />
                                <button
                                  onClick={() => sendExplainChat(selectedTaskId)}
                                  disabled={explainChatLoading || !explainChatInput.trim()}
                                  className="px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-30 transition-all hover:scale-105"
                                  style={{ background: GRAD_BLUE, color: DEEP }}
                                >
                                  {isAr ? "إرسال" : "Send"}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* ── Step 2: ASSESS ── */}
                          {wizardStep === 2 && (
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-teal-300 text-sm font-semibold">🎯 {isAr ? "قيّم: إلى أي مدى تستطيع تنفيذ هذا؟" : "Assess: how far can you do this?"}</span>
                              </div>
                              <div className="max-h-[420px] overflow-y-auto space-y-2 mb-3">
                                {(actionChats[selectedTaskId] || []).map((m, i) => m.failure ? (
                                  <div key={i} className="flex justify-start"><div className="max-w-[85%] w-full"><AiUnavailable compact kind={m.failure} lang={lang} /></div></div>
                                ) : (
                                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                                      m.role === "user"
                                        ? "bg-amber-500/10 text-amber-100 rounded-br-sm"
                                        : m.error
                                          ? "bg-red-500/10 text-red-300 rounded-bl-sm border border-red-500/20"
                                          : "bg-input text-ink-2 rounded-bl-sm border border-hairline-strong"
                                    }`}>
                                      {m.role === "ai" ? <><Markdown text={m.text} onMatrixClick={onMatrixClick} /><LoadMatrixButtons text={m.text} onLoadMatrix={onMatrixClick} /></> : <span className="whitespace-pre-wrap">{m.text}</span>}
                                    </div>
                                  </div>
                                ))}
                                {actionChatLoading && actionChatTaskId === selectedTaskId && (
                                  <div className="flex gap-1 px-2 py-1">{[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-teal-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                                )}
                                <div ref={actionChatEndRef} />
                              </div>
                              {(actionChats[selectedTaskId] || []).length <= 1 && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                  {(isAr
                                    ? ["أستطيع بالكامل", "جزئياً فقط", "لا أستطيع حالياً"]
                                    : ["Fully", "Partially", "Not currently"]
                                  ).map((q, i) => (
                                    <button key={i} onClick={() => setActionChatInput(q)} className="text-[10px] px-2.5 py-1 rounded-full border border-teal-500/20 text-teal-400/70 hover:bg-teal-500/10 transition">{q}</button>
                                  ))}
                                </div>
                              )}
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={actionChatInput}
                                  onChange={e => setActionChatInput(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); sendActionChat(selectedTaskId); } }}
                                  placeholder={isAr ? "أخبرني عن قدرتك وقيودك..." : "Tell me about your ability and constraints..."}
                                  disabled={actionChatLoading}
                                  className="flex-1 px-3 py-2 rounded-lg bg-input border border-hairline-strong text-ink placeholder-ink-faint focus:border-teal-500/40 focus:outline-none transition text-xs"
                                />
                                <button
                                  onClick={() => sendActionChat(selectedTaskId)}
                                  disabled={actionChatLoading || !actionChatInput.trim()}
                                  className="px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-30 transition-all hover:scale-105"
                                  style={{ background: GRAD_TEAL, color: DEEP }}
                                >
                                  {isAr ? "إرسال" : "Send"}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* ── Step 3: CUSTOMIZE ── */}
                          {wizardStep === 3 && (
                            <div data-tutorial="custom-plan">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-amber-300 text-sm font-semibold">✨ {isAr ? "خصّص: خطة مبنية على تقييمك" : "Customize: a plan based on your assessment"}</span>
                                <SavedStamp type="custom_plan" scope={stair.id} />
                              </div>
                              {!hasFeedback() && !customPlan && (
                                <p className="text-[11px] text-ink-muted mb-3">
                                  {isAr
                                    ? "💡 أكمل الخطوة 2 (قيّم) لإضافة ملاحظاتك أولاً حتى يتمكن الذكاء الاصطناعي من تخصيص الخطة."
                                    : "💡 Complete Step 2 (Assess) to add your feedback so the AI can tailor the plan."}
                                </p>
                              )}
                              {customPlanLoading && !customPlan ? (
                                <LoadingDots label={isAr ? "جاري إنشاء خطتك المخصصة..." : "Generating your customized plan..."} />
                              ) : customPlanFailure ? (
                                <div className="mb-3"><AiUnavailable compact kind={customPlanFailure} lang={lang} onRetry={generateCustomPlan} retrying={customPlanLoading} /></div>
                              ) : customPlan ? (
                                <div className="rounded-lg p-3 max-h-[420px] overflow-y-auto bg-input border border-amber-500/15 text-ink-2 text-xs leading-relaxed mb-3">
                                  <Markdown text={customPlan} onMatrixClick={onMatrixClick} />
                                  <LoadMatrixButtons text={customPlan} onLoadMatrix={onMatrixClick} />
                                </div>
                              ) : (
                                <p className="text-xs text-ink-muted mb-3">
                                  {isAr
                                    ? "بناءً على تقييمك في الخطوة السابقة، سيُنشئ الذكاء الاصطناعي خطة عمل مخصصة تتكيف مع قدراتك وقيودك."
                                    : "Based on your assessment in the previous step, the AI will generate a customized action plan adapted to your capabilities and constraints."}
                                </p>
                              )}
                              <div className="flex items-center gap-3 flex-wrap">
                                <button
                                  onClick={generateCustomPlan}
                                  disabled={customPlanLoading || !hasFeedback()}
                                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                                  style={{
                                    background: hasFeedback() ? GRAD_ACCENT : `${tint(GOLD, 19)}`,
                                    color: hasFeedback() ? INK_ON_ACCENT : INK_3,
                                    border: `1px solid ${hasFeedback() ? GOLD : GOLD + "40"}`,
                                  }}
                                  title={!hasFeedback() ? (isAr ? "أضف ملاحظاتك في الخطوة 2 أولاً" : "Add your feedback in Step 2 first") : ""}
                                >
                                  {customPlanLoading
                                    ? (isAr ? "جاري الإنشاء..." : "Generating...")
                                    : <><span className="text-sm">✨</span> {customPlan ? (isAr ? "إعادة إنشاء الخطة المخصصة" : "Regenerate Customized Plan") : (isAr ? "إنشاء خطة عمل مخصصة لي" : "Generate My Customized Plan")}</>}
                                </button>
                                {customPlan && onSaveNote && (
                                  <button onClick={() => onSaveNote(`✨ Customized Plan: ${stair.title}`, customPlan, "custom_plan")} className="text-xs text-ink-faint hover:text-amber-400 transition px-2 py-1 rounded hover:bg-amber-500/10">
                                    📌 {isAr ? "حفظ في الملاحظات" : "Save to Notes"}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* ── Step 4: IMPLEMENT ── */}
                          {wizardStep === 4 && (
                            <div data-tutorial="impl-room">
                              <div className="flex items-center gap-2 mb-3 flex-wrap">
                                <span className="text-purple-400 text-sm font-semibold">🚀 {isAr ? "نفّذ: دليل خطوة بخطوة" : "Implement: step-by-step guide"}</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400/70 border border-purple-500/15">
                                  {isAr ? "مرشدك الشخصي" : "Your Personal Coach"}
                                </span>
                                {implRoomData[selectedTaskId]?.sources_used?.length > 0 && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400/70 border border-blue-500/15">
                                    {isAr ? "مدعوم بمصدر الحقيقة" : "Source of Truth"}
                                  </span>
                                )}
                                <SavedStamp type={ARTIFACT.IMPL_GUIDE} scope={taskScope(stair.id, selectedTaskId)} />
                              </div>
                              {loaded && !implRoomData[selectedTaskId] && !implRoomLoading && (
                                <GenerateCard
                                  accent={HUE.violet} grad={GRAD_VIOLET} ink={DEEP}
                                  title={isAr ? "لا يوجد دليل تنفيذ بعد" : "No implementation guide yet"}
                                  body={isAr
                                    ? "احصل على دليل خطوة بخطوة مع المتطلبات والجدول الزمني ومعايير النجاح. يُحفظ الدليل مع قائمة الخطوات وتقدمك."
                                    : "Get a step-by-step guide with prerequisites, timeline and success criteria. The guide, its checklist and your progress are all saved."}
                                  cta={isAr ? "🚀 إنشاء دليل التنفيذ" : "🚀 Generate implementation guide"}
                                  onGenerate={() => runImplRoom(selectedTask)}
                                  busy={implRoomLoading}
                                />
                              )}
                              {implRoomLoading && !implRoomData[selectedTaskId] && (
                                <div className="flex items-center gap-2 py-6 justify-center">
                                  <div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-purple-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                                  <span className="text-ink-muted text-xs">{retryMsg || (isAr ? "جاري إعداد دليل التنفيذ..." : "Preparing your implementation guide...")}</span>
                                </div>
                              )}
                              {implRoomData[selectedTaskId] && (
                                <>
                                  {implRoomData[selectedTaskId].steps.length > 0 && (
                                    <div className="mb-3 p-3 rounded-lg border border-purple-500/15" style={{ background: tint(HUE.violet, 5) }}>
                                      <div className="text-[11px] text-purple-300 font-medium mb-2">{isAr ? "تقدم الخطوات" : "Step Progress"} — {implRoomData[selectedTaskId].steps.filter(s => s.done).length}/{implRoomData[selectedTaskId].steps.length}</div>
                                      <div className="space-y-1.5">
                                        {implRoomData[selectedTaskId].steps.map((step, si) => (
                                          <label key={step.id} className="flex items-start gap-2 cursor-pointer group">
                                            <button
                                              onClick={() => toggleImplStep(selectedTaskId, step.id)}
                                              className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition text-[9px] ${
                                                step.done ? "bg-purple-500/30 border-purple-500/50 text-purple-300" : "border-purple-500/30 hover:border-purple-500/60 group-hover:border-purple-400/50"
                                              }`}
                                            >
                                              {step.done && "✓"}
                                            </button>
                                            <span className={`text-[11px] leading-relaxed ${step.done ? "line-through text-ink-faint" : "text-ink-2"}`}>
                                              <span className="text-purple-400/70 font-medium">{si + 1}.</span> {step.label}
                                            </span>
                                          </label>
                                        ))}
                                      </div>
                                      <div className="mt-2 h-1.5 rounded-full bg-hairline-strong overflow-hidden">
                                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${implRoomData[selectedTaskId].steps.length ? (implRoomData[selectedTaskId].steps.filter(s => s.done).length / implRoomData[selectedTaskId].steps.length) * 100 : 0}%`, background: `${GRAD_VIOLET_90}` }} />
                                      </div>
                                    </div>
                                  )}
                                  {implRoomData[selectedTaskId].failure ? (
                                    <div className="mb-3">
                                      <AiUnavailable compact kind={implRoomData[selectedTaskId].failure} lang={lang} onRetry={() => { setImplRoomData(prev => { const n = { ...prev }; delete n[selectedTaskId]; return n; }); runImplRoom(selectedTask); }} retrying={implRoomLoading} />
                                    </div>
                                  ) : (
                                    <div className="max-h-80 overflow-y-auto mb-3">
                                      <div className="rounded-lg px-3 py-2 text-xs leading-relaxed bg-input border border-purple-500/15 text-ink-2">
                                        <Markdown text={implRoomData[selectedTaskId].content} onMatrixClick={onMatrixClick} />
                                        <LoadMatrixButtons text={implRoomData[selectedTaskId].content} onLoadMatrix={onMatrixClick} />
                                      </div>
                                    </div>
                                  )}
                                  {(implRoomData[selectedTaskId].messages || []).length > 0 && (
                                    <div className="max-h-48 overflow-y-auto space-y-2 mb-3">
                                      {implRoomData[selectedTaskId].messages.map((m, i) => m.failure ? (
                                        <div key={i} className="flex justify-start"><div className="max-w-[85%] w-full"><AiUnavailable compact kind={m.failure} lang={lang} /></div></div>
                                      ) : (
                                        <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                          <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                                            m.role === "user"
                                              ? "bg-purple-500/20 text-purple-100 rounded-br-sm"
                                              : m.error
                                                ? "bg-red-500/10 text-red-300 rounded-bl-sm border border-red-500/20"
                                                : "bg-input text-ink-2 rounded-bl-sm border border-purple-500/15"
                                          }`}>
                                            {m.role === "ai" ? <><Markdown text={m.text} onMatrixClick={onMatrixClick} /><LoadMatrixButtons text={m.text} onLoadMatrix={onMatrixClick} /></> : <span className="whitespace-pre-wrap">{m.text}</span>}
                                          </div>
                                        </div>
                                      ))}
                                      {implRoomChatLoading && implRoomTaskId === selectedTaskId && (
                                        <div className="flex gap-1 px-2 py-1">{[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-purple-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                                      )}
                                      <div ref={implRoomEndRef} />
                                    </div>
                                  )}
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      value={implRoomChatInput}
                                      onChange={e => setImplRoomChatInput(e.target.value)}
                                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); sendImplRoomChat(selectedTaskId); } }}
                                      placeholder={isAr ? "اسأل مرشدك عن أي خطوة..." : "Ask your coach about any step..."}
                                      disabled={implRoomChatLoading}
                                      className="flex-1 px-3 py-2 rounded-lg bg-input border border-purple-500/20 text-ink placeholder-ink-faint focus:border-purple-500/40 focus:outline-none transition text-xs"
                                    />
                                    <button
                                      onClick={() => sendImplRoomChat(selectedTaskId)}
                                      disabled={implRoomChatLoading || !implRoomChatInput.trim()}
                                      className="px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-30 transition-all hover:scale-105"
                                      style={{ background: GRAD_VIOLET, color: DEEP }}
                                    >
                                      {isAr ? "إرسال" : "Send"}
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Wizard navigation */}
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => goToStep(wizardStep - 1)}
                            disabled={wizardStep === 1}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border transition disabled:opacity-30 disabled:cursor-not-allowed"
                            style={{ borderColor: BORDER, color: INK_3 }}
                          >
                            <span>←</span> {isAr ? "السابق" : "Back"}
                          </button>
                          <button
                            onClick={() => goToStep(wizardStep + 1)}
                            disabled={wizardStep === 4}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition hover:scale-[1.02] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
                            style={{ background: GRAD_ACCENT, color: INK_ON_ACCENT }}
                          >
                            {isAr ? "التالي" : "Next"} <span>→</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Solutions Tab */}
        {activeTab === "solutions" && (
          <div className="h-full overflow-y-auto px-6 py-5 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-ink">{isAr ? "التوصيات" : "Recommendations"}</h2>
                <SavedStamp type={ARTIFACT.SOLUTIONS} scope={stairScope(stair.id)} />
              </div>
              {solutions && (
                <button onClick={generateSolutions} disabled={solLoading || !loaded} className="text-xs text-amber-400/70 hover:text-amber-400 transition px-2 py-1 rounded hover:bg-amber-500/10 disabled:opacity-30">
                  {solLoading ? "..." : `↻ ${isAr ? "تجديد" : "Regenerate"}`}
                </button>
              )}
            </div>

            {!loaded ? (
              <div className="text-ink-faint text-sm text-center py-10">{isAr ? "جاري تحميل المحتوى المحفوظ..." : "Loading your saved work..."}</div>
            ) : solLoading && !solutions ? (
              <LoadingDots label={isAr ? "جاري إنشاء الحلول..." : "Generating solutions..."} />
            ) : solutionsFailure ? (
              <AiUnavailable kind={solutionsFailure} lang={lang} onRetry={generateSolutions} retrying={solLoading} />
            ) : solutions ? (
              <div className="rounded-xl p-5" style={glass(0.4)}>
                <Markdown text={solutions} onMatrixClick={onMatrixClick} />
                <LoadMatrixButtons text={solutions} onLoadMatrix={onMatrixClick} />
              </div>
            ) : (
              <GenerateCard
                accent={TEAL} grad={GRAD_TEAL} ink={DEEP}
                title={isAr ? "لا توجد توصيات بعد" : "No recommendations yet"}
                body={isAr
                  ? "احصل على مكاسب سريعة وتحركات استراتيجية وتخفيف للمخاطر لهذه الخطوة. تُحفظ النتيجة ولن يُعاد إنشاؤها تلقائيًا."
                  : "Get quick wins, strategic moves and risk mitigation for this step. The result is saved and won't be regenerated on its own."}
                cta={isAr ? "💡 إنشاء التوصيات" : "💡 Generate recommendations"}
                onGenerate={generateSolutions}
                busy={solLoading}
              />
            )}

            {solutions && onSaveNote && (
              <div className="mt-4">
                <button onClick={() => onSaveNote(`💡 Solutions: ${stair.title}`, solutions, "execution_solutions")} className="text-xs text-ink-faint hover:text-amber-400 transition px-2 py-1 rounded hover:bg-amber-500/10">
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
              {messages.map((m, i) => m.failure ? (
                <div key={i} className="flex justify-start"><div className="max-w-[74ch] w-full"><AiUnavailable kind={m.failure} lang={lang} onRetry={m.retry} retrying={chatLoading} /></div></div>
              ) : (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`group/msg relative max-w-[74ch] px-[18px] py-[15px] rounded-2xl text-[15px] leading-[1.68] ${
                    m.role === "user"
                      ? "bg-amber-500/10 text-amber-100 rounded-br-md"
                      : m.error
                        ? "bg-red-500/10 text-red-300 rounded-bl-md border border-red-500/20"
                        : "bg-raised text-ink-2 rounded-bl-md border border-hairline-strong"
                  }`}>
                    {m.role === "ai" ? <><Markdown text={m.text} onMatrixClick={onMatrixClick} /><LoadMatrixButtons text={m.text} onLoadMatrix={onMatrixClick} /></> : <div className="whitespace-pre-wrap">{m.text}</div>}
                    {m.role === "ai" && !m.error && (
                      <div className="flex items-center gap-2 mt-2">
                        {canSeeAgentTelemetry() && m.tokens > 0 && <span className="text-[10px] text-ink-faint">{m.tokens} tokens</span>}
                        <div className="flex-1" />
                        {onSaveNote && <button onClick={() => onSaveNote(m.text.slice(0, 60), m.text, "execution_chat")} className="opacity-0 group-hover/msg:opacity-100 text-[10px] text-ink-faint hover:text-amber-400 transition px-1.5 py-0.5 rounded hover:bg-amber-500/10" title="Save to Notes">📌 Save</button>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex items-center gap-2 px-4 py-2">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-amber-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}{retryMsg && <span className="text-amber-400/80 text-xs ml-1">{retryMsg}</span>}</div>
              )}
              <div ref={chatEndRef} />
            </div>

            {messages.length <= 1 && (
              <div className="shrink-0 flex flex-wrap gap-2 mb-3">
                {(isAr
                  ? ["ما الأطر التي تنطبق على هذا؟", "ما الذي قد يحدث خطأ؟", "أعطني خطة انطلاق سريعة لمدة 30 يومًا"]
                  : ["What frameworks apply to this?", "What could go wrong?", "Give me a 30-day quick-start plan"]
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
                className="flex-1 px-4 py-3 rounded-xl bg-input border border-hairline-strong text-ink placeholder-ink-faint focus:border-amber-500/40 focus:outline-none transition text-sm resize-none"
              />
              <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()} className="px-5 py-3 rounded-xl font-medium text-sm disabled:opacity-30 transition-all hover:scale-105 self-end" style={{ background: GRAD_ACCENT, color: INK_ON_ACCENT }}>
                {isAr ? "إرسال" : "Send"}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Export Options Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: cast(0.6), backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl border p-6 w-full max-w-md mx-4" style={{ background: DEEP, borderColor: BORDER }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-ink text-lg font-semibold">{isAr ? "خيارات التصدير" : "Export Options"}</h3>
              <button onClick={() => setShowExportModal(false)} className="text-ink-muted hover:text-ink transition text-lg">✕</button>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => exportPlan("recommended")}
                disabled={tasks.length === 0}
                className="w-full text-left p-4 rounded-xl border transition hover:scale-[1.01] disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ borderColor: `${BORDER}`, background: "rgb(var(--surface-hover-rgb) / 0.03)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">📋</span>
                  <span className="text-ink text-sm font-semibold">{isAr ? "خطة العمل الموصى بها" : "Recommended Action Plan"}</span>
                </div>
                <p className="text-ink-muted text-xs ml-7">{isAr ? "تصدير خطة العمل المقترحة من الذكاء الاصطناعي مع الحلول والملاحظات" : "Export the AI-suggested action plan with solutions and feedback notes"}</p>
              </button>
              <button
                onClick={() => exportPlan("customized")}
                disabled={customTasks.length === 0}
                className="w-full text-left p-4 rounded-xl border transition hover:scale-[1.01] disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ borderColor: `${tint(GOLD, 25)}`, background: `${tint(GOLD, 3)}` }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">✨</span>
                  <span className="text-amber-300 text-sm font-semibold">{isAr ? "خطة العمل المخصصة" : "Customized Action Plan"}</span>
                </div>
                <p className="text-ink-muted text-xs ml-7">{isAr ? "تصدير خطتك المخصصة بناءً على ملاحظاتك وقدراتك" : "Export your tailored plan based on your feedback and capabilities"}</p>
                {customTasks.length === 0 && <p className="text-accent-ink/60 text-[10px] ml-7 mt-1">{isAr ? "أنشئ خطة مخصصة أولاً" : "Generate a customized plan first"}</p>}
              </button>
              <button
                onClick={() => exportPlan("both")}
                disabled={tasks.length === 0 || customTasks.length === 0}
                className="w-full text-left p-4 rounded-xl border transition hover:scale-[1.01] disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ borderColor: `${BORDER}`, background: "rgb(var(--surface-hover-rgb) / 0.03)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">⚖️</span>
                  <span className="text-ink text-sm font-semibold">{isAr ? "مقارنة الخطتين" : "Both — Side-by-Side Comparison"}</span>
                </div>
                <p className="text-ink-muted text-xs ml-7">{isAr ? "تصدير الخطتين جنباً إلى جنب للمقارنة مع الملاحظات والحلول" : "Export both plans side-by-side for comparison with feedback notes and solutions"}</p>
                {(tasks.length === 0 || customTasks.length === 0) && <p className="text-accent-ink/60 text-[10px] ml-7 mt-1">{isAr ? "يتطلب وجود كلتا الخطتين" : "Requires both plans to be generated"}</p>}
              </button>
            </div>
            <button onClick={() => setShowExportModal(false)} className="w-full mt-4 py-2 rounded-lg text-xs text-ink-muted hover:text-ink-2 transition">
              {isAr ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
