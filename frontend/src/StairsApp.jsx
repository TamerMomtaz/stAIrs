import { useState, useEffect, useRef } from "react";
import { getTheme, toggleTheme } from "./lib/theme";
import { useHashRoute, go, DEFAULT_VIEW } from "./lib/urlState";
import { flattenTree } from "./lib/savedWork";
import { api, StrategyAPI, NotesStore, MatrixResultsStore, SourcesAPI, ArtifactsAPI, ARTIFACT, matrixScope, NotesAPI, syncLocalNotes, canSeeAgentTelemetry } from "./api";
import { BORDER, DEEP, DEEP_MID, FONT_DISPLAY, GOLD, GOLD_INK, GRAD_ACCENT, HUE, INK_MUTED, cast, fontStack, tint, typeIcons } from "./constants";
import { logoUrl, printDocument } from "./exportUtils";

// Components
import { LoginScreen } from "./components/LoginScreen";
import { StrategyLanding } from "./components/StrategyLanding";
import { DashboardView } from "./components/DashboardView";
import { StaircaseView } from "./components/StaircaseView";
import { AIChatView } from "./components/AIChatView";
import { AlertsView } from "./components/AlertsView";
import { KnowledgeLibrary } from "./components/KnowledgeLibrary";
import { NotesView } from "./components/NotesView";
import { ActionPlansView } from "./components/ActionPlansView";
import { ExecutionPicker } from "./components/ExecutionPicker";
import { StairEditor } from "./components/StairEditor";
import { ExecutionRoom } from "./components/ExecutionRoom";
import { TutorialOverlay, TutorialUpdatePrompt, FeaturesExploredBadge } from "./components/TutorialOverlay";
import { WelcomeSlideshow } from "./components/WelcomeSlideshow";
import { StrategyMatrixToolkit } from "./components/StrategyMatrixToolkit";
import { StrategyToolsPanel } from "./components/StrategyToolsPanel";
import { SourceOfTruthView } from "./components/SourceOfTruthView";
import { ManifestRoom } from "./components/ManifestRoom";
import { Sidebar } from "./components/Sidebar";
import { InviteManager } from "./components/InviteManager";
import { PasswordManager } from "./components/PasswordManager";
import { GuidanceManager } from "./components/GuidanceToast";
import { fireGuidance } from "./guidanceConfig";
import { MATRIX_FRAMEWORKS } from "./components/StrategyMatrixToolkit";
import { shouldShowTutorial, hasNewTutorialSteps, getNewSteps, markFeatureUsed, getTutorialState, saveTutorialState, getDefaultTutorialState } from "./tutorialConfig";

const MATRIX_ORDER = ["ife", "efe", "space", "bcg", "porter"];

