import { useState, useEffect, useCallback, useRef, useMemo } from "react";

const API = "https://stairs-production.up.railway.app";

const GOLD = "#B8904A";
const GOLD_L = "#e8b94a";
const TEAL = "#2A5C5C";
const CHAMPAGNE = "#F7E7CE";
const DEEP = "#0a1628";
const BORDER = "rgba(30, 58, 95, 0.5)";

const typeColors = { vision: GOLD, objective: "#60a5fa", key_result: "#34d399", initiative: "#a78bfa", task: "#94a3b8", perspective: "#f472b6", strategic_objective: "#38bdf8", measure: "#fb923c", kpi: "#22d3ee", goal: "#a3e635", strategy: GOLD };
const typeIcons = { vision: "◆", objective: "▣", key_result: "◎", initiative: "▶", task: "•", perspective: "◈", strategic_objective: "▢", measure: "◉", kpi: "◎", goal: "▣", strategy: "◆" };
const typeLabels = { vision: "Vision", objective: "Objective", key_result: "Key Result", initiative: "Initiative", task: "Task" };
const typeLabelsAr = { vision: "الرؤية", objective: "الهدف", key_result: "نتيجة رئيسية", initiative: "مبادرة", task: "مهمة" };
const glass = (op = 0.6) => ({ background: `rgba(22, 37, 68, ${op})`, border: `1px solid ${BORDER}` });
const inputCls = "w-full px-3 py-2.5 rounded-lg bg-[#0a1628]/80 border border-[#1e3a5f] text-white placeholder-gray-600 focus:border-amber-500/40 focus:outline-none transition text-sm";
const labelCls = "text-gray-400 text-xs uppercase tracking-wider mb-1.5 block";

// ═══ SIMPLE MARKDOWN RENDERER ═══
const Markdown = ({ text }) => {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let i = 0;
  for (const line of lines) {
    i++;
    if (line.startsWith("## ")) {
      elements.push(<h3 key={i} className="text-amber-300 font-semibold text-sm mt-3 mb-1">{line.slice(3)}</h3>);
    } else if (line.startsWith("# ")) {
      elements.push(<h2 key={i} className="text-amber-200 font-bold text-base mt-3 mb-1">{line.slice(2)}</h2>);
    } else if (line.startsWith("- **") || line.startsWith("– **")) {
      const match = line.match(/^[-–]\s*\*\*\[?([^\]*]+)\]?\*\*\s*(.*)/);
      if (match) {
        elements.push(<div key={i} className="flex gap-2 ml-2 my-0.5"><span className="text-amber-400/60 shrink-0">→</span><span><strong className="text-amber-200/90">{match[1]}</strong> <span className="text-gray-300">{match[2]}</span></span></div>);
      } else {
        elements.push(<div key={i} className="flex gap-2 ml-2 my-0.5"><span className="text-amber-400/60">→</span><span className="text-gray-300">{line.replace(/^[-–]\s*/, "").replace(/\*\*/g, "")}</span></div>);
      }
    } else if (line.startsWith("- ")) {
      elements.push(<div key={i} className="flex gap-2 ml-2 my-0.5"><span className="text-gray-600">•</span><span className="text-gray-300">{line.slice(2).replace(/\*\*/g, "")}</span></div>);
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      elements.push(<p key={i} className="text-gray-300 my-0.5">{parts.map((p, j) => j % 2 === 1 ? <strong key={j} className="text-white">{p}</strong> : p)}</p>);
    }
  }
  return <div>{elements}</div>;
};

// ═══ API CLIENT ═══
class StairsAPI {
  constructor() {
    this.token = localStorage.getItem("stairs_token");
    this.user = JSON.parse(localStorage.getItem("stairs_user") || "null");
  }
  headers() {
    const h = { "Content-Type": "application/json" };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return h;
  }
  async login(email, password) {
    const r = await fetch(`${API}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (!r.ok) throw new Error("Login failed");
    const d = await r.json(); this.token = d.access_token; this.user = d.user;
    localStorage.setItem("stairs_token", d.access_token);
    localStorage.setItem("stairs_user", JSON.stringify(d.user));
    return d;
  }
  logout() { this.token = null; this.user = null; localStorage.removeItem("stairs_token"); localStorage.removeItem("stairs_user"); }
  async get(p) { const r = await fetch(`${API}${p}`, { headers: this.headers() }); if (r.status === 401) { this.logout(); throw new Error("Session expired"); } if (!r.ok) throw new Error(`GET ${p} → ${r.status}`); return r.json(); }
  async post(p, b) { const r = await fetch(`${API}${p}`, { method: "POST", headers: this.headers(), body: JSON.stringify(b) }); if (r.status === 401) { this.logout(); throw new Error("Session expired"); } if (!r.ok) throw new Error(`POST ${p} → ${r.status}`); return r.json(); }
  async put(p, b) { const r = await fetch(`${API}${p}`, { method: "PUT", headers: this.headers(), body: JSON.stringify(b) }); if (r.status === 401) { this.logout(); throw new Error("Session expired"); } if (!r.ok) throw new Error(`PUT ${p} → ${r.status}`); return r.json(); }
  async del(p) { const r = await fetch(`${API}${p}`, { method: "DELETE", headers: this.headers() }); if (r.status === 401) { this.logout(); throw new Error("Session expired"); } if (!r.ok) throw new Error(`DELETE ${p} → ${r.status}`); return r.status === 204 ? null : r.json(); }
}
const api = new StairsAPI();

// ═══ CONVERSATION STORE ═══
class ConvStore {
  constructor(uid) { this.p = `stairs_c_${uid}`; }
  _k(k) { return `${this.p}_${k}`; }
  list() { try { return JSON.parse(localStorage.getItem(this._k("l")) || "[]"); } catch { return []; } }
  save(c) { const l = this.list(); const i = l.findIndex(x => x.id === c.id); if (i >= 0) l[i] = c; else l.unshift(c); localStorage.setItem(this._k("l"), JSON.stringify(l)); }
  remove(id) { localStorage.setItem(this._k("l"), JSON.stringify(this.list().filter(c => c.id !== id))); localStorage.removeItem(this._k(`m_${id}`)); }
  msgs(id) { try { return JSON.parse(localStorage.getItem(this._k(`m_${id}`)) || "[]"); } catch { return []; } }
  saveMsgs(id, m) { localStorage.setItem(this._k(`m_${id}`), JSON.stringify(m)); }
  create(t) { const c = { id: `c_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, title: t || "New", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), count: 0 }; this.save(c); return c; }
  activeId() { return localStorage.getItem(this._k("a")) || null; }
  setActive(id) { if (id) localStorage.setItem(this._k("a"), id); else localStorage.removeItem(this._k("a")); }
}

