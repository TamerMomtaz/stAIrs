import { useState, useEffect, useRef } from "react";
import { api, StrategyAPI, NotesStore } from "./api";
import { GOLD, GOLD_L, DEEP, BORDER, typeIcons } from "./constants";

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
import { StairEditor } from "./components/StairEditor";
import { ExecutionRoom } from "./components/ExecutionRoom";
import { TutorialOverlay, TutorialUpdatePrompt, FeaturesExploredBadge } from "./components/TutorialOverlay";
import { StrategyMatrixToolkit } from "./components/StrategyMatrixToolkit";
import { shouldShowTutorial, hasNewTutorialSteps, getNewSteps, markFeatureUsed, getTutorialState, saveTutorialState, getDefaultTutorialState } from "./tutorialConfig";

// ═══ MAIN APP ═══
export default function App() {
  const [user, setUser] = useState(api.user);
  const [lang, setLang] = useState(localStorage.getItem("stairs_lang") || "en");
  const [strategies, setStrategies] = useState([]);
  const [activeStrat, setActiveStrat] = useState(null);
  const [view, setView] = useState("dashboard");
  const [stairTree, setStairTree] = useState([]);
  const [dashData, setDashData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [editStair, setEditStair] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [execRoomStair, setExecRoomStair] = useState(null);
  const [stratLoading, setStratLoading] = useState(true);
  const [tutorialActive, setTutorialActive] = useState(false);
  const [tutorialNewSteps, setTutorialNewSteps] = useState(false);
  const [tutorialCustomSteps, setTutorialCustomSteps] = useState(null);
  const [showFeaturesBadge, setShowFeaturesBadge] = useState(false);
  const [aiProvider, setAiProvider] = useState(null);
  const [matrixToolkit, setMatrixToolkit] = useState({ open: false, key: null });
  const openMatrix = (key) => setMatrixToolkit({ open: true, key });
  const closeMatrix = () => setMatrixToolkit({ open: false, key: null });
  const stratApiRef = useRef(null);
  const notesStoreRef = useRef(null);
  const saveToNotes = (title, content, source) => {
    if (!notesStoreRef.current && user) notesStoreRef.current = new NotesStore(user.id || user.email);
    if (notesStoreRef.current) { notesStoreRef.current.create(title, content, source); alert("📌 Saved to Notes!"); }
  };
  const isAr = lang === "ar";

  useEffect(() => {
    api.setOnAuthExpired(() => {
      setUser(null);
      setActiveStrat(null);
      setStrategies([]);
      setStairTree([]);
      setDashData(null);
    });
  }, []);

  useEffect(() => {
    if (user) { stratApiRef.current = new StrategyAPI(user.id || user.email); loadStrategies(); }
    else { stratApiRef.current = null; setStrategies([]); }
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

  const selectStrategy = async (strat) => {
    setActiveStrat(strat); setView("dashboard");
    if (stratApiRef.current) stratApiRef.current.setActive(strat.id);
    try { const tree = await api.get(`/api/v1/strategies/${strat.id}/tree`); setStairTree(tree || []); } catch { setStairTree([]); }
    try { const dash = await api.get(`/api/v1/dashboard`); setDashData(dash); } catch { setDashData({ stats: { total_elements: 0, overall_progress: 0 } }); }
    try { const al = await api.get(`/api/v1/alerts`); setAlerts(al || []); } catch { setAlerts([]); }
  };

  const createStrategy = async (stratData) => {
    if (!stratApiRef.current) return;
    const created = await stratApiRef.current.create(stratData);
    if (stratData._localElements?.length > 0) {
      if (created.source === "server") {
        const idMap = {};
        for (const el of stratData._localElements) {
          try {
            const serverParentId = el.parent_id ? (idMap[el.parent_id] || null) : null;
            const serverEl = await api.post(`/api/v1/stairs`, { title: el.title, title_ar: el.title_ar || null, description: el.description || null, element_type: el.element_type, parent_id: serverParentId });
            if (serverEl?.id) await api.put(`/api/v1/stairs/${serverEl.id}`, { strategy_id: created.id });
            if (el.id && serverEl?.id) idMap[el.id] = serverEl.id;
          } catch (e) { console.warn("Failed to create stair element:", el.title, e.message); }
        }
      } else {
        localStorage.setItem(`stairs_el_${created.id}`, JSON.stringify(stratData._localElements));
      }
    }
    await loadStrategies();
    selectStrategy(created);
  };

  const deleteStrategy = async (id) => {
    if (!stratApiRef.current) return;
    await stratApiRef.current.remove(id);
    if (activeStrat?.id === id) { setActiveStrat(null); setStairTree([]); setDashData(null); }
    await loadStrategies();
  };

  const saveStair = async (form, existingId) => {
    if (!activeStrat) return;
    if (existingId) {
      await api.put(`/api/v1/stairs/${existingId}`, form);
    } else {
      const created = await api.post(`/api/v1/stairs`, form);
      if (created?.id) await api.put(`/api/v1/stairs/${created.id}`, { strategy_id: activeStrat.id });
    }
    try { const tree = await api.get(`/api/v1/strategies/${activeStrat.id}/tree`); setStairTree(tree || []); } catch {}
    try { const dash = await api.get(`/api/v1/dashboard`); setDashData(dash); } catch {}
  };

  const deleteStair = async (id) => {
    if (!activeStrat) return;
    await api.del(`/api/v1/stairs/${id}`);
    try { const tree = await api.get(`/api/v1/strategies/${activeStrat.id}/tree`); setStairTree(tree || []); } catch {}
    try { const dash = await api.get(`/api/v1/dashboard`); setDashData(dash); } catch {}
  };

  const moveStair = async (id, dir) => {
    console.warn("Move not yet implemented on backend");
  };

  const exportPDF = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const flatItems = [];
    const walkTree = (nodes, depth = 0) => { nodes.forEach(n => { flatItems.push({ ...n.stair, _depth: depth }); if (n.children) walkTree(n.children, depth + 1); }); };
    walkTree(stairTree);
    const healthLabel = h => ({ on_track: "✅ On Track", at_risk: "⚠️ At Risk", off_track: "🔴 Off Track", achieved: "⭐ Achieved" }[h] || h || "—");
    const typeColor = t => ({ vision: "#7c3aed", objective: "#2563eb", key_result: "#059669", initiative: "#d97706", task: "#64748b" }[t] || "#64748b");
    const rows = flatItems.map(s => {
      const indent = s._depth * 28;
      const barW = Math.max(s.progress_percent || 0, 2);
      const barColor = (s.progress_percent || 0) >= 70 ? "#059669" : (s.progress_percent || 0) >= 40 ? "#d97706" : "#dc2626";
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
    w.document.write(`<!DOCTYPE html><html><head><title>ST.AIRS Export - ${activeStrat?.name||"Strategy"}</title><style>@page{margin:20mm 15mm}*{box-sizing:border-box;margin:0;padding:0}body{background:#fff;color:#1e293b;font-family:'Segoe UI',system-ui,sans-serif;line-height:1.5}.header{display:flex;align-items:center;gap:16px;padding-bottom:16px;border-bottom:2px solid #B8904A;margin-bottom:20px}.header h1{font-size:28px;font-weight:700}.stats-bar{display:flex;gap:12px;margin-bottom:24px}.stat-box{flex:1;padding:12px;border-radius:8px;text-align:center;border:1px solid #e5e7eb}.stat-box .num{font-size:22px;font-weight:700}.stat-box .lbl{font-size:10px;color:#64748b;text-transform:uppercase}table{width:100%;border-collapse:collapse}thead th{text-align:left;padding:10px 8px;border-bottom:2px solid #B8904A;color:#B8904A;font-size:11px;text-transform:uppercase;font-weight:600}.footer{text-align:center;margin-top:30px;padding-top:16px;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:10px}</style></head><body>
    <div class="header"><span style="font-size:36px">${activeStrat?.icon||"🎯"}</span><div><h1>${activeStrat?.name||"Strategy"}</h1><div style="font-size:12px;color:#64748b">${activeStrat?.company||""} · Exported ${new Date().toLocaleDateString()}</div></div></div>
    <div class="stats-bar"><div class="stat-box"><div class="num" style="color:#2563eb">${stats.total}</div><div class="lbl">Elements</div></div><div class="stat-box"><div class="num" style="color:#059669">${stats.onTrack}</div><div class="lbl">On Track</div></div><div class="stat-box"><div class="num" style="color:#d97706">${stats.atRisk}</div><div class="lbl">At Risk</div></div><div class="stat-box"><div class="num" style="color:#dc2626">${stats.offTrack}</div><div class="lbl">Off Track</div></div><div class="stat-box"><div class="num" style="color:#7c3aed">${stats.avgProgress}%</div><div class="lbl">Avg Progress</div></div></div>
    <table><thead><tr><th style="width:60%">Element</th><th style="text-align:center">Health</th><th style="text-align:center;width:120px">Progress</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="footer">ST.AIRS v3.7.0-cors-fix · By DEVONEERS · "Human IS the Loop"</div></body></html>`);
    w.document.close();
    w.print();
  };

  const logout = () => { api.logout(); setUser(null); setActiveStrat(null); setStrategies([]); };

  // ═══ RENDER ═══
  if (!user) return <LoginScreen onLogin={setUser} />;
  if (!activeStrat) return <StrategyLanding strategies={strategies} onSelect={selectStrategy} onCreate={createStrategy} onDelete={deleteStrategy} userName={user.name||user.email} onLogout={logout} onLangToggle={toggleLang} lang={lang} loading={stratLoading} />;

  const navItems = [
    { key: "dashboard", icon: "📊", label: isAr ? "لوحة القيادة" : "Dashboard", tutorial: "nav-dashboard" },
    { key: "staircase", icon: "🪜", label: isAr ? "السلم" : "Staircase", tutorial: "nav-staircase" },
    { key: "ai", icon: "🤖", label: isAr ? "المستشار" : "AI Advisor", tutorial: "nav-ai" },
    { key: "alerts", icon: "🔔", label: isAr ? "تنبيهات" : "Alerts", tutorial: "nav-alerts" },
    { key: "actionplans", icon: "📋", label: isAr ? "خطط العمل" : "Action Plans", tutorial: "nav-actionplans" },
    { key: "knowledge", icon: "📖", label: isAr ? "المعرفة" : "Knowledge", tutorial: "nav-knowledge" },
    { key: "notes", icon: "📝", label: isAr ? "ملاحظات" : "Notes", tutorial: "nav-notes" },
  ];

  return (
    <div className="min-h-screen text-white" dir={isAr ? "rtl" : "ltr"} style={{ background: `linear-gradient(180deg, ${DEEP} 0%, #0f1f3a 50%, ${DEEP} 100%)`, fontFamily: isAr ? "'Noto Kufi Arabic', sans-serif" : "'DM Sans', system-ui, sans-serif" }}>
      <header className="flex items-center justify-between px-6 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-3">
          <button onClick={() => { setActiveStrat(null); if (stratApiRef.current) stratApiRef.current.setActive(null); }} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 transition group" title="Back to Strategies">
            <span className="text-lg group-hover:-translate-x-0.5 transition-transform">←</span>
            <span className="text-xl font-bold" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "'Instrument Serif', Georgia, serif" }}>ST.AIRS</span>
          </button>
          <span className="text-[10px] text-gray-600 uppercase tracking-widest">v3.7.0</span>
          <span className="text-gray-600">|</span>
          <span className="text-sm text-white font-medium">{activeStrat.icon} {isAr && activeStrat.name_ar ? activeStrat.name_ar : activeStrat.name}</span>
        </div>
        <div className="flex items-center gap-3">
          {aiProvider && <span className="text-[10px] text-gray-500 flex items-center gap-1 px-2 py-1 rounded-md border border-gray-700/50 bg-gray-800/30" title={`AI powered by ${aiProvider.provider_display}`}>⚡ {aiProvider.provider_display}</span>}
          <button onClick={startTutorial} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition uppercase tracking-wider" title="How to Climb These Stairs Guide" data-tutorial="guide-btn">
            <span className="text-sm">🪜</span> <span className="hidden sm:inline">{isAr ? "دليل الاستخدام" : "Guide"}</span>
          </button>
          <button onClick={() => setShowFeaturesBadge(v => !v)} className="text-[10px] text-gray-600 hover:text-amber-400 transition" title="Features Explored">📊</button>
          <button onClick={toggleLang} className="text-xs text-gray-500 hover:text-amber-400 transition">{isAr ? "EN" : "عربي"}</button>
          <button onClick={logout} className="text-xs text-gray-600 hover:text-gray-300 transition">{user.name || user.email} ↗</button>
        </div>
      </header>

      <nav className="flex items-center gap-1 px-6 py-2 overflow-x-auto" style={{ borderBottom: `1px solid ${BORDER}` }}>
        {navItems.map(n => (
          <button key={n.key} onClick={() => { setView(n.key); trackFeature(n.key); }} data-tutorial={n.tutorial}
            className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${view === n.key ? "bg-amber-500/15 text-amber-300 border border-amber-500/20" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
            {n.icon} {n.label}
          </button>
        ))}
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {view === "dashboard" && <DashboardView data={dashData} lang={lang} />}
        {view === "staircase" && <StaircaseView tree={stairTree} lang={lang} onEdit={s => { setEditStair(s); setShowEditor(true); }} onAdd={() => { setEditStair(null); setShowEditor(true); }} onExport={exportPDF} onMove={moveStair} strategyContext={activeStrat} onSaveNote={saveToNotes} onExecutionRoom={s => setExecRoomStair(s)} />}
        {view === "ai" && <AIChatView lang={lang} userId={user.id || user.email} strategyContext={activeStrat} onSaveNote={saveToNotes} onMatrixClick={openMatrix} />}
        {view === "actionplans" && <ActionPlansView strategyContext={activeStrat} lang={lang} onMatrixClick={openMatrix} />}
        {view === "alerts" && <AlertsView alerts={alerts} lang={lang} />}
        {view === "knowledge" && <KnowledgeLibrary lang={lang} />}
        {view === "notes" && <NotesView lang={lang} userId={user.id || user.email} strategyName={activeStrat?.name} />}
      </main>

      <StairEditor open={showEditor} onClose={() => { setShowEditor(false); setEditStair(null); }} stair={editStair} allStairs={stairTree} onSave={saveStair} onDelete={deleteStair} lang={lang} />

      {execRoomStair && <ExecutionRoom stair={execRoomStair} strategyContext={activeStrat} lang={lang} onBack={() => setExecRoomStair(null)} onSaveNote={saveToNotes} onMatrixClick={openMatrix} />}

      <StrategyMatrixToolkit open={matrixToolkit.open} matrixKey={matrixToolkit.key} onClose={closeMatrix} />

      <footer className="text-center py-6 text-gray-700 text-[10px] tracking-widest uppercase">By DEVONEERS • ST.AIRS v3.7.0 • "Human IS the Loop" • {new Date().getFullYear()}</footer>

      <TutorialOverlay active={tutorialActive} onClose={() => setTutorialActive(false)} steps={tutorialCustomSteps} />
      {tutorialNewSteps && <TutorialUpdatePrompt onStart={startNewStepsTutorial} onDismiss={dismissNewSteps} />}
      <FeaturesExploredBadge show={showFeaturesBadge} onClose={() => setShowFeaturesBadge(false)} />
    </div>
  );
}