// ═══ MAIN APP ═══
export default function App() {
  const [user, setUser] = useState(api.user);
  const [lang, setLang] = useState(localStorage.getItem("stairs_lang") || "en");
  const [strategies, setStrategies] = useState([]);
  // Where you are now lives in the URL, not in useState. activeStrat, view and
  // the Execution Room overlay are all derived from it, which is what makes
  // refresh, Back and a pasted link work — they were previously three
  // independent pieces of component state that a reload reset to their
  // defaults.
  const route = useHashRoute();
  const view = route.view;
  // Set when the hash names a strategy the loaded list does not contain:
  // deleted, or belonging to another organisation. The API answers 404 for
  // both, deliberately, so the message must not claim to know which.
  const [missingStrategy, setMissingStrategy] = useState(null);
  const [stairTree, setStairTree] = useState([]);
  const [dashData, setDashData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [editStair, setEditStair] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [stratLoading, setStratLoading] = useState(true);
  const [tutorialActive, setTutorialActive] = useState(false);
  const [tutorialNewSteps, setTutorialNewSteps] = useState(false);
  const [tutorialCustomSteps, setTutorialCustomSteps] = useState(null);
  const [showFeaturesBadge, setShowFeaturesBadge] = useState(false);
  const [aiProvider, setAiProvider] = useState(null);
  const [showWelcomeSlideshow, setShowWelcomeSlideshow] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [noteSync, setNoteSync] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("stairs_sidebar_collapsed") === "1");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Mirrors the attribute index.html already set, so the label agrees
  // with what is on screen from the first render.
  const [theme, setThemeState] = useState(getTheme);
  const flipTheme = () => setThemeState(toggleTheme());
  const toggleSidebar = () => setSidebarCollapsed(v => { const n = !v; localStorage.setItem("stairs_sidebar_collapsed", n ? "1" : "0"); return n; });
  const [matrixToolkit, setMatrixToolkit] = useState({ open: false, key: null, initialData: null });
  const openMatrix = (key, initialData = null) => setMatrixToolkit({ open: true, key, initialData });
  const closeMatrix = () => setMatrixToolkit({ open: false, key: null, initialData: null });
  const [matrixResults, setMatrixResults] = useState({});
  const [sourceCount, setSourceCount] = useState(0);

  // ═══ THE URL, RESOLVED ═══
  // Three cases, and the boot race is the one that decides the shape. The hash
  // names a strategy id before the list has loaded, so resolution cannot be a
  // lookup — it has to wait. Until stratLoading clears, activeStrat is null and
  // the app shows its loading state; only once the list is in can a missing id
  // be called missing. Resolving early would flash the picker on every deep
  // link, which is the bug this whole change exists to remove.
  const activeStrat = route.strategyId && !stratLoading
    ? strategies.find((s) => s.id === route.strategyId) || null
    : null;

  // The Execution Room is an overlay, not a view. It renders OVER whatever the
  // underlying view is rather than replacing it, so a deep link into a step
  // lands on the picker with the room open on top — the same thing you would
  // see having clicked there, and closing the room leaves you somewhere real.
  // The tree arrives after the strategy, so this resolves on the second pass.
  const execRoomStair = route.roomStairId && stairTree.length
    ? (flattenTree(stairTree).find((n) => n.stair.id === route.roomStairId)?.stair || null)
    : null;

  // A hash naming a strategy that is not in the list once the list has loaded.
  // Deleted and belongs-to-another-organisation are the same case here: the API
  // answers 404 for both by design, so the client genuinely cannot tell them
  // apart and must not pretend to.
  useEffect(() => {
    // Deliberately does NOT clear on a null strategyId: the redirect below sets
    // exactly that, and clearing here would wipe the message on the same tick it
    // was raised. It clears when a strategy does resolve, or when dismissed.
    if (stratLoading || !route.strategyId) return;
    if (strategies.some((s) => s.id === route.strategyId)) { setMissingStrategy(null); return; }
    setMissingStrategy(route.strategyId);
    go({ strategyId: null }, { replace: true });   // replace: a dead link should not cost a Back press
  }, [stratLoading, route.strategyId, strategies]);

  // A room link whose step is not in this strategy's tree. Same treatment, one
  // level down: drop the room segment, keep the strategy, say so.
  useEffect(() => {
    if (!route.roomStairId || !activeStrat || !stairTree.length) return;
    if (flattenTree(stairTree).some((n) => n.stair.id === route.roomStairId)) return;
    go({ strategyId: activeStrat.id, view: "execroom" }, { replace: true });
  }, [route.roomStairId, activeStrat, stairTree]);
  const matrixStoreRef = useRef(null);
  const stratApiRef = useRef(null);
  const notesStoreRef = useRef(null);
  // Notes go to the server first; the local store stays as an offline cache so
  // a save that can't reach the backend is still visible rather than lost.
  const saveToNotes = async (title, content, source) => {
    if (!notesStoreRef.current && user) notesStoreRef.current = new NotesStore(user.id || user.email);
    try {
      await NotesAPI.create({ title, content, source: source || "manual" });
      fireGuidance("note_saved");
    } catch (e) {
      console.warn("[stairs] note save failed, keeping local copy:", e.message);
      if (notesStoreRef.current) { notesStoreRef.current.create(title, content, source); fireGuidance("note_saved"); }
    }
  };
  const saveMatrixResult = (matrixKey, data) => {
    if (matrixStoreRef.current) {
      // Cache locally, then persist. The server is the source of truth on the
      // next load; the cache only keeps the UI responsive and offline-readable.
      matrixStoreRef.current.save(matrixKey, data);
      setMatrixResults(matrixStoreRef.current.getAll());
      if (activeStrat?.id) {
        ArtifactsAPI.save({
          artifactType: ARTIFACT.MATRIX,
          scopeKey: matrixScope(activeStrat.id, matrixKey),
          strategyId: activeStrat.id,
          content: data?.summary || null,
          payload: data || {},
        }).catch(e => console.warn("[stairs] matrix result save failed:", e.message));
      }
      const idx = MATRIX_ORDER.indexOf(matrixKey);
      const nextKey = idx >= 0 && idx < MATRIX_ORDER.length - 1 ? MATRIX_ORDER[idx + 1] : null;
      fireGuidance("matrix_complete", {
        matrixName: MATRIX_FRAMEWORKS[matrixKey]?.name || "Matrix",
        nextKey,
        nextName: nextKey ? MATRIX_FRAMEWORKS[nextKey]?.name : null,
      });
    }
  };
  const isAr = lang === "ar";

  // Keep the document language in step with the toggle. index.html sets it on
  // boot from localStorage; this covers the switch mid-session, so font
  // selection and assistive technology follow the language actually on screen.
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  useEffect(() => {
    api.setOnAuthExpired(() => {
      setUser(null);
      go({ strategyId: null }, { replace: true });
      setStrategies([]);
      setStairTree([]);
      setDashData(null);
    });
  }, []);

  useEffect(() => {
    if (user) { stratApiRef.current = new StrategyAPI(user.id || user.email); loadStrategies(); }
    else { stratApiRef.current = null; setStrategies([]); }
  }, [user]);

  // Lift local-only notes as soon as someone signs in. Every note ever written
  // lives in one browser's localStorage; doing this inside the Notes view meant
  // it needed the right browser AND someone opening that view, and a cleared
  // browser lost them with no warning.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    syncLocalNotes()
      .then(r => { if (!cancelled && (r.uploaded || r.failed)) setNoteSync(r); })
      .catch(e => console.warn("[stairs] note sync:", e.message));
    return () => { cancelled = true; };
  }, [user]);

  // Fetch active AI provider on login and periodically
  useEffect(() => {
    if (!user) return;
    const fetchProvider = () => { api.get("/api/v1/ai/provider").then(d => setAiProvider(d)).catch(() => {}); };
    fetchProvider();
    const interval = setInterval(fetchProvider, 60000);
    return () => clearInterval(interval);
  }, [user]);

  // Tutorial: auto-show on first login or prompt for new steps
  useEffect(() => {
    if (user) {
      if (shouldShowTutorial()) {
        setTutorialActive(true);
      } else if (hasNewTutorialSteps()) {
        setTutorialNewSteps(true);
      }
    }
  }, [user]);

  // First-login guidance: prompt brand-new users to create their first strategy
  useEffect(() => {
    if (user && !stratLoading && !activeStrat && strategies.length === 0) fireGuidance("first_login");
  }, [user, stratLoading, activeStrat, strategies.length]);

  const loadStrategies = async () => {
    if (!stratApiRef.current) return;
    setStratLoading(true);
    try { const list = await stratApiRef.current.list(); setStrategies(list); } catch (e) { console.error("Load strategies:", e); }
    setStratLoading(false);
  };

  const toggleLang = () => { const n = lang === "en" ? "ar" : "en"; setLang(n); localStorage.setItem("stairs_lang", n); };

  const startTutorial = () => { setTutorialCustomSteps(null); setTutorialActive(true); setTutorialNewSteps(false); };
  const startNewStepsTutorial = () => { setTutorialCustomSteps(getNewSteps()); setTutorialActive(true); setTutorialNewSteps(false); };
  const dismissNewSteps = () => { const s = getTutorialState() || getDefaultTutorialState(); s.completedVersion = (getTutorialState()?.completedVersion || 0); saveTutorialState(s); setTutorialNewSteps(false); };
  const trackFeature = (key) => { if (key) markFeatureUsed(key); };

  // ── Loading the three panels the shell owns ──
  // Each tracks its own failure, so one blip doesn't blank the other two and a
  // retry only re-requests what actually failed. On failure the existing data
  // is deliberately left alone: showing a stale staircase under a "couldn't
  // load" notice is honest, whereas replacing it with an empty one reads as
  // "your strategy is gone" — which is exactly what these panels used to do.
  const [loadFail, setLoadFail] = useState({ tree: false, dash: false, alerts: false });
  const [retrying, setRetrying] = useState({});

  const runLoad = async (key, fn) => {
    setRetrying(r => ({ ...r, [key]: true }));
    try {
      await fn();
      setLoadFail(f => (f[key] ? { ...f, [key]: false } : f));
    } catch (e) {
      console.error(`[stairs] load ${key}:`, e);
      setLoadFail(f => ({ ...f, [key]: true }));
    }
    setRetrying(r => ({ ...r, [key]: false }));
  };

  const loadTree = (sid) => runLoad("tree", async () => {
    const id = sid || activeStrat?.id;
    if (!id) return;
    setStairTree(await api.get(`/api/v1/strategies/${id}/tree`) || []);
  });
  const loadDash = () => runLoad("dash", async () => setDashData(await api.get(`/api/v1/dashboard`)));
  const loadAlerts = () => runLoad("alerts", async () => setAlerts(await api.get(`/api/v1/alerts`) || []));

  // Everything a strategy needs, keyed on which strategy is open — NOT on the
  // click that opened it. That distinction is the whole boot race: this used to
  // live inside selectStrategy, so arriving by URL loaded nothing and the
  // staircase, the dashboard and the Execution Room picker all rendered their
  // empty states on a perfectly valid deep link.
  const loadStrategyData = async (strat) => {
    matrixStoreRef.current = new MatrixResultsStore(strat.id);
    // Show the cached copy immediately, then let the server's copy win — the
    // cache is per-browser, the server follows the account.
    setMatrixResults(matrixStoreRef.current.getAll());
    ArtifactsAPI.forStrategy(strat.id, ARTIFACT.MATRIX)
      .then(list => {
        if (!list?.length) return;
        const fromServer = {};
        for (const a of list) {
          const key = a.scope_key.slice(a.scope_key.indexOf(":") + 1);
          fromServer[key] = { ...(a.payload || {}), summary: a.content ?? a.payload?.summary, saved_at: a.generated_at };
        }
        setMatrixResults(prev => ({ ...prev, ...fromServer }));
        for (const [k, v] of Object.entries(fromServer)) matrixStoreRef.current?.save(k, v);
      })
      .catch(() => {});
    await Promise.all([loadTree(strat.id), loadDash(), loadAlerts()]);
    try { const sc = await SourcesAPI.count(strat.id); setSourceCount(sc?.count || 0); } catch { setSourceCount(0); }
  };

  // Opening a strategy is now only a navigation. The loading follows from the
  // URL, which is why a pasted link behaves exactly like a click.
  const selectStrategy = (strat) => go({ strategyId: strat.id, view: DEFAULT_VIEW });

  const createStrategy = async (stratData) => {
    if (!stratApiRef.current) return;
    const created = await stratApiRef.current.create(stratData);
    if (stratData._localElements?.length > 0) {
      if (created.source === "server") {
        const idMap = {};
        for (const el of stratData._localElements) {
          try {
            const serverParentId = el.parent_id ? (idMap[el.parent_id] || null) : null;
            const serverEl = await api.post(`/api/v1/stairs`, { title: el.title, title_ar: el.title_ar || null, description: el.description || null, element_type: el.element_type, parent_id: serverParentId, strategy_id: created.id });
            // POST now persists strategy_id; PUT stays as a safety net in case an older backend ignores it.
            if (serverEl?.id && !serverEl.strategy_id) await api.put(`/api/v1/stairs/${serverEl.id}`, { strategy_id: created.id });
            if (el.id && serverEl?.id) idMap[el.id] = serverEl.id;
          } catch (e) { console.warn("Failed to create stair element:", el.title, e.message); }
        }
      } else {
        localStorage.setItem(`stairs_el_${created.id}`, JSON.stringify(stratData._localElements));
      }
    }
    // Log pending sources to Source of Truth
    if (created.source === "server" && stratData._pendingSources?.length > 0) {
      for (const src of stratData._pendingSources) {
        try { await SourcesAPI.create(created.id, src.source_type, src.content, src.metadata || {}); } catch (e) { console.warn("Failed to log source:", e.message); }
      }
    }
    // Upload pending document files to Source of Truth (fire and forget)
    if (created.source === "server" && stratData._pendingDocumentFiles?.length > 0) {
      Promise.all(
        stratData._pendingDocumentFiles.map(file =>
          SourcesAPI.uploadDocument(created.id, file).catch(e => console.warn("Failed to upload document:", file.name, e.message))
        )
      );
    }
    await loadStrategies();
    selectStrategy(created);
    // Defer until the post-selection tree (with its GuidanceManager) is mounted.
    setTimeout(() => fireGuidance("strategy_created", { name: created.name, count: stratData._localElements?.length || 0 }), 0);
  };

  const openExecutionRoom = (s) => { go({ strategyId: route.strategyId, roomStairId: s.id }); fireGuidance("execution_room"); };

  const deleteStrategy = async (id) => {
    if (!stratApiRef.current) return;
    await stratApiRef.current.remove(id);
    if (activeStrat?.id === id) { go({ strategyId: null }, { replace: true }); setStairTree([]); setDashData(null); }
    await loadStrategies();
  };

  const saveStair = async (form, existingId) => {
    if (!activeStrat) return;
    if (existingId) {
      await api.put(`/api/v1/stairs/${existingId}`, form);
    } else {
      const created = await api.post(`/api/v1/stairs`, { ...form, strategy_id: activeStrat.id });
      if (created?.id && !created.strategy_id) await api.put(`/api/v1/stairs/${created.id}`, { strategy_id: activeStrat.id });
    }
    await Promise.all([loadTree(), loadDash()]);
  };

  const deleteStair = async (id) => {
    if (!activeStrat) return;
    await api.del(`/api/v1/stairs/${id}`);
    await Promise.all([loadTree(), loadDash()]);
  };

  const moveStair = async (id, dir) => {
    if (!activeStrat) return;
    // Locate the sibling list (top level or a node's children) containing this stair.
    let siblings = null;
    const find = (nodes) => {
      if (siblings) return;
      if (nodes.some(n => n.stair.id === id)) { siblings = nodes; return; }
      nodes.forEach(n => n.children && find(n.children));
    };
    find(stairTree);
    if (!siblings) return;
    const idx = siblings.findIndex(n => n.stair.id === id);
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= siblings.length) return;
    // Reorder by display position, then normalize sort_order to the index.
    // Elements seeded with sort_order=0 get distinct values on first move so
    // the swap actually takes effect; only changed rows are persisted.
    const ordered = siblings.map(n => n.stair);
    [ordered[idx], ordered[swap]] = [ordered[swap], ordered[idx]];
    const changed = ordered
      .map((s, i) => ({ id: s.id, sort_order: i }))
      .filter((x, i) => (ordered[i].sort_order || 0) !== x.sort_order);
    try {
      await Promise.all(changed.map(c => api.put(`/api/v1/stairs/${c.id}`, { sort_order: c.sort_order })));
      const tree = await api.get(`/api/v1/strategies/${activeStrat.id}/tree`);
      setStairTree(tree || []);
    } catch (e) { console.error("Move stair:", e); }
  };

  const exportPDF = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const flatItems = [];
    const walkTree = (nodes, depth = 0) => { nodes.forEach(n => { flatItems.push({ ...n.stair, _depth: depth }); if (n.children) walkTree(n.children, depth + 1); }); };
    walkTree(stairTree);
    const healthLabel = h => ({ on_track: "✅ On Track", at_risk: "⚠️ At Risk", off_track: "🔴 Off Track", achieved: "⭐ Achieved" }[h] || h || "—");
    const typeColor = t => ({ vision: HUE.violet, objective: HUE.blue, key_result: HUE.green, initiative: HUE.amber, task: INK_MUTED }[t] || INK_MUTED);
    const rows = flatItems.map(s => {
      const indent = s._depth * 28;
      const barW = Math.max(s.progress_percent || 0, 2);
      const barColor = (s.progress_percent || 0) >= 70 ? HUE.green : (s.progress_percent || 0) >= 40 ? HUE.amber : HUE.red;
      return `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:10px 8px 10px ${12+indent}px;vertical-align:top">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="color:${typeColor(s.element_type)};font-size:14px">${typeIcons[s.element_type]||"•"}</span>
            <span style="font-size:10px;color:${typeColor(s.element_type)};font-weight:600;text-transform:uppercase">${s.element_type.replace("_"," ")}</span>
          </div>
          <div style="margin-top:4px;font-weight:600;color:#1e293b;font-size:13px">${s.code ? `<span style="color:#94a3b8;font-family:monospace;font-size:11px">${s.code}</span> ` : ""}${isAr && s.title_ar ? s.title_ar : s.title}</div>
          ${s.description ? `<div style="color:#64748b;font-size:11px;margin-top:2px;max-width:500px">${s.description}</div>` : ""}
        </td>
        <td style="padding:10px 8px;text-align:center;vertical-align:middle;font-size:12px;color:#475569">${healthLabel(s.health)}</td>
        <td style="padding:10px 8px;text-align:center;vertical-align:middle;width:120px">
          <div style="font-weight:600;font-size:13px;color:${barColor}">${s.progress_percent||0}%</div>
          <div style="background:#e5e7eb;border-radius:4px;height:6px;overflow:hidden"><div style="background:${barColor};height:100%;width:${barW}%;border-radius:4px"></div></div>
        </td>
      </tr>`;
    }).join("");
    const stats = { total: flatItems.length, onTrack: flatItems.filter(s => s.health === "on_track").length, atRisk: flatItems.filter(s => s.health === "at_risk").length, offTrack: flatItems.filter(s => s.health === "off_track").length, avgProgress: flatItems.length ? Math.round(flatItems.reduce((a,s) => a + (s.progress_percent||0), 0) / flatItems.length) : 0 };
    printDocument(w, `<!DOCTYPE html><html><head><title>Stairs Export - ${activeStrat?.name||"Strategy"}</title><style>@page{margin:20mm 15mm}*{box-sizing:border-box;margin:0;padding:0}body{background:#fff;color:#1e293b;font-family:'Segoe UI',system-ui,sans-serif;line-height:1.5}.header{display:flex;align-items:center;gap:16px;padding-bottom:16px;border-bottom:2px solid #B8904A;margin-bottom:20px}.header h1{font-size:28px;font-weight:700}.stats-bar{display:flex;gap:12px;margin-bottom:24px}.stat-box{flex:1;padding:12px;border-radius:8px;text-align:center;border:1px solid #e5e7eb}.stat-box .num{font-size:22px;font-weight:700}.stat-box .lbl{font-size:10px;color:#64748b;text-transform:uppercase}table{width:100%;border-collapse:collapse}thead th{text-align:left;padding:10px 8px;border-bottom:2px solid #B8904A;color:#B8904A;font-size:11px;text-transform:uppercase;font-weight:600}.footer{text-align:center;margin-top:30px;padding-top:16px;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:10px}</style></head><body>
    <div class="header"><img src="${logoUrl()}" style="height:32px;vertical-align:middle;margin-right:8px" alt="DEVONEERS" /><div><div style="font-size:14px;font-weight:700;color:#B8904A;letter-spacing:2px;margin-bottom:4px">Stairs <span style="color:#64748b;font-weight:400;font-size:12px;letter-spacing:1px">&nbsp;|&nbsp; ${activeStrat?.name||"Strategy"} &nbsp;|&nbsp; ${new Date().toLocaleDateString()}</span></div><h1>${activeStrat?.name||"Strategy"}</h1><div style="font-size:12px;color:#64748b">${activeStrat?.company||""} · Staircase Export · ${new Date().toLocaleDateString()}</div></div></div>
    <div class="stats-bar"><div class="stat-box"><div class="num" style="color:#2563eb">${stats.total}</div><div class="lbl">Elements</div></div><div class="stat-box"><div class="num" style="color:#059669">${stats.onTrack}</div><div class="lbl">On Track</div></div><div class="stat-box"><div class="num" style="color:#d97706">${stats.atRisk}</div><div class="lbl">At Risk</div></div><div class="stat-box"><div class="num" style="color:#dc2626">${stats.offTrack}</div><div class="lbl">Off Track</div></div><div class="stat-box"><div class="num" style="color:#7c3aed">${stats.avgProgress}%</div><div class="lbl">Avg Progress</div></div></div>
    <table><thead><tr><th style="width:60%">Element</th><th style="text-align:center">Health</th><th style="text-align:center;width:120px">Progress</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="footer" style="text-align:center;margin-top:40px;padding-top:20px;border-top:2px solid #B8904A"><div style="font-size:14px;font-weight:700;color:#B8904A;letter-spacing:3px;margin-bottom:4px">BY DEVONEERS &bull; Stairs &bull; HUMAN IS THE LOOP &bull; ${new Date().getFullYear()}</div></div></body></html>`);
    fireGuidance("export_ready");
  };

  const logout = () => { api.logout(); setUser(null); go({ strategyId: null }, { replace: true }); setStrategies([]); };

  // Load on whichever strategy the URL resolves to, by click or by paste.
  const loadedStratRef = useRef(null);
  useEffect(() => {
    if (!activeStrat) { loadedStratRef.current = null; return; }
    if (loadedStratRef.current === activeStrat.id) return;   // a view change is not a reload
    loadedStratRef.current = activeStrat.id;
    loadStrategyData(activeStrat);
  }, [activeStrat]);

  // ═══ RENDER ═══
  if (!user) return <LoginScreen onLogin={setUser} />;
  if (!activeStrat) return (
    <>
      <StrategyLanding theme={theme} onThemeToggle={flipTheme} missingStrategy={missingStrategy} onDismissMissing={() => setMissingStrategy(null)} strategies={strategies} onSelect={selectStrategy} onCreate={createStrategy} onDelete={deleteStrategy} userName={user.full_name||user.name||user.email} onLogout={logout} onLangToggle={toggleLang} lang={lang} loading={stratLoading} userId={user.id || user.email} userEmail={user.email} userRole={user.role} />
      <GuidanceManager suppressed={tutorialActive || showWelcomeSlideshow} onView={() => {}} onExec={() => {}} onMatrix={() => {}} />
    </>
  );

  const navItems = {
    dashboard: { icon: "📊", label: isAr ? "لوحة القيادة" : "Dashboard", tutorial: "nav-dashboard" },
    staircase: { icon: "🪜", label: isAr ? "السلم" : "Staircase", tutorial: "nav-staircase" },
    ai: { icon: "🤖", label: isAr ? "المستشار" : "AI Advisor", tutorial: "nav-ai" },
    alerts: { icon: "🔔", label: isAr ? "تنبيهات" : "Alerts", tutorial: "nav-alerts" },
    sources: { icon: "🔍", label: isAr ? "مصدر الحقيقة" : "Source of Truth", badge: sourceCount || null, tutorial: "nav-sources" },
    notes: { icon: "📝", label: isAr ? "ملاحظات" : "Notes", tutorial: "nav-notes" },
    knowledge: { icon: "📖", label: isAr ? "المعرفة" : "Knowledge", tutorial: "nav-knowledge" },
    tools: { icon: "🔧", label: isAr ? "أدوات استراتيجية" : "Strategy Tools", tutorial: "nav-tools" },
    execroom: { icon: "🚀", label: isAr ? "الغرفة" : "Execution Room", tutorial: "nav-execroom" },
    actionplans: { icon: "📋", label: isAr ? "خطط العمل" : "Action Plans", tutorial: "nav-actionplans" },
    manifest: { icon: "📦", label: isAr ? "السجل" : "Manifest Room", tutorial: "nav-manifest" },
  };
  const goToView = (key) => { go({ strategyId: route.strategyId, view: key }); trackFeature(key); setMobileNavOpen(false); };

  return (
    <div className="h-screen flex flex-col overflow-hidden text-ink" dir={isAr ? "rtl" : "ltr"} style={{ background: `linear-gradient(180deg, ${DEEP} 0%, ${DEEP_MID} 50%, ${DEEP} 100%)`, fontFamily: fontStack(isAr) }}>
      <header className="flex items-center justify-between px-6 py-3 shrink-0"
        style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-3">
          <button onClick={() => setMobileNavOpen(v => !v)} className="md:hidden p-1.5 rounded-lg text-ink-3 hover:text-amber-400 hover:bg-amber-500/10 transition text-lg" title="Menu" aria-label="Toggle navigation">☰</button>
          <button onClick={() => go({ strategyId: null })} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-ink-3 hover:text-amber-400 hover:bg-amber-500/10 transition group" title="Back to Strategies">
            <span className="text-lg group-hover:-translate-x-0.5 transition-transform">←</span>
            <img src="/devoneers-logo.png" alt="DEVONEERS" style={{ height: "40px" }} />
            <span className="text-xl font-normal" style={{ background: GRAD_ACCENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: FONT_DISPLAY }}>Stairs</span>
          </button>
          <span className="text-[10px] text-ink-faint uppercase tracking-widest">v3.7.0</span>
          <span className="text-ink-faint">|</span>
          <span className="text-sm text-ink font-medium">{activeStrat.icon} {isAr && activeStrat.name_ar ? activeStrat.name_ar : activeStrat.name}</span>
        </div>
        <div className="flex items-center gap-3">
          {aiProvider && canSeeAgentTelemetry() && <span className="text-[10px] text-ink-muted flex items-center gap-1 px-2 py-1 rounded-md border border-hairline bg-sunken" title={`AI powered by ${aiProvider.provider_display}`}>⚡ {aiProvider.provider_display}</span>}
          {!isAr && <button onClick={() => setShowWelcomeSlideshow(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-ink-muted hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition uppercase tracking-wider" title="Watch the Stairs introduction" data-testid="watch-intro-btn">
            <span className="text-sm">🎬</span> <span className="hidden sm:inline">Watch Intro</span>
          </button>}
          <button onClick={startTutorial} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-ink-muted hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition uppercase tracking-wider" title="How to Climb These Stairs Guide" data-tutorial="guide-btn">
            <span className="text-sm">🪜</span> <span className="hidden sm:inline">{isAr ? "دليل الاستخدام" : "Guide"}</span>
          </button>
          <button onClick={() => setShowFeaturesBadge(v => !v)} className="text-[10px] text-ink-faint hover:text-amber-400 transition" title="Features Explored">📊</button>
          {/* Theme. Light is the default; this remembers the other choice. */}
          <button onClick={flipTheme} title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            className="text-xs text-ink-muted hover:text-accent-ink transition" data-testid="theme-toggle">
            {theme === "dark" ? (isAr ? "فاتح" : "Light") : (isAr ? "داكن" : "Dark")}
          </button>
          <button onClick={toggleLang} className="text-xs text-ink-muted hover:text-amber-400 transition">{isAr ? "EN" : "عربي"}</button>
          <div className="relative">
            <button onClick={() => setShowProfileDropdown(v => !v)} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-ink-3 hover:text-amber-400 hover:bg-amber-500/10 transition">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "transparent", color: GOLD_INK, border: `1px solid ${tint(GOLD, 25)}` }}>{(user.full_name || user.name || user.email || "?")[0].toUpperCase()}</span>
              <span>{user.full_name || user.name || user.email}</span>
              <span className="text-[10px]">{showProfileDropdown ? "▲" : "▼"}</span>
            </button>
            {showProfileDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProfileDropdown(false)} />
                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl z-50 py-2" style={{ background: "rgb(var(--surface-raised-rgb) / 0.97)", border: `1px solid ${tint(GOLD, 19)}`, backdropFilter: "blur(20px)", boxShadow: `0 12px 40px ${cast(0.5)}` }}>
                  <div className="px-4 py-3 border-b" style={{ borderColor: `${tint(GOLD, 8)}` }}>
                    <div className="text-sm font-medium text-ink">{user.full_name || user.name || "User"}</div>
                    <div className="text-xs text-ink-muted mt-0.5">{user.email}</div>
                    <div className="text-[10px] text-ink-faint mt-1 uppercase tracking-wider">{user.role || "Member"}</div>
                  </div>
                  <button onClick={() => { setShowProfileDropdown(false); setShowPassword(true); }} className="w-full text-left px-4 py-2.5 text-sm text-ink-3 hover:text-amber-400 hover:bg-amber-500/10 transition flex items-center gap-2" data-testid="open-password">
                    <span>Change password</span>
                  </button>
                  {user.role === "admin" && (
                    <button onClick={() => { setShowProfileDropdown(false); setShowInvites(true); }} className="w-full text-left px-4 py-2.5 text-sm text-ink-3 hover:text-amber-400 hover:bg-amber-500/10 transition flex items-center gap-2" data-testid="open-invites">
                      <span>Invite your team</span>
                    </button>
                  )}
                  <button onClick={() => { setShowProfileDropdown(false); logout(); }} className="w-full text-left px-4 py-2.5 text-sm text-ink-3 hover:text-red-400 hover:bg-red-500/10 transition flex items-center gap-2">
                    <span>Sign Out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 relative">
        <Sidebar navItems={navItems} view={view} onSelect={goToView} collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} isAr={isAr} mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="max-w-6xl mx-auto px-6 py-6">
        {view === "dashboard" && <DashboardView data={dashData} failed={loadFail.dash} retrying={retrying.dash} onRetry={loadDash} lang={lang} matrixResults={matrixResults} onMatrixClick={openMatrix} strategyContext={activeStrat} />}
        {view === "staircase" && <StaircaseView tree={stairTree} failed={loadFail.tree} retrying={retrying.tree} onRetry={loadTree} lang={lang} onEdit={s => { setEditStair(s); setShowEditor(true); }} onAdd={() => { setEditStair(null); setShowEditor(true); }} onExport={exportPDF} onMove={moveStair} strategyContext={activeStrat} onSaveNote={saveToNotes} onExecutionRoom={openExecutionRoom} onMatrixClick={openMatrix} />}
        {view === "ai" && <AIChatView lang={lang} userId={user.id || user.email} strategyContext={activeStrat} onSaveNote={saveToNotes} onMatrixClick={openMatrix} />}
        {view === "execroom" && <ExecutionPicker tree={stairTree} strategyContext={activeStrat} lang={lang} onOpen={openExecutionRoom} treeFailed={loadFail.tree} onRetryTree={loadTree} />}
        {view === "actionplans" && <ActionPlansView strategyContext={activeStrat} lang={lang} onMatrixClick={openMatrix} />}
        {view === "manifest" && <ManifestRoom strategyContext={activeStrat} lang={lang} />}
        {view === "alerts" && <AlertsView alerts={alerts} failed={loadFail.alerts} retrying={retrying.alerts} onRetry={loadAlerts} lang={lang} strategyContext={activeStrat} />}
        {view === "knowledge" && <KnowledgeLibrary lang={lang} strategyContext={activeStrat} />}
        {view === "tools" && <StrategyToolsPanel lang={lang} onMatrixClick={openMatrix} matrixResults={matrixResults} strategyContext={activeStrat} />}
        {view === "sources" && <SourceOfTruthView lang={lang} strategyContext={activeStrat} />}
        {view === "notes" && <NotesView lang={lang} userId={user.id || user.email} strategyName={activeStrat?.name} />}
          </div>
          <footer className="text-center py-6 text-ink-ghost text-[10px] tracking-widest uppercase">By DEVONEERS • Stairs v3.7.0 • "Human IS the Loop" • {new Date().getFullYear()}</footer>
        </main>
      </div>

      <StairEditor open={showEditor} onClose={() => { setShowEditor(false); setEditStair(null); }} stair={editStair} allStairs={stairTree} onSave={saveStair} onDelete={deleteStair} lang={lang} />

      {/* onOpenManifest is only a navigation. The room closes because the hash
          stops naming it, which is what #72 made true — the setter this used to
          call was deleted in that same commit and left a ReferenceError behind,
          so the chip threw on every click. */}
      {execRoomStair && <ExecutionRoom stair={execRoomStair} strategyContext={activeStrat} lang={lang} onBack={() => go({ strategyId: route.strategyId, view: "execroom" })} onSaveNote={saveToNotes} onMatrixClick={openMatrix} onOpenManifest={() => goToView("manifest")} />}

      <StrategyMatrixToolkit open={matrixToolkit.open} matrixKey={matrixToolkit.key} onClose={closeMatrix} onSave={saveMatrixResult} strategyContext={activeStrat} initialData={matrixToolkit.initialData} />

      {noteSync && (
        <div className="fixed bottom-4 right-4 z-[95] max-w-sm rounded-xl p-4 text-xs" style={{ background: "rgb(var(--surface-raised-rgb) / 0.97)", border: `1px solid ${tint(GOLD, 25)}`, backdropFilter: "blur(20px)" }} data-testid="note-sync-toast">
          <div className="text-ink font-medium mb-1">
            {noteSync.uploaded > 0
              ? `${noteSync.uploaded} note${noteSync.uploaded === 1 ? "" : "s"} saved to your account`
              : `${noteSync.failed} note${noteSync.failed === 1 ? "" : "s"} still only on this device`}
          </div>
          <p className="text-ink-3 leading-relaxed">
            {noteSync.uploaded > 0
              ? "They were only stored in this browser until now, and are available on any device from here on."
              : "We couldn't reach the server. They're safe in this browser — don't clear your site data, and they'll upload next time you sign in."}
          </p>
          <button onClick={() => setNoteSync(null)} className="mt-2 text-[11px] text-ink-muted hover:text-amber-400 transition">Dismiss</button>
        </div>
      )}

      <PasswordManager open={showPassword} onClose={() => setShowPassword(false)} lang={lang} currentUserRole={user.role} />

      <InviteManager open={showInvites} onClose={() => setShowInvites(false)} lang={lang} currentUserRole={user.role} />

      <WelcomeSlideshow open={showWelcomeSlideshow} onClose={() => setShowWelcomeSlideshow(false)} hasStrategies={true} />

      <TutorialOverlay active={tutorialActive} onClose={() => setTutorialActive(false)} steps={tutorialCustomSteps} />
      {tutorialNewSteps && <TutorialUpdatePrompt onStart={startNewStepsTutorial} onDismiss={dismissNewSteps} />}
      <FeaturesExploredBadge show={showFeaturesBadge} onClose={() => setShowFeaturesBadge(false)} />

      <GuidanceManager suppressed={tutorialActive || showWelcomeSlideshow} onView={goToView} onExec={openExecutionRoom} onMatrix={openMatrix} />
    </div>
  );
}