// ═══ STRATEGY API — BUG 1 FIX ═══
class StrategyAPI {
  constructor(uid) { this.uid = uid; this.localKey = `stairs_s_${uid}`; }
  async list() {
    try {
      const serverStrategies = await api.get("/api/v1/strategies");
      const localDrafts = this._getLocal().filter(s => s.source === "local");
      // Remove any local entries that now exist on server (dedup)
      const serverIds = new Set(serverStrategies.map(s => String(s.id)));
      const cleanLocal = localDrafts.filter(s => !serverIds.has(s.id));
      if (cleanLocal.length !== this._getLocal().length) this._saveLocal(cleanLocal);
      return [...serverStrategies.map(s => ({ ...s, id: String(s.id), source: "server" })), ...cleanLocal];
    } catch (e) {
      console.warn("Strategy API fallback:", e.message);
      return this._getLocal();
    }
  }
  async create(stratData) {
    try {
      const serverResult = await api.post("/api/v1/strategies", {
        name: stratData.name, name_ar: stratData.name_ar || null,
        description: stratData.description || null, description_ar: stratData.description_ar || null,
        company: stratData.company || null, industry: stratData.industry || null,
        icon: stratData.icon || "🎯", color: stratData.color || GOLD, framework: stratData.framework || "okr",
      });
      return { ...serverResult, id: String(serverResult.id), source: "server" };
    } catch (e) {
      console.warn("Strategy create fallback:", e.message);
      const local = { ...stratData, id: `s_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, source: "local", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const list = this._getLocal(); list.push(local); this._saveLocal(list); return local;
    }
  }
  async remove(id) { try { await api.del(`/api/v1/strategies/${id}`); } catch {} this._saveLocal(this._getLocal().filter(s => s.id !== id)); localStorage.removeItem(`stairs_el_${id}`); }
  async update(id, updates) { try { await api.put(`/api/v1/strategies/${id}`, updates); } catch { const list = this._getLocal(); const i = list.findIndex(s => s.id === id); if (i >= 0) list[i] = { ...list[i], ...updates, updated_at: new Date().toISOString() }; this._saveLocal(list); } }
  _getLocal() { try { return JSON.parse(localStorage.getItem(this.localKey) || "[]"); } catch { return []; } }
  _saveLocal(list) { localStorage.setItem(this.localKey, JSON.stringify(list)); }
  activeId() { return localStorage.getItem(`${this.localKey}_a`) || null; }
  setActive(id) { if (id) localStorage.setItem(`${this.localKey}_a`, id); else localStorage.removeItem(`${this.localKey}_a`); }
}

// ═══ SHARED COMPONENTS ═══
const HealthBadge = ({ health, size = "sm" }) => {
  const c = { on_track: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", at_risk: "bg-amber-500/20 text-amber-300 border-amber-500/30", off_track: "bg-red-500/20 text-red-300 border-red-500/30", achieved: "bg-blue-500/20 text-blue-300 border-blue-500/30" };
  const d = { on_track: "●", at_risk: "●", off_track: "○", achieved: "★" };
  const s = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-3 py-1";
  return <span className={`${s} rounded-full border font-medium whitespace-nowrap ${c[health] || c.at_risk}`}>{d[health] || "?"} {health?.replace("_", " ").toUpperCase()}</span>;
};

const ProgressRing = ({ percent = 0, size = 80, stroke = 6, color }) => {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c - (percent / 100) * c;
  const col = color || (percent >= 70 ? "#34d399" : percent >= 40 ? "#fbbf24" : "#f87171");
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e3a5f" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease" }} />
      <text x="50%" y="50%" textAnchor="middle" dy=".35em" fill={col} fontSize={size * 0.22} fontWeight="700" transform={`rotate(90 ${size/2} ${size/2})`}>{Math.round(percent)}%</text>
    </svg>
  );
};

const Modal = ({ open, onClose, title, children, wide }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className={`relative z-10 w-full ${wide ? "max-w-4xl" : "max-w-lg"} min-w-[340px] max-h-[88vh] flex flex-col rounded-2xl overflow-hidden`}
        style={{ background: "rgba(15, 25, 50, 0.97)", border: `1px solid ${GOLD}33`, boxShadow: "0 25px 50px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: `1px solid ${GOLD}22` }}>
          <h2 className="text-white font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition text-xl leading-none p-1">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
};

// ═══ LOGIN ═══
const LoginScreen = ({ onLogin }) => {
  const [email, setEmail] = useState(""); const [pass, setPass] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await api.login(email, pass); onLogin(api.user); } catch { setErr("Invalid credentials"); }
    setBusy(false);
  };
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", background: `linear-gradient(135deg, ${DEEP} 0%, #162544 40%, #1a3055 70%, #0f1f3a 100%)` }}>
      <form onSubmit={go} style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: "440px", padding: "48px 40px", borderRadius: "16px", backdropFilter: "blur(20px)", background: "rgba(22, 37, 68, 0.85)", border: `1px solid ${GOLD}33`, boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{ fontSize: "52px", fontWeight: "bold", letterSpacing: "-1px", marginBottom: "8px", background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L}, ${CHAMPAGNE})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "'Instrument Serif', Georgia, serif" }}>ST.AIRS</div>
          <div style={{ color: "#9ca3af", fontSize: "13px", letterSpacing: "4px", textTransform: "uppercase", marginTop: "4px" }}>Strategic Staircase</div>
          <div style={{ width: "64px", height: "2px", margin: "16px auto 0", background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} />
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Password" required className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} />
        </div>
        {err && <div style={{ marginTop: "12px", color: "#f87171", fontSize: "14px", textAlign: "center" }}>{err}</div>}
        <button type="submit" disabled={busy} style={{ width: "100%", marginTop: "32px", padding: "14px", borderRadius: "10px", fontWeight: 600, fontSize: "16px", color: "#0a1628", border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, opacity: busy ? 0.5 : 1, transition: "transform 0.2s" }}>{busy ? "..." : "Sign In"}</button>
        <div style={{ textAlign: "center", marginTop: "24px", color: "#4b5563", fontSize: "12px" }}>By DEVONEERS</div>
      </form>
    </div>
  );
};

// ═══ STRATEGY LANDING — BUG 1 FIX ═══
const StrategyLanding = ({ strategies, onSelect, onCreate, onDelete, userName, onLogout, onLangToggle, lang, loading }) => {
  const [showWizard, setShowWizard] = useState(false);
  const isAr = lang === "ar";
  return (
    <div className="min-h-screen text-white" dir={isAr ? "rtl" : "ltr"} style={{ background: `linear-gradient(180deg, ${DEEP} 0%, #0f1f3a 50%, ${DEEP} 100%)`, fontFamily: isAr ? "'Noto Kufi Arabic', sans-serif" : "'DM Sans', system-ui, sans-serif" }}>
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "'Instrument Serif', Georgia, serif" }}>ST.AIRS</span>
          <span className="text-[10px] text-gray-600 uppercase tracking-widest">v3.5.2</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onLangToggle} className="text-xs text-gray-500 hover:text-amber-400 transition">{isAr ? "EN" : "عربي"}</button>
          <button onClick={onLogout} className="text-xs text-gray-600 hover:text-gray-300 transition">{userName} ↗</button>
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-6 pt-16 pb-8 text-center">
        <h1 className="text-3xl font-bold text-white mb-3" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>{isAr ? "استراتيجياتك" : "Your Strategies"}</h1>
        <p className="text-gray-500 text-sm max-w-lg mx-auto">{isAr ? "كل استراتيجية هي سلم مستقل." : "Each strategy is an independent staircase for a company, product, or project."}</p>
      </div>
      <div className="max-w-5xl mx-auto px-6 pb-12">
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" /></div>
        ) : (
          <div className="flex flex-wrap justify-center gap-6">
            <button onClick={() => setShowWizard(true)} className="group p-8 rounded-2xl border-2 border-dashed border-[#1e3a5f] hover:border-amber-500/40 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4" style={{ width: "320px", minHeight: "260px" }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-all group-hover:scale-110" style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}30` }}>+</div>
              <div className="text-center"><div className="text-white font-medium text-sm">{isAr ? "إنشاء استراتيجية جديدة" : "Create New Strategy"}</div><div className="text-gray-600 text-xs mt-1">{isAr ? "سيساعدك الذكاء الاصطناعي" : "AI will help you build the staircase"}</div></div>
            </button>
            {strategies.map(s => {
              const statusLabel = s.source === "server" ? (s.status === "active" ? "● Active" : s.status === "archived" ? "◌ Archived" : "◦ Draft") : "● Local Draft";
              const statusColor = s.source === "server" ? (s.status === "active" ? "#34d399" : s.status === "archived" ? "#94a3b8" : GOLD) : "#a78bfa";
              return (
                <div key={s.id} className="group relative p-8 rounded-2xl transition-all hover:scale-[1.02] cursor-pointer flex flex-col" style={{ ...glass(0.5), borderColor: `${s.color || GOLD}30`, width: "320px", minHeight: "260px" }} onClick={() => onSelect(s)}>
                  <button onClick={e => { e.stopPropagation(); if (window.confirm(`Delete "${s.name}"?`)) onDelete(s.id); }} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 text-xs transition p-1.5 rounded-lg hover:bg-red-500/10">✕</button>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl mb-4" style={{ background: `${s.color || GOLD}20`, border: `1px solid ${s.color || GOLD}30` }}>{s.icon || "🎯"}</div>
                  <div className="flex-1">
                    <div className="text-white font-semibold text-base mb-1">{isAr && s.name_ar ? s.name_ar : s.name}</div>
                    <div className="text-gray-500 text-xs mb-2">{s.company}</div>
                    {s.description && <div className="text-gray-600 text-xs leading-relaxed line-clamp-2">{s.description}</div>}
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
                    <div className="text-gray-600 text-[10px]">{s.updated_at ? new Date(s.updated_at).toLocaleDateString() : ""}</div>
                    <div className="flex items-center gap-2">
                      {s.element_count > 0 && <span className="text-[10px] text-gray-600">{s.element_count} el</span>}
                      <div className="text-xs font-medium" style={{ color: statusColor }}>{statusLabel}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <StrategyWizard open={showWizard} onClose={() => setShowWizard(false)} onCreate={onCreate} lang={lang} />
      <footer className="text-center py-8 text-gray-700 text-[10px] tracking-widest uppercase">By DEVONEERS • ST.AIRS v3.5.2 • {new Date().getFullYear()}</footer>
    </div>
  );
};

// ═══ AI STRATEGY WIZARD ═══
const StrategyWizard = ({ open, onClose, onCreate, lang }) => {
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

// ═══ STAIR EDITOR ═══
const StairEditor = ({ open, onClose, stair, allStairs, onSave, onDelete, lang }) => {
  const isNew = !stair?.id; const isAr = lang === "ar";
  const [form, setForm] = useState({ title: "", title_ar: "", description: "", element_type: "objective", health: "on_track", progress_percent: 0, parent_id: null, code: "" });
  const [saving, setSaving] = useState(false); const [confirmDel, setConfirmDel] = useState(false);
  const labels = isAr ? typeLabelsAr : typeLabels;
  useEffect(() => { if (stair) setForm({ title: stair.title||"", title_ar: stair.title_ar||"", description: stair.description||"", element_type: stair.element_type||"objective", health: stair.health||"on_track", progress_percent: stair.progress_percent||0, parent_id: stair.parent_id||null, code: stair.code||"" }); else setForm({ title: "", title_ar: "", description: "", element_type: "objective", health: "on_track", progress_percent: 0, parent_id: null, code: "" }); setConfirmDel(false); }, [stair, open]);
  const parentOpts = useMemo(() => { const flat = []; const walk = (nodes, d=0) => { nodes.forEach(n => { if (!stair||n.stair.id!==stair.id) flat.push({ id: n.stair.id, label: `${"  ".repeat(d)}${n.stair.code||""} ${n.stair.title}` }); if (n.children) walk(n.children, d+1); }); }; walk(allStairs||[]); return flat; }, [allStairs, stair]);
  const doSave = async () => { if (!form.title.trim()) return; setSaving(true); try { await onSave(form, stair?.id); onClose(); } catch(e) { alert(e.message); } setSaving(false); };
  const doDel = async () => { if (!confirmDel) { setConfirmDel(true); return; } setSaving(true); try { await onDelete(stair.id); onClose(); } catch(e) { alert(e.message); } setSaving(false); };
  return (
    <Modal open={open} onClose={onClose} title={isNew ? (isAr ? "إضافة عنصر" : "Add Element") : (isAr ? "تعديل العنصر" : "Edit Element")}>
      <div className="space-y-4">
        <div><label className={labelCls}>{isAr ? "النوع" : "Type"}</label><div className="flex gap-2 flex-wrap">{Object.keys(typeLabels).map(tp => <button key={tp} onClick={() => setForm(f => ({...f, element_type:tp}))} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${form.element_type===tp?"border-amber-500/40 bg-amber-500/15 text-amber-300":"border-[#1e3a5f] text-gray-500"}`}><span style={{color:typeColors[tp]}}>{typeIcons[tp]}</span> {labels[tp]}</button>)}</div></div>
        <div><label className={labelCls}>Code</label><input value={form.code} onChange={e => setForm(f => ({...f, code:e.target.value}))} placeholder="OBJ-001" className={inputCls} /></div>
        <div><label className={labelCls}>{isAr ? "العنوان" : "Title"}</label><input value={form.title} onChange={e => setForm(f => ({...f, title:e.target.value}))} className={inputCls} /></div>
        <div><label className={labelCls}>{isAr ? "العنوان بالعربي" : "Title (Arabic)"}</label><input value={form.title_ar} onChange={e => setForm(f => ({...f, title_ar:e.target.value}))} className={inputCls} dir="rtl" /></div>
        <div><label className={labelCls}>{isAr ? "الوصف" : "Description"}</label><textarea value={form.description} onChange={e => setForm(f => ({...f, description:e.target.value}))} rows={2} className={`${inputCls} resize-none`} /></div>
        <div><label className={labelCls}>{isAr ? "الأصل" : "Parent"}</label><select value={form.parent_id||""} onChange={e => setForm(f => ({...f, parent_id:e.target.value||null}))} className={inputCls}><option value="">{isAr ? "بدون" : "None (top level)"}</option>{parentOpts.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
        <div><label className={labelCls}>{isAr ? "الحالة" : "Health"}</label><div className="flex gap-2 flex-wrap">{["on_track","at_risk","off_track","achieved"].map(h => <button key={h} onClick={() => setForm(f => ({...f, health:h}))} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${form.health===h?(h==="on_track"?"bg-emerald-500/20 text-emerald-300 border-emerald-500/30":h==="at_risk"?"bg-amber-500/20 text-amber-300 border-amber-500/30":h==="off_track"?"bg-red-500/20 text-red-300 border-red-500/30":"bg-blue-500/20 text-blue-300 border-blue-500/30"):"border-[#1e3a5f] text-gray-500"}`}>{h.replace("_"," ").toUpperCase()}</button>)}</div></div>
        <div><label className={labelCls}>{isAr ? "التقدم" : "Progress"}: {form.progress_percent}%</label><input type="range" min={0} max={100} value={form.progress_percent} onChange={e => setForm(f => ({...f, progress_percent:+e.target.value}))} className="w-full accent-amber-500" /></div>
        <div className="flex items-center gap-3 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
          {!isNew && <button onClick={doDel} className={`px-4 py-2 rounded-lg text-sm transition ${confirmDel?"bg-red-500/30 text-red-200 border border-red-500/50":"text-red-400/60 hover:text-red-300"}`}>{confirmDel ? "Confirm?" : (isAr ? "حذف" : "Delete")}</button>}
          <div className="flex-1" /><button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">{isAr ? "إلغاء" : "Cancel"}</button>
          <button onClick={doSave} disabled={saving||!form.title.trim()} className="px-5 py-2 rounded-lg text-sm font-semibold text-[#0a1628] disabled:opacity-40 transition-all hover:scale-[1.02]" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` }}>{saving ? "..." : (isAr ? "حفظ" : "Save")}</button>
        </div>
      </div>
    </Modal>
  );
};

// ═══ DASHBOARD ═══
const DashboardView = ({ data, lang }) => {
  const s = data?.stats || {}; const isAr = lang === "ar";
  const stats = [{ label: isAr?"إجمالي":"Total Elements", value: s.total_elements||0, color: "#60a5fa" },{ label: isAr?"على المسار":"On Track", value: s.on_track||0, color: "#34d399" },{ label: isAr?"في خطر":"At Risk", value: s.at_risk||0, color: "#fbbf24" },{ label: isAr?"خارج المسار":"Off Track", value: s.off_track||0, color: "#f87171" }];
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6 p-6 rounded-2xl" style={glass()}><ProgressRing percent={s.overall_progress||0} size={120} stroke={8} /><div><div className="text-gray-400 text-sm">{isAr?"التقدم الإجمالي":"Overall Progress"}</div><div className="text-3xl font-bold text-white">{Math.round(s.overall_progress||0)}%</div></div></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{stats.map((st,i) => <div key={i} className="p-4 rounded-xl text-center" style={{...glass(0.5), borderColor:`${st.color}22`}}><div className="text-3xl font-bold" style={{color:st.color}}>{st.value}</div><div className="text-gray-400 text-xs mt-1">{st.label}</div></div>)}</div>
      {data?.top_risks?.length > 0 && <div><h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">{isAr?"أعلى المخاطر":"Top Risks"}</h3><div className="space-y-2">{data.top_risks.map((r,i) => <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={glass(0.4)}><div className="text-xs font-mono text-amber-400/80 w-16 shrink-0">{r.code}</div><div className="flex-1 text-white text-sm truncate">{isAr&&r.title_ar?r.title_ar:r.title}</div><HealthBadge health={r.health}/><div className="text-white text-sm w-12 text-right">{r.progress_percent}%</div></div>)}</div></div>}
    </div>
  );
};

// ═══ STAIRCASE VIEW ═══
const StaircaseView = ({ tree, lang, onEdit, onAdd, onExport, onMove, strategyContext }) => {
  const [expanded, setExpanded] = useState(null); const [aiAction, setAiAction] = useState(null);
  const [aiResult, setAiResult] = useState({}); const [aiLoading, setAiLoading] = useState(false);
  const isAr = lang === "ar";
  const sourceRef = "When citing frameworks, books, or statistics, include a brief source reference.";
  const handleAI = async (stair, action) => {
    setAiAction({ id: stair.id, type: action }); setAiLoading(true);
    try {
      const ctx = strategyContext ? `[Strategy: "${strategyContext.name}" for "${strategyContext.company}". Industry: ${strategyContext.industry||"unspecified"}.]\n\n` : "";
      const prompt = action === "explain"
        ? `${ctx}${sourceRef}\n\nExplain: ${stair.element_type} "${stair.title}" (${stair.code||""}), health: ${stair.health}, progress: ${stair.progress_percent}%.\n${stair.description||""}\n\nExplain meaning, importance, success criteria, and risks.`
        : `${ctx}${sourceRef}\n\nEnhance: ${stair.element_type} "${stair.title}" (${stair.code||""}), health: ${stair.health}, progress: ${stair.progress_percent}%.\n${stair.description||""}\n\nSuggest: 1) Better definition, 2) KPIs, 3) Next actions, 4) Sub-elements.`;
      const res = await api.post("/api/v1/ai/chat", { message: prompt });
      setAiResult(prev => ({...prev, [stair.id]: {...prev[stair.id], [action]: res.response}}));
    } catch (e) { setAiResult(prev => ({...prev, [stair.id]: {...prev[stair.id], [action]: `⚠️ ${e.message}`}})); }
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
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={e => {e.stopPropagation();handleAI(s,"explain");}} disabled={isLd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:scale-[1.02]" style={{borderColor:`${TEAL}60`,color:"#5eead4",background:`${TEAL}20`}}>{isLd&&aiAction?.type==="explain"?<span className="animate-spin">⟳</span>:"💡"} {isAr?"شرح":"Explain"}</button>
                <button onClick={e => {e.stopPropagation();handleAI(s,"enhance");}} disabled={isLd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:scale-[1.02]" style={{borderColor:`${GOLD}60`,color:GOLD,background:`${GOLD}15`}}>{isLd&&aiAction?.type==="enhance"?<span className="animate-spin">⟳</span>:"✨"} {isAr?"تحسين":"Enhance"}</button>
                <button onClick={e => {e.stopPropagation();onEdit(s);}} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#1e3a5f] text-gray-400 hover:text-white transition hover:bg-white/5">✎ {isAr?"تعديل":"Edit"}</button>
              </div>
              {isLd && <div className="flex items-center gap-2 py-3"><div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-amber-500/40 animate-bounce" style={{animationDelay:`${i*0.15}s`}} />)}</div><span className="text-gray-500 text-xs">{aiAction?.type==="explain"?"Analyzing...":"Generating..."}</span></div>}
              {result?.explain && <div className="p-3 rounded-lg" style={{background:`${TEAL}10`,border:`1px solid ${TEAL}25`}}><div className="text-xs font-semibold text-teal-300 uppercase tracking-wider mb-2">💡 Explanation</div><div className="text-sm"><Markdown text={result.explain}/></div></div>}
              {result?.enhance && <div className="p-3 rounded-lg" style={{background:`${GOLD}08`,border:`1px solid ${GOLD}20`}}><div className="text-xs font-semibold text-amber-300 uppercase tracking-wider mb-2">✨ Enhancement</div><div className="text-sm"><Markdown text={result.enhance}/></div></div>}
            </div>
          )}
        </div>
        {node.children?.map((ch,ci) => renderStair(ch, depth+1, ci, node.children.length))}
      </div>
    );
  };
  return (
    <div>
      <div className="flex items-center gap-3 mb-4"><button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]" style={{background:`${GOLD}22`,border:`1px solid ${GOLD}33`,color:GOLD}}>+ {isAr?"إضافة":"Add Element"}</button><div className="flex-1"/><button onClick={onExport} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white transition" style={{border:`1px solid ${BORDER}`}}>↓ {isAr?"تصدير":"Export"}</button></div>
      {!tree?.length ? <div className="text-gray-500 text-center py-12">{isAr?"لا توجد عناصر بعد.":"No elements yet. Add your first or use AI Advisor."}</div> : <div className="space-y-0.5">{tree.map((n,i) => renderStair(n,0,i,tree.length))}</div>}
    </div>
  );
};

// ═══ AI CHAT — BUG 4+6 FIX ═══
const AIChatView = ({ lang, userId, strategyContext }) => {
  const storeRef = useRef(null); if (!storeRef.current && userId) storeRef.current = new ConvStore(userId); const store = storeRef.current;
  const [convs, setConvs] = useState([]); const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]); const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false); const [showHist, setShowHist] = useState(false);
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
      const res = await api.post("/api/v1/ai/chat", { message: contextMsg });
      const aiMsg = { role: "ai", text: res.response, tokens: res.tokens_used, ts: new Date().toISOString() }; const final = [...newMsgs, aiMsg]; setMessages(final);
      if (store&&cid) { store.saveMsgs(cid,final); const conv = store.list().find(c => c.id===cid); if (conv) { if (conv.title==="New") conv.title=msg.slice(0,60); conv.updated_at=new Date().toISOString(); conv.count=final.length; store.save(conv); setConvs(store.list()); } }
    } catch (e) { const err = { role: "ai", text: `⚠️ ${e.message}`, error: true, ts: new Date().toISOString() }; const final = [...newMsgs, err]; setMessages(final); if (store&&cid) store.saveMsgs(cid,final); }
    setLoading(false);
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
          <button onClick={newChat} className="text-xs px-3 py-1.5 rounded-lg text-amber-400/70 border border-amber-500/20 hover:bg-amber-500/10 transition">+ {isAr?"محادثة جديدة":"New Chat"}</button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 pb-4 px-1 min-h-0">
          {messages.length===0 && <div className="text-gray-600 text-center py-12 text-sm">{isAr?"ابدأ محادثة جديدة":"Start a new conversation"}</div>}
          {messages.map((m,i) => <div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}><div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed ${m.role==="user"?"bg-amber-500/20 text-amber-100 rounded-br-md":m.error?"bg-red-500/10 text-red-300 rounded-bl-md border border-red-500/20":"bg-[#162544] text-gray-200 rounded-bl-md border border-[#1e3a5f]"}`}>{m.role==="ai"?<Markdown text={m.text}/>:<div className="whitespace-pre-wrap">{m.text}</div>}{m.tokens>0&&<div className="text-[10px] text-gray-600 mt-2 text-right">{m.tokens} tokens</div>}</div></div>)}
          {loading && <div className="flex gap-1 px-4 py-2">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-amber-500/40 animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}</div>}
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

// ═══ ALERTS ═══
const AlertsView = ({ alerts, lang }) => {
  const isAr = lang === "ar";
  const sc = { critical: { bg:"rgba(248,113,113,0.1)", border:"#f8717130", icon:"🔴", text:"text-red-300" }, high: { bg:"rgba(251,191,36,0.1)", border:"#fbbf2430", icon:"🟡", text:"text-amber-300" }, medium: { bg:"rgba(96,165,250,0.1)", border:"#60a5fa30", icon:"🔵", text:"text-blue-300" }, info: { bg:"rgba(96,165,250,0.08)", border:"#60a5fa20", icon:"ℹ️", text:"text-blue-300" } };
  if (!alerts?.length) return <div className="text-gray-500 text-center py-12">{isAr?"لا توجد تنبيهات":"No active alerts"}</div>;
  return <div className="space-y-3">{alerts.map((a,i) => { const s = sc[a.severity]||sc.info; return <div key={i} className="p-4 rounded-xl" style={{background:s.bg,border:`1px solid ${s.border}`}}><div className="flex items-start gap-3"><span className="text-lg">{s.icon}</span><div className="flex-1"><div className={`font-medium text-sm ${s.text}`}>{isAr&&a.title_ar?a.title_ar:a.title}</div><div className="text-gray-400 text-xs mt-1">{isAr&&a.description_ar?a.description_ar:a.description}</div></div></div></div>; })}</div>;
};

// ═══ KNOWLEDGE LIBRARY — BUG 5 FIX ═══
const KnowledgeLibrary = ({ lang }) => {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState({ stats: null, frameworks: [], books: [], failurePatterns: [], measurementTools: [] });
  const [loading, setLoading] = useState(true); const isAr = lang === "ar";
  useEffect(() => { (async () => { setLoading(true); try { const [stats,fw,bk,fp,mt] = await Promise.all([api.get("/api/v1/knowledge/stats").catch(()=>null), api.get("/api/v1/knowledge/frameworks").catch(()=>[]), api.get("/api/v1/knowledge/books").catch(()=>[]), api.get("/api/v1/knowledge/failure-patterns").catch(()=>[]), api.get("/api/v1/knowledge/measurement-tools").catch(()=>[])]); setData({stats,frameworks:fw,books:bk,failurePatterns:fp,measurementTools:mt}); } catch(e) { console.error(e); } setLoading(false); })(); }, []);
  const tabs = [{key:"overview",icon:"📊",label:isAr?"نظرة عامة":"Overview"},{key:"frameworks",icon:"🧩",label:isAr?"الأطر":"Frameworks"},{key:"books",icon:"📚",label:isAr?"الكتب":"Books"},{key:"patterns",icon:"⚠️",label:isAr?"أنماط الفشل":"Failure Patterns"},{key:"tools",icon:"🔧",label:isAr?"أدوات القياس":"Measurement Tools"}];
  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin"/></div>;
  const phaseColors = { analysis:"#60a5fa", formulation:"#a78bfa", design:"#f472b6", execution:"#34d399" };
  const tierColors = { tier_1:"#fbbf24", tier_2:"#60a5fa", tier_3:"#94a3b8" };
  const sevColors = { critical:"#f87171", high:"#fbbf24", medium:"#60a5fa", low:"#94a3b8" };
  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">{tabs.map(t => <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${tab===t.key?"bg-amber-500/15 text-amber-300 border border-amber-500/20":"text-gray-500 hover:text-gray-300 border border-transparent"}`}>{t.icon} {t.label}</button>)}</div>

      {tab==="overview" && data.stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[{l:"Frameworks",v:data.stats.frameworks||0,c:"#60a5fa"},{l:"Books",v:data.stats.books||0,c:"#a78bfa"},{l:"Failure Patterns",v:data.stats.failure_patterns||0,c:"#f87171"},{l:"Measurement Tools",v:data.stats.measurement_tools||0,c:"#34d399"}].map((s,i) => <div key={i} className="p-4 rounded-xl text-center" style={{...glass(0.5),borderColor:`${s.c}22`}}><div className="text-2xl font-bold" style={{color:s.c}}>{s.v}</div><div className="text-gray-400 text-xs mt-1">{s.l}</div></div>)}
          </div>
          {data.stats.key_facts && <div><h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">Key Research Facts</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-3">{data.stats.key_facts.map((f,i) => <div key={i} className="p-4 rounded-xl" style={glass(0.4)}><div className="text-xl font-bold text-amber-300">{f.value}</div><div className="text-white text-sm mt-1">{f.label}</div><div className="text-gray-600 text-[10px] mt-1">{f.source}</div></div>)}</div></div>}
        </div>
      )}

      {tab==="frameworks" && (
        <div className="space-y-3">
          {data.frameworks.length===0 && <div className="text-gray-500 text-center py-8">No frameworks loaded. Run migration first.</div>}
          {data.frameworks.map((fw,i) => (
            <div key={i} className="p-4 rounded-xl" style={glass(0.4)}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-white font-semibold text-sm">{fw.name}</span>
                {fw.phase && <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium" style={{color:phaseColors[fw.phase]||"#94a3b8",borderColor:`${phaseColors[fw.phase]||"#94a3b8"}40`,background:`${phaseColors[fw.phase]||"#94a3b8"}15`}}>{fw.phase?.toUpperCase()}</span>}
              </div>
              {fw.originator && <div className="text-gray-500 text-xs mb-1">{fw.originator}{fw.year?` (${fw.year})`:""}</div>}
              {fw.description && <div className="text-gray-400 text-xs leading-relaxed">{fw.description}</div>}
              {(fw.strengths||fw.limitations) && <div className="flex gap-4 mt-2">{fw.strengths && <div className="flex-1"><div className="text-emerald-400 text-[10px] uppercase mb-0.5">Strengths</div><div className="text-gray-400 text-xs">{fw.strengths}</div></div>}{fw.limitations && <div className="flex-1"><div className="text-red-400 text-[10px] uppercase mb-0.5">Limitations</div><div className="text-gray-400 text-xs">{fw.limitations}</div></div>}</div>}
            </div>
          ))}
        </div>
      )}

      {tab==="books" && (
        <div className="space-y-3">
          {data.books.length===0 && <div className="text-gray-500 text-center py-8">No books loaded.</div>}
          {data.books.map((bk,i) => (
            <div key={i} className="p-4 rounded-xl" style={glass(0.4)}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-white font-semibold text-sm">{bk.title}</span>
                {bk.tier && <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium" style={{color:tierColors[bk.tier]||"#94a3b8",borderColor:`${tierColors[bk.tier]||"#94a3b8"}40`,background:`${tierColors[bk.tier]||"#94a3b8"}15`}}>{bk.tier?.replace("_"," ").toUpperCase()}</span>}
              </div>
              {bk.authors && <div className="text-gray-500 text-xs mb-1">{bk.authors}{bk.year?` (${bk.year})`:""}</div>}
              {bk.key_concepts && <div className="text-gray-400 text-xs leading-relaxed">{bk.key_concepts}</div>}
              {bk.relevance && <div className="mt-1"><span className="text-amber-400 text-[10px] uppercase">Relevance: </span><span className="text-gray-400 text-xs">{bk.relevance}</span></div>}
            </div>
          ))}
        </div>
      )}

      {tab==="patterns" && (
        <div className="space-y-3">
          {data.failurePatterns.length===0 && <div className="text-gray-500 text-center py-8">No failure patterns loaded.</div>}
          {data.failurePatterns.map((fp,i) => (
            <div key={i} className="p-4 rounded-xl" style={glass(0.4)}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-white font-semibold text-sm">{fp.name || fp.pattern_name}</span>
                {fp.severity && <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium" style={{color:sevColors[fp.severity]||"#94a3b8",borderColor:`${sevColors[fp.severity]||"#94a3b8"}40`,background:`${sevColors[fp.severity]||"#94a3b8"}15`}}>{fp.severity?.toUpperCase()}</span>}
              </div>
              {fp.description && <div className="text-gray-400 text-xs leading-relaxed mb-2">{fp.description}</div>}
              {fp.detection_signals && <div className="mb-1"><span className="text-cyan-400 text-[10px] uppercase">Detection: </span><span className="text-gray-400 text-xs">{fp.detection_signals}</span></div>}
              {fp.prevention && <div><span className="text-emerald-400 text-[10px] uppercase">Prevention: </span><span className="text-gray-400 text-xs">{fp.prevention}</span></div>}
              {fp.research_stat && <div className="mt-1 text-amber-300/60 text-[10px] italic">{fp.research_stat}</div>}
            </div>
          ))}
        </div>
      )}

      {tab==="tools" && (
        <div className="space-y-3">
          {data.measurementTools.length===0 && <div className="text-gray-500 text-center py-8">No measurement tools loaded.</div>}
          {data.measurementTools.map((mt,i) => (
            <div key={i} className="p-4 rounded-xl" style={glass(0.4)}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-white font-semibold text-sm">{mt.name || mt.tool_name}</span>
                {mt.stage && <span className="text-[10px] px-2 py-0.5 rounded-full border border-teal-500/30 text-teal-300 bg-teal-500/10">{mt.stage}</span>}
              </div>
              {mt.description && <div className="text-gray-400 text-xs leading-relaxed mb-2">{mt.description}</div>}
              {mt.how_it_works && <div className="mb-1"><span className="text-blue-400 text-[10px] uppercase">How it works: </span><span className="text-gray-400 text-xs">{mt.how_it_works}</span></div>}
              {mt.interpretation && <div><span className="text-amber-400 text-[10px] uppercase">Interpretation: </span><span className="text-gray-400 text-xs">{mt.interpretation}</span></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

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
  const [stratLoading, setStratLoading] = useState(true);
  const stratApiRef = useRef(null);
  const isAr = lang === "ar";

  // Init StrategyAPI when user logs in
  useEffect(() => {
    if (user) { stratApiRef.current = new StrategyAPI(user.id || user.email); loadStrategies(); }
    else { stratApiRef.current = null; setStrategies([]); }
  }, [user]);

  const loadStrategies = async () => {
    if (!stratApiRef.current) return;
    setStratLoading(true);
    try { const list = await stratApiRef.current.list(); setStrategies(list); } catch (e) { console.error("Load strategies:", e); }
    setStratLoading(false);
  };

  const toggleLang = () => { const n = lang === "en" ? "ar" : "en"; setLang(n); localStorage.setItem("stairs_lang", n); };

  const selectStrategy = async (strat) => {
    setActiveStrat(strat); setView("dashboard");
    if (stratApiRef.current) stratApiRef.current.setActive(strat.id);
    // Load staircase tree (strategy-scoped endpoint)
    try { const tree = await api.get(`/api/v1/strategies/${strat.id}/tree`); setStairTree(tree || []); } catch { setStairTree([]); }
    // Load dashboard (org-wide)
    try { const dash = await api.get(`/api/v1/dashboard`); setDashData(dash); } catch { setDashData({ stats: { total_elements: 0, overall_progress: 0 } }); }
    // Load alerts (org-wide)
    try { const al = await api.get(`/api/v1/alerts`); setAlerts(al || []); } catch { setAlerts([]); }
  };

  const createStrategy = async (stratData) => {
    if (!stratApiRef.current) return;
    const created = await stratApiRef.current.create(stratData);

    // POST generated elements to backend (or store locally as fallback)
    if (stratData._localElements?.length > 0) {
      if (created.source === "server") {
        // Server path: POST each element, mapping local parent IDs to server IDs
        const idMap = {}; // local_id → server_id
        for (const el of stratData._localElements) {
          try {
            // Map parent_id from local to server
            const serverParentId = el.parent_id ? (idMap[el.parent_id] || null) : null;
            const serverEl = await api.post(`/api/v1/stairs`, {
              title: el.title,
              title_ar: el.title_ar || null,
              description: el.description || null,
              element_type: el.element_type,
              parent_id: serverParentId,
            });
            // Backend ignores strategy_id in POST — must PUT to assign it
            if (serverEl?.id) {
              await api.put(`/api/v1/stairs/${serverEl.id}`, { strategy_id: created.id });
            }
            // Track the mapping so children can reference server parent IDs
            if (el.id && serverEl?.id) idMap[el.id] = serverEl.id;
          } catch (e) {
            console.warn("Failed to create stair element:", el.title, e.message);
          }
        }
      } else {
        // Local fallback: store in localStorage
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
      // Backend ignores strategy_id in POST — must PUT to assign it
      if (created?.id) await api.put(`/api/v1/stairs/${created.id}`, { strategy_id: activeStrat.id });
    }
    // Refresh tree + dashboard
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
    // Move endpoint not available in current backend — reorder locally only
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
      let row = `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:10px 8px 10px ${12+indent}px;vertical-align:top">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="color:${typeColor(s.element_type)};font-size:14px">${typeIcons[s.element_type]||"•"}</span>
            <span style="font-size:10px;color:${typeColor(s.element_type)};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;background:${typeColor(s.element_type)}15;padding:1px 6px;border-radius:3px">${s.element_type.replace("_"," ")}</span>
          </div>
          <div style="margin-top:4px;font-weight:600;color:#1e293b;font-size:13px">${s.code ? `<span style="color:#94a3b8;font-family:monospace;font-size:11px">${s.code}</span> ` : ""}${isAr && s.title_ar ? s.title_ar : s.title}</div>
          ${s.description ? `<div style="color:#64748b;font-size:11px;margin-top:2px;max-width:500px">${s.description}</div>` : ""}
        </td>
        <td style="padding:10px 8px;text-align:center;vertical-align:middle;white-space:nowrap;font-size:12px;color:#475569">${healthLabel(s.health)}</td>
        <td style="padding:10px 8px;text-align:center;vertical-align:middle;width:120px">
          <div style="font-weight:600;font-size:13px;color:${barColor};margin-bottom:3px">${s.progress_percent||0}%</div>
          <div style="background:#e5e7eb;border-radius:4px;height:6px;overflow:hidden"><div style="background:${barColor};height:100%;width:${barW}%;border-radius:4px;transition:width 0.3s"></div></div>
        </td>
      </tr>`;
      if (s.ai_insights) {
        try {
          const insights = typeof s.ai_insights === "string" ? JSON.parse(s.ai_insights) : s.ai_insights;
          if (insights.explain) row += `<tr><td colspan="3" style="padding:4px 8px 8px ${40+indent}px;border-bottom:1px solid #f1f5f9"><div style="background:#f0fdfa;border-left:3px solid #14b8a6;padding:6px 10px;border-radius:0 4px 4px 0;font-size:11px;color:#0f766e"><strong>💡 AI Insight:</strong> ${insights.explain.slice(0,300)}${insights.explain.length>300?"...":""}</div></td></tr>`;
          if (insights.enhance) row += `<tr><td colspan="3" style="padding:4px 8px 8px ${40+indent}px;border-bottom:1px solid #f1f5f9"><div style="background:#fffbeb;border-left:3px solid #f59e0b;padding:6px 10px;border-radius:0 4px 4px 0;font-size:11px;color:#92400e"><strong>✨ Enhancement:</strong> ${insights.enhance.slice(0,300)}${insights.enhance.length>300?"...":""}</div></td></tr>`;
        } catch {}
      }
      return row;
    }).join("");
    const stats = { total: flatItems.length, onTrack: flatItems.filter(s => s.health === "on_track").length, atRisk: flatItems.filter(s => s.health === "at_risk").length, offTrack: flatItems.filter(s => s.health === "off_track").length, avgProgress: flatItems.length ? Math.round(flatItems.reduce((a,s) => a + (s.progress_percent||0), 0) / flatItems.length) : 0 };
    w.document.write(`<!DOCTYPE html><html><head><title>ST.AIRS Export - ${activeStrat?.name||"Strategy"}</title>
<style>
  @page { margin: 20mm 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; color: #1e293b; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; padding: 0; line-height: 1.5; }
  .header { display: flex; align-items: center; gap: 16px; padding-bottom: 16px; border-bottom: 2px solid #B8904A; margin-bottom: 20px; }
  .header .icon { font-size: 36px; }
  .header h1 { font-size: 28px; color: #1e293b; font-weight: 700; }
  .header .subtitle { font-size: 12px; color: #64748b; margin-top: 2px; }
  .stats-bar { display: flex; gap: 12px; margin-bottom: 24px; }
  .stat-box { flex: 1; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid #e5e7eb; }
  .stat-box .num { font-size: 22px; font-weight: 700; }
  .stat-box .lbl { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { text-align: left; padding: 10px 8px; border-bottom: 2px solid #B8904A; color: #B8904A; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
  .footer { text-align: center; margin-top: 30px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #94a3b8; font-size: 10px; }
  @media print { .stat-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <div class="header">
    <span class="icon">${activeStrat?.icon||"🎯"}</span>
    <div><h1>${activeStrat?.name||"Strategy"}</h1><div class="subtitle">${activeStrat?.company||""} ${activeStrat?.industry?`· ${activeStrat.industry}`:""} · Exported ${new Date().toLocaleDateString()}</div></div>
  </div>
  <div class="stats-bar">
    <div class="stat-box"><div class="num" style="color:#2563eb">${stats.total}</div><div class="lbl">Elements</div></div>
    <div class="stat-box"><div class="num" style="color:#059669">${stats.onTrack}</div><div class="lbl">On Track</div></div>
    <div class="stat-box"><div class="num" style="color:#d97706">${stats.atRisk}</div><div class="lbl">At Risk</div></div>
    <div class="stat-box"><div class="num" style="color:#dc2626">${stats.offTrack}</div><div class="lbl">Off Track</div></div>
    <div class="stat-box"><div class="num" style="color:#7c3aed">${stats.avgProgress}%</div><div class="lbl">Avg Progress</div></div>
  </div>
  <table><thead><tr><th style="width:60%">Element</th><th style="text-align:center">Health</th><th style="text-align:center;width:120px">Progress</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="footer">ST.AIRS v3.5.2 · By DEVONEERS · "Human IS the Loop" · &I</div>
</body></html>`);
    w.document.close();
    w.print();
  };

  const logout = () => { api.logout(); setUser(null); setActiveStrat(null); setStrategies([]); };

  // ═══ RENDER ═══
  if (!user) return <LoginScreen onLogin={setUser} />;
  if (!activeStrat) return <StrategyLanding strategies={strategies} onSelect={selectStrategy} onCreate={createStrategy} onDelete={deleteStrategy} userName={user.name||user.email} onLogout={logout} onLangToggle={toggleLang} lang={lang} loading={stratLoading} />;

  const navItems = [
    { key: "dashboard", icon: "📊", label: isAr ? "لوحة القيادة" : "Dashboard" },
    { key: "staircase", icon: "🪜", label: isAr ? "السلم" : "Staircase" },
    { key: "ai", icon: "🤖", label: isAr ? "المستشار" : "AI Advisor" },
    { key: "alerts", icon: "🔔", label: isAr ? "تنبيهات" : "Alerts" },
    { key: "knowledge", icon: "📖", label: isAr ? "المعرفة" : "Knowledge" },
  ];

  return (
    <div className="min-h-screen text-white" dir={isAr ? "rtl" : "ltr"} style={{ background: `linear-gradient(180deg, ${DEEP} 0%, #0f1f3a 50%, ${DEEP} 100%)`, fontFamily: isAr ? "'Noto Kufi Arabic', sans-serif" : "'DM Sans', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-3">
          <button onClick={() => { setActiveStrat(null); if (stratApiRef.current) stratApiRef.current.setActive(null); }} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 transition group" title="Back to Strategies">
            <span className="text-lg group-hover:-translate-x-0.5 transition-transform">←</span>
            <span className="text-xl font-bold" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "'Instrument Serif', Georgia, serif" }}>ST.AIRS</span>
          </button>
          <span className="text-[10px] text-gray-600 uppercase tracking-widest">v3.5.2</span>
          <span className="text-gray-600">|</span>
          <span className="text-sm text-white font-medium">{activeStrat.icon} {isAr && activeStrat.name_ar ? activeStrat.name_ar : activeStrat.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleLang} className="text-xs text-gray-500 hover:text-amber-400 transition">{isAr ? "EN" : "عربي"}</button>
          <button onClick={logout} className="text-xs text-gray-600 hover:text-gray-300 transition">{user.name || user.email} ↗</button>
        </div>
      </header>

      {/* Nav */}
      <nav className="flex items-center gap-1 px-6 py-2 overflow-x-auto" style={{ borderBottom: `1px solid ${BORDER}` }}>
        {navItems.map(n => (
          <button key={n.key} onClick={() => setView(n.key)}
            className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${view === n.key ? "bg-amber-500/15 text-amber-300 border border-amber-500/20" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
            {n.icon} {n.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-6">
        {view === "dashboard" && <DashboardView data={dashData} lang={lang} />}
        {view === "staircase" && <StaircaseView tree={stairTree} lang={lang} onEdit={s => { setEditStair(s); setShowEditor(true); }} onAdd={() => { setEditStair(null); setShowEditor(true); }} onExport={exportPDF} onMove={moveStair} strategyContext={activeStrat} />}
        {view === "ai" && <AIChatView lang={lang} userId={user.id || user.email} strategyContext={activeStrat} />}
        {view === "alerts" && <AlertsView alerts={alerts} lang={lang} />}
        {view === "knowledge" && <KnowledgeLibrary lang={lang} />}
      </main>

      {/* Stair Editor Modal */}
      <StairEditor open={showEditor} onClose={() => { setShowEditor(false); setEditStair(null); }} stair={editStair} allStairs={stairTree} onSave={saveStair} onDelete={deleteStair} lang={lang} />

      {/* Footer */}
      <footer className="text-center py-6 text-gray-700 text-[10px] tracking-widest uppercase">By DEVONEERS • ST.AIRS v3.5.2 • "Human IS the Loop" • {new Date().getFullYear()}</footer>
    </div>
  );
}
