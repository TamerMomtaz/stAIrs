import { useState, useEffect, useCallback, useRef, useMemo } from "react";

const API = "https://stairs-production.up.railway.app";

// â•â•â• DESIGN CONSTANTS â•â•â•
const GOLD = "#B8904A";
const GOLD_L = "#e8b94a";
const TEAL = "#2A5C5C";
const CHAMPAGNE = "#F7E7CE";
const DEEP = "#0a1628";
const BORDER = "rgba(30, 58, 95, 0.5)";

const typeColors = { vision: GOLD, objective: "#60a5fa", key_result: "#34d399", initiative: "#a78bfa", task: "#94a3b8" };
const typeIcons = { vision: "◆", objective: "▣", key_result: "◎", initiative: "▶", task: "•" };
const typeLabels = { vision: "Vision", objective: "Objective", key_result: "Key Result", initiative: "Initiative", task: "Task" };
const typeLabelsAr = { vision: "الرؤية", objective: "الهدف", key_result: "نتيجة رئيسية", initiative: "مبادرة", task: "مهمة" };
const glass = (op = 0.6) => ({ background: `rgba(22, 37, 68, ${op})`, border: `1px solid ${BORDER}` });
const inputCls = "w-full px-3 py-2.5 rounded-lg bg-[#0a1628]/80 border border-[#1e3a5f] text-white placeholder-gray-600 focus:border-amber-500/40 focus:outline-none transition text-sm";
const labelCls = "text-gray-400 text-xs uppercase tracking-wider mb-1.5 block";

// â•â•â• SIMPLE MARKDOWN RENDERER â•â•â•
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
      // Inline bold
      const parts = line.split(/\*\*(.*?)\*\*/g);
      elements.push(<p key={i} className="text-gray-300 my-0.5">{parts.map((p, j) => j % 2 === 1 ? <strong key={j} className="text-white">{p}</strong> : p)}</p>);
    }
  }
  return <div>{elements}</div>;
};

// â•â•â• API CLIENT â•â•â•
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

// â•â•â• CONVERSATION STORE â•â•â•
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

// â•â•â• STRATEGY STORE â•â•â•
class StratStore {
  constructor(uid) { this.k = `stairs_s_${uid}`; }
  list() { try { return JSON.parse(localStorage.getItem(this.k) || "[]"); } catch { return []; } }
  _save(l) { localStorage.setItem(this.k, JSON.stringify(l)); }
  add(s) { const l = this.list(); l.push(s); this._save(l); return s; }
  remove(id) { this._save(this.list().filter(s => s.id !== id)); localStorage.removeItem(`stairs_el_${id}`); }
  update(id, u) { const l = this.list(); const i = l.findIndex(s => s.id === id); if (i >= 0) l[i] = { ...l[i], ...u, updated_at: new Date().toISOString() }; this._save(l); }
  activeId() { return localStorage.getItem(`${this.k}_a`) || null; }
  setActive(id) { if (id) localStorage.setItem(`${this.k}_a`, id); else localStorage.removeItem(`${this.k}_a`); }
  ensureDefaults() {
    if (this.list().length === 0) {
      this.add({ id: "rootrise", name: "RootRise Vision 2026", description: "DEVONEERS strategic roadmap — MENA AI market leadership", company: "DEVONEERS / RootRise", icon: "🌱", color: GOLD, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), source: "server" });
      this.setActive("rootrise");
    }
  }
}

// â•â•â• SHARED COMPONENTS â•â•â•
const HealthBadge = ({ health, size = "sm" }) => {
  const c = { on_track: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", at_risk: "bg-amber-500/20 text-amber-300 border-amber-500/30", off_track: "bg-red-500/20 text-red-300 border-red-500/30", achieved: "bg-blue-500/20 text-blue-300 border-blue-500/30" };
  const d = { on_track: "â—", at_risk: "â—", off_track: "○", achieved: "★" };
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className={`relative z-10 w-full ${wide ? "max-w-4xl" : "max-w-lg"} max-h-[88vh] flex flex-col rounded-2xl overflow-hidden`}
        style={{ background: "rgba(15, 25, 50, 0.97)", border: `1px solid ${GOLD}33` }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${GOLD}22` }}>
          <h2 className="text-white font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition text-xl leading-none p-1">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
};

// â•â•â• LOGIN â•â•â•
const LoginScreen = ({ onLogin, lang }) => {
  const [email, setEmail] = useState(""); const [pass, setPass] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await api.login(email, pass); onLogin(api.user); } catch { setErr("Invalid credentials"); }
    setBusy(false);
  };
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${DEEP} 0%, #162544 40%, #1a3055 70%, #0f1f3a 100%)` }}>
      <form onSubmit={go} className="relative z-10 w-full max-w-md p-8 rounded-2xl backdrop-blur-xl" style={{ background: "rgba(22, 37, 68, 0.8)", border: `1px solid ${GOLD}33` }}>
        <div className="text-center mb-8">
          <div className="text-5xl font-bold tracking-tight mb-1" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L}, ${CHAMPAGNE})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "'Instrument Serif', Georgia, serif" }}>ST.AIRS</div>
          <div className="text-gray-400 text-sm tracking-widest uppercase mt-1">Strategic Staircase</div>
          <div className="w-12 h-0.5 mx-auto mt-3" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        </div>
        <div className="space-y-4">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required className={inputCls} />
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Password" required className={inputCls} />
        </div>
        {err && <div className="mt-3 text-red-400 text-sm text-center">{err}</div>}
        <button type="submit" disabled={busy} className="w-full mt-6 py-3 rounded-lg font-semibold text-[#0a1628] transition-all hover:scale-[1.02] disabled:opacity-50" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` }}>{busy ? "..." : "Sign In"}</button>
        <div className="text-center mt-6 text-gray-600 text-xs">By DEVONEERS</div>
      </form>
    </div>
  );
};

// â•â•â• STRATEGY LANDING PAGE â•â•â•
const StrategyLanding = ({ strategies, onSelect, onCreate, onDelete, userName, onLogout, onLangToggle, lang }) => {
  const [showWizard, setShowWizard] = useState(false);
  return (
    <div className="min-h-screen text-white" style={{ background: `linear-gradient(180deg, ${DEEP} 0%, #0f1f3a 50%, ${DEEP} 100%)`, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "'Instrument Serif', Georgia, serif" }}>ST.AIRS</span>
          <span className="text-[10px] text-gray-600 uppercase tracking-widest">v3.4</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onLangToggle} className="text-xs text-gray-500 hover:text-amber-400 transition">{lang === "en" ? "عربي" : "EN"}</button>
          <button onClick={onLogout} className="text-xs text-gray-600 hover:text-gray-300 transition">{userName} ↗</button>
        </div>
      </header>
      <div className="max-w-4xl mx-auto px-6 pt-12 pb-8 text-center">
        <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>Your Strategies</h1>
        <p className="text-gray-500 text-sm max-w-lg mx-auto">Each strategy is an independent staircase for a company, product, or project. The AI advisor knows the context of whichever strategy you're working in.</p>
      </div>
      <div className="max-w-4xl mx-auto px-6 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Create new */}
          <button onClick={() => setShowWizard(true)}
            className="group p-6 rounded-2xl border-2 border-dashed border-[#1e3a5f] hover:border-amber-500/40 transition-all hover:scale-[1.02] min-h-[200px] flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-all group-hover:scale-110" style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}30` }}>+</div>
            <div className="text-center">
              <div className="text-white font-medium text-sm">Create New Strategy</div>
              <div className="text-gray-600 text-xs mt-1">AI will help you build the staircase</div>
            </div>
          </button>
          {/* Cards */}
          {strategies.map(s => (
            <div key={s.id} className="group relative p-6 rounded-2xl transition-all hover:scale-[1.02] cursor-pointer min-h-[200px] flex flex-col"
              style={{ ...glass(0.5), borderColor: `${s.color || GOLD}30` }} onClick={() => onSelect(s)}>
              {s.source !== "server" && (
                <button onClick={e => { e.stopPropagation(); onDelete(s.id); }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 text-xs transition p-1.5 rounded-lg hover:bg-red-500/10">✕</button>
              )}
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl mb-4" style={{ background: `${s.color || GOLD}20`, border: `1px solid ${s.color || GOLD}30` }}>{s.icon || "🎯"}</div>
              <div className="flex-1">
                <div className="text-white font-semibold text-base mb-1">{s.name}</div>
                <div className="text-gray-500 text-xs mb-2">{s.company}</div>
                {s.description && <div className="text-gray-600 text-xs leading-relaxed line-clamp-2">{s.description}</div>}
              </div>
              <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
                <div className="text-gray-600 text-[10px]">{new Date(s.updated_at).toLocaleDateString()}</div>
                <div className="text-xs font-medium" style={{ color: s.color || GOLD }}>
                  {s.source === "server" ? "â— Connected" : "â— Draft"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* AI Strategy Wizard */}
      <StrategyWizard open={showWizard} onClose={() => setShowWizard(false)} onCreate={onCreate} />
      <footer className="text-center py-8 text-gray-700 text-[10px] tracking-widest uppercase">By DEVONEERS • ST.AIRS v3.4 • {new Date().getFullYear()}</footer>
    </div>
  );
};

// â•â•â• AI STRATEGY WIZARD — Conversational strategy builder â•â•â•
const StrategyWizard = ({ open, onClose, onCreate }) => {
  const [step, setStep] = useState(0); // 0=info, 1=ai-chat, 2=review
  const [info, setInfo] = useState({ name: "", company: "", industry: "", description: "", icon: "🎯", color: GOLD });
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [generatedElements, setGeneratedElements] = useState([]);
  const endRef = useRef(null);

  const iconOpts = ["🎯", "🌱", "🚀", "🗝️", "💡", "🏭", "📊", "🌍", "⚡", "🔬", "🛡️", "🌐"];
  const colorOpts = [GOLD, TEAL, "#60a5fa", "#a78bfa", "#f87171", "#34d399", "#fbbf24", "#ec4899"];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [aiMessages]);

  const startAISession = () => {
    if (!info.name.trim()) return;
    setStep(1);
    const welcome = {
      role: "ai", text: `Great! Let's build the strategy for **${info.company || info.name}**.\n\nTell me about the business goals, challenges, and what you want to achieve. I'll generate a complete strategic staircase from Vision down to Initiatives.\n\nFor example, you could say:\n- "We want to expand our automated business solutions across the MENA region"\n- "Our goal is to achieve $5M ARR by 2027 through SaaS products"\n- "We need to digitize our manufacturing processes"`,
    };
    setAiMessages([welcome]);
  };

  const sendToAI = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const msg = aiInput.trim(); setAiInput("");
    setAiMessages(prev => [...prev, { role: "user", text: msg }]);
    setAiLoading(true);
    try {
      // Send to AI with strategy context
      const contextMessage = `[CONTEXT: The user is creating a new strategy called "${info.name}" for "${info.company || info.name}" in the ${info.industry || "unspecified"} industry. ${info.description ? `Description: ${info.description}.` : ""} Please help them build their strategic staircase. When you have enough information, generate a structured strategy with Vision, Objectives, Key Results, and Initiatives. Format each element clearly.]\n\nUser message: ${msg}`;
      const res = await api.post("/api/v1/ai/chat", { message: contextMessage });
      setAiMessages(prev => [...prev, { role: "ai", text: res.response, tokens: res.tokens_used }]);

      // Try to extract strategy elements from the response
      const extracted = extractElements(res.response);
      if (extracted.length > 0) {
        setGeneratedElements(prev => [...prev, ...extracted]);
      }
    } catch (e) {
      setAiMessages(prev => [...prev, { role: "ai", text: `⚠️ ${e.message}`, error: true }]);
    }
    setAiLoading(false);
  };

  // Smart element extraction — builds hierarchy using numbering
  // [Objective 1] → [KR 1.1] means KR is child of Objective 1
  const extractElements = (text) => {
    const elements = [];
    const lines = text.split("\n");
    for (const line of lines) {
      const clean = line.replace(/\*\*/g, "").replace(/^[-–•]\s*/, "").trim();
      if (!clean) continue;
      // Vision
      const v = clean.match(/\[?Vision\]?\s*[:–-]\s*(.+)/i);
      if (v) { elements.push({ element_type: "vision", title: v[1].trim(), _num: "V" }); continue; }
      // Objective N
      const o = clean.match(/\[?Objective\s*(\d+)\]?\s*[:–-]\s*(.+)/i);
      if (o) { elements.push({ element_type: "objective", title: o[2].trim(), _num: o[1] }); continue; }
      // KR N.M or Key Result N.M
      const k = clean.match(/\[?(?:Key Result|KR)\s*(\d+)\.?(\d*)\]?\s*[:–-]\s*(.+)/i);
      if (k) { elements.push({ element_type: "key_result", title: k[3].trim(), _num: `${k[1]}.${k[2] || "0"}`, _parentNum: k[1] }); continue; }
      // Initiative N.M
      const i2 = clean.match(/\[?Initiative\s*(\d+)\.?(\d*)\]?\s*[:–-]\s*(.+)/i);
      if (i2) { elements.push({ element_type: "initiative", title: i2[3].trim(), _num: `I${i2[1]}.${i2[2] || "0"}`, _parentNum: i2[1] }); continue; }
      // Task N.M
      const t = clean.match(/\[?Task\s*(\d+)\.?(\d*)\]?\s*[:–-]\s*(.+)/i);
      if (t) { elements.push({ element_type: "task", title: t[3].trim(), _num: `T${t[1]}.${t[2] || "0"}`, _parentNum: t[1] }); continue; }
    }
    return elements;
  };

  const askForStrategy = () => {
    const prompt = `Based on everything we've discussed, please generate a complete strategic staircase for ${info.company || info.name}. Format it exactly like this:\n\n[Vision]: The main vision statement\n[Objective 1]: First objective\n[KR 1.1]: Key result for objective 1\n[KR 1.2]: Another key result\n[Initiative 1.1]: Initiative supporting KR 1.1\n[Objective 2]: Second objective\n...and so on.\n\nMake it specific to our discussion, not generic.`;
    setAiInput(prompt);
  };

  const finishWizard = () => {
    const strat = {
      id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: info.name, company: info.company || info.name,
      description: info.description, icon: info.icon, color: info.color,
      industry: info.industry,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      source: "local",
    };
    // Build elements with proper parent-child wiring
    if (generatedElements.length > 0) {
      const codePrefix = { vision: "VIS", objective: "OBJ", key_result: "KR", initiative: "INI", task: "TSK" };
      // First pass: assign IDs
      const els = generatedElements.map((el, i) => ({
        ...el, id: `el_${Date.now()}_${i}`,
        code: `${codePrefix[el.element_type] || "EL"}-${String(i + 1).padStart(3, "0")}`,
        health: "on_track", progress_percent: 0, parent_id: null,
      }));
      // Second pass: wire parent_id using _num/_parentNum
      // Vision is root. Objectives are children of Vision.
      // KRs with _parentNum "1" are children of Objective with _num "1", etc.
      const visionId = els.find(e => e.element_type === "vision")?.id;
      const objMap = {}; // _num → id
      els.forEach(el => {
        if (el.element_type === "objective") {
          el.parent_id = visionId || null;
          objMap[el._num] = el.id;
        }
      });
      els.forEach(el => {
        if (el.element_type === "key_result" || el.element_type === "initiative" || el.element_type === "task") {
          // Find the parent objective by _parentNum
          if (el._parentNum && objMap[el._parentNum]) {
            el.parent_id = objMap[el._parentNum];
          } else if (visionId) {
            // Fallback: attach to last objective or vision
            const lastObj = [...els].reverse().find(e => e.element_type === "objective");
            el.parent_id = lastObj?.id || visionId;
          }
        }
      });
      // Clean up internal fields
      els.forEach(el => { delete el._num; delete el._parentNum; });
      localStorage.setItem(`stairs_el_${strat.id}`, JSON.stringify(els));
    }
    onCreate(strat);
    setStep(0); setInfo({ name: "", company: "", industry: "", description: "", icon: "🎯", color: GOLD });
    setAiMessages([]); setGeneratedElements([]);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={step === 0 ? "New Strategy" : step === 1 ? "AI Strategy Builder" : "Review & Create"} wide={step > 0}>
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Strategy Name *</label>
            <input value={info.name} onChange={e => setInfo(f => ({ ...f, name: e.target.value }))} placeholder="e.g., TIO Growth Plan 2026" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Company / Product</label>
            <input value={info.company} onChange={e => setInfo(f => ({ ...f, company: e.target.value }))} placeholder="e.g., TIO Technologies" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Industry</label>
            <input value={info.industry} onChange={e => setInfo(f => ({ ...f, industry: e.target.value }))} placeholder="e.g., Business Automation, SaaS" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Brief Description</label>
            <textarea value={info.description} onChange={e => setInfo(f => ({ ...f, description: e.target.value }))} placeholder="What does this company/product do? What's the strategic context?" rows={2} className={`${inputCls} resize-none`} />
          </div>
          <div className="flex gap-6">
            <div>
              <label className={labelCls}>Icon</label>
              <div className="flex flex-wrap gap-1.5">
                {iconOpts.map(ic => (
                  <button key={ic} onClick={() => setInfo(f => ({ ...f, icon: ic }))} className={`w-9 h-9 rounded-lg text-base flex items-center justify-center transition ${info.icon === ic ? "bg-amber-500/20 border border-amber-500/40 scale-110" : "bg-[#0a1628]/60 border border-[#1e3a5f]"}`}>{ic}</button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Color</label>
              <div className="flex flex-wrap gap-1.5">
                {colorOpts.map(c => (
                  <button key={c} onClick={() => setInfo(f => ({ ...f, color: c }))} className={`w-7 h-7 rounded-full transition ${info.color === c ? "scale-125 ring-2 ring-white/30" : "hover:scale-110"}`} style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">Cancel</button>
            <button onClick={startAISession} disabled={!info.name.trim()}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-[#0a1628] disabled:opacity-40 transition-all hover:scale-[1.02]"
              style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` }}>
              Next → Build with AI
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col h-[60vh]">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 pb-4">
            {aiMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed ${
                  m.role === "user" ? "bg-amber-500/20 text-amber-100 rounded-br-md"
                  : m.error ? "bg-red-500/10 text-red-300 rounded-bl-md border border-red-500/20"
                  : "bg-[#162544] text-gray-200 rounded-bl-md border border-[#1e3a5f]"
                }`}>
                  {m.role === "ai" ? <Markdown text={m.text} /> : <div className="whitespace-pre-wrap">{m.text}</div>}
                </div>
              </div>
            ))}
            {aiLoading && <div className="flex gap-1 px-4 py-2">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-amber-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>}
            <div ref={endRef} />
          </div>

          {/* Extracted elements indicator */}
          {generatedElements.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg" style={glass(0.3)}>
              <span className="text-amber-400 text-xs">✓ {generatedElements.length} elements captured</span>
              <div className="flex-1" />
              <button onClick={() => setStep(2)} className="text-xs px-3 py-1 rounded-md bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition">
                Review & Create →
              </button>
            </div>
          )}

          {/* Quick actions */}
          {aiMessages.length >= 3 && generatedElements.length === 0 && (
            <div className="mb-2">
              <button onClick={askForStrategy}
                className="text-xs px-3 py-1.5 rounded-full border border-amber-500/30 text-amber-400/80 hover:bg-amber-500/10 transition">
                ✨ Ask AI to generate the staircase now
              </button>
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2">
            <input value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendToAI()}
              placeholder="Describe your business goals..." disabled={aiLoading}
              className="flex-1 px-4 py-3 rounded-xl bg-[#0a1628]/60 border border-[#1e3a5f] text-white placeholder-gray-600 focus:border-amber-500/40 focus:outline-none transition text-sm" />
            <button onClick={sendToAI} disabled={aiLoading || !aiInput.trim()}
              className="px-5 py-3 rounded-xl font-medium text-sm disabled:opacity-30 transition-all hover:scale-105"
              style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, color: DEEP }}>Send</button>
          </div>

          {/* Skip option */}
          <div className="flex justify-between mt-3">
            <button onClick={() => setStep(0)} className="text-xs text-gray-500 hover:text-gray-300 transition">â† Back</button>
            <button onClick={() => { setStep(2); }}
              className="text-xs text-gray-500 hover:text-gray-300 transition">
              Skip AI → Create empty strategy
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-xl" style={glass(0.4)}>
            <span className="text-2xl">{info.icon}</span>
            <div>
              <div className="text-white font-semibold">{info.name}</div>
              <div className="text-gray-500 text-xs">{info.company} {info.industry ? `· ${info.industry}` : ""}</div>
            </div>
          </div>
          {generatedElements.length > 0 ? (
            <div>
              <label className={labelCls}>{generatedElements.length} elements will be created:</label>
              <div className="max-h-60 overflow-y-auto space-y-1 p-3 rounded-lg" style={glass(0.3)}>
                {generatedElements.map((el, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded" style={{ borderLeft: `2px solid ${typeColors[el.element_type] || "#94a3b8"}` }}>
                    <span style={{ color: typeColors[el.element_type], fontSize: 12 }}>{typeIcons[el.element_type]}</span>
                    <span className="text-[10px] text-gray-500 uppercase w-16 shrink-0">{el.element_type.replace("_", " ")}</span>
                    <span className="text-sm text-gray-200 truncate">{el.title}</span>
                    <button onClick={() => setGeneratedElements(prev => prev.filter((_, j) => j !== i))}
                      className="ml-auto text-gray-600 hover:text-red-400 text-xs shrink-0">✕</button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-sm text-center py-6">No elements generated. You can add them manually after creation.</div>
          )}
          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
            <button onClick={() => setStep(1)} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">â† Back to AI</button>
            <button onClick={finishWizard}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-[#0a1628] transition-all hover:scale-[1.02]"
              style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` }}>
              Create Strategy {generatedElements.length > 0 ? `(${generatedElements.length} elements)` : ""}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

// â•â•â• STAIR EDITOR â•â•â•
const StairEditor = ({ open, onClose, stair, allStairs, onSave, onDelete, lang }) => {
  const isNew = !stair?.id;
  const [form, setForm] = useState({ title: "", title_ar: "", description: "", element_type: "objective", health: "on_track", progress_percent: 0, parent_id: null, code: "" });
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const labels = lang === "ar" ? typeLabelsAr : typeLabels;

  useEffect(() => {
    if (stair) setForm({ title: stair.title || "", title_ar: stair.title_ar || "", description: stair.description || "", element_type: stair.element_type || "objective", health: stair.health || "on_track", progress_percent: stair.progress_percent || 0, parent_id: stair.parent_id || null, code: stair.code || "" });
    else setForm({ title: "", title_ar: "", description: "", element_type: "objective", health: "on_track", progress_percent: 0, parent_id: null, code: "" });
    setConfirmDel(false);
  }, [stair, open]);

  const parentOpts = useMemo(() => {
    const flat = []; const walk = (nodes, d = 0) => { nodes.forEach(n => { if (!stair || n.stair.id !== stair.id) flat.push({ id: n.stair.id, label: `${"  ".repeat(d)}${n.stair.code || ""} ${n.stair.title}` }); if (n.children) walk(n.children, d + 1); }); }; walk(allStairs || []); return flat;
  }, [allStairs, stair]);

  const doSave = async () => { if (!form.title.trim()) return; setSaving(true); try { await onSave(form, stair?.id); onClose(); } catch (e) { alert(e.message); } setSaving(false); };
  const doDel = async () => { if (!confirmDel) { setConfirmDel(true); return; } setSaving(true); try { await onDelete(stair.id); onClose(); } catch (e) { alert(e.message); } setSaving(false); };

  return (
    <Modal open={open} onClose={onClose} title={isNew ? "Add Element" : "Edit Element"}>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Type</label>
          <div className="flex gap-2 flex-wrap">
            {Object.keys(typeColors).map(tp => (
              <button key={tp} onClick={() => setForm(f => ({ ...f, element_type: tp }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${form.element_type === tp ? "border-amber-500/40 bg-amber-500/15 text-amber-300" : "border-[#1e3a5f] text-gray-500"}`}>
                <span style={{ color: typeColors[tp] }}>{typeIcons[tp]}</span> {labels[tp]}
              </button>
            ))}
          </div>
        </div>
        <div><label className={labelCls}>Code</label><input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="OBJ-001" className={inputCls} /></div>
        <div><label className={labelCls}>Title</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputCls} /></div>
        <div><label className={labelCls}>Title (Arabic)</label><input value={form.title_ar} onChange={e => setForm(f => ({ ...f, title_ar: e.target.value }))} className={inputCls} dir="rtl" /></div>
        <div><label className={labelCls}>Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className={`${inputCls} resize-none`} /></div>
        <div><label className={labelCls}>Parent</label>
          <select value={form.parent_id || ""} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value || null }))} className={inputCls}>
            <option value="">None (top level)</option>
            {parentOpts.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Health</label>
          <div className="flex gap-2 flex-wrap">
            {["on_track", "at_risk", "off_track", "achieved"].map(h => (
              <button key={h} onClick={() => setForm(f => ({ ...f, health: h }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${form.health === h ? (h === "on_track" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : h === "at_risk" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : h === "off_track" ? "bg-red-500/20 text-red-300 border-red-500/30" : "bg-blue-500/20 text-blue-300 border-blue-500/30") : "border-[#1e3a5f] text-gray-500"}`}>
                {h.replace("_", " ").toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div><label className={labelCls}>Progress: {form.progress_percent}%</label><input type="range" min={0} max={100} value={form.progress_percent} onChange={e => setForm(f => ({ ...f, progress_percent: +e.target.value }))} className="w-full accent-amber-500" /></div>
        <div className="flex items-center gap-3 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
          {!isNew && <button onClick={doDel} className={`px-4 py-2 rounded-lg text-sm transition ${confirmDel ? "bg-red-500/30 text-red-200 border border-red-500/50" : "text-red-400/60 hover:text-red-300"}`}>{confirmDel ? "Confirm?" : "Delete"}</button>}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">Cancel</button>
          <button onClick={doSave} disabled={saving || !form.title.trim()} className="px-5 py-2 rounded-lg text-sm font-semibold text-[#0a1628] disabled:opacity-40 transition-all hover:scale-[1.02]" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` }}>{saving ? "..." : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
};

// â•â•â• VIEWS â•â•â•
const DashboardView = ({ data, lang }) => {
  const s = data?.stats || {};
  const stats = [
    { label: "Total Elements", value: s.total_elements || 0, color: "#60a5fa" },
    { label: "On Track", value: s.on_track || 0, color: "#34d399" },
    { label: "At Risk", value: s.at_risk || 0, color: "#fbbf24" },
    { label: "Off Track", value: s.off_track || 0, color: "#f87171" },
  ];
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6 p-6 rounded-2xl" style={glass()}><ProgressRing percent={s.overall_progress || 0} size={120} stroke={8} /><div><div className="text-gray-400 text-sm">Overall Progress</div><div className="text-3xl font-bold text-white">{Math.round(s.overall_progress || 0)}%</div></div></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{stats.map((st, i) => <div key={i} className="p-4 rounded-xl text-center" style={{ ...glass(0.5), borderColor: `${st.color}22` }}><div className="text-3xl font-bold" style={{ color: st.color }}>{st.value}</div><div className="text-gray-400 text-xs mt-1">{st.label}</div></div>)}</div>
      {data?.top_risks?.length > 0 && <div><h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">Top Risks</h3><div className="space-y-2">{data.top_risks.map((r, i) => <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={glass(0.4)}><div className="text-xs font-mono text-amber-400/80 w-16 shrink-0">{r.code}</div><div className="flex-1 text-white text-sm truncate">{r.title}</div><HealthBadge health={r.health} /><div className="text-white text-sm w-12 text-right">{r.progress_percent}%</div></div>)}</div></div>}
    </div>
  );
};

const StaircaseView = ({ tree, lang, onEdit, onAdd, onExport, onMove, strategyContext }) => {
  const [expanded, setExpanded] = useState(null); // stair id
  const [aiAction, setAiAction] = useState(null); // { id, type: "explain"|"enhance" }
  const [aiResult, setAiResult] = useState({}); // { [stairId]: { explain, enhance } }
  const [aiLoading, setAiLoading] = useState(false);

  const handleAI = async (stair, action) => {
    setAiAction({ id: stair.id, type: action });
    setAiLoading(true);
    try {
      const contextPrefix = strategyContext && strategyContext.source !== "server"
        ? `[Strategy: "${strategyContext.name}" for "${strategyContext.company}". Industry: ${strategyContext.industry || "unspecified"}. ${strategyContext.description || ""}]\n\n`
        : "";
      const prompt = action === "explain"
        ? `${contextPrefix}Explain this strategic element in detail:\n- Type: ${stair.element_type}\n- Title: ${stair.title}\n- Code: ${stair.code || "N/A"}\n- Current health: ${stair.health}\n- Progress: ${stair.progress_percent}%\n${stair.description ? `- Description: ${stair.description}` : ""}\n\nExplain what this element means in the strategic context, why it matters, what success looks like, and what risks to watch for. Be specific to this organization, not generic.`
        : `${contextPrefix}Enhance this strategic element with actionable recommendations:\n- Type: ${stair.element_type}\n- Title: ${stair.title}\n- Code: ${stair.code || "N/A"}\n- Current health: ${stair.health}\n- Progress: ${stair.progress_percent}%\n${stair.description ? `- Description: ${stair.description}` : ""}\n\nSuggest: 1) How to improve this element's definition, 2) What KPIs or metrics to track, 3) Specific next actions, 4) Potential sub-elements (Key Results or Initiatives) that could be added beneath it. Be specific and actionable.`;
      const res = await api.post("/api/v1/ai/chat", { message: prompt });
      setAiResult(prev => ({
        ...prev,
        [stair.id]: { ...prev[stair.id], [action]: res.response }
      }));
    } catch (e) {
      setAiResult(prev => ({
        ...prev,
        [stair.id]: { ...prev[stair.id], [action]: `⚠️ Error: ${e.message}` }
      }));
    }
    setAiLoading(false);
    setAiAction(null);
  };

  const toggleExpand = (id) => {
    setExpanded(prev => prev === id ? null : id);
  };

  const renderStair = (node, depth = 0, si = 0, sc = 1) => {
    const s = node.stair, color = typeColors[s.element_type] || "#94a3b8";
    const isExpanded = expanded === s.id;
    const result = aiResult[s.id];
    const isLoadingThis = aiLoading && aiAction?.id === s.id;

    return (
      <div key={s.id} style={{ marginLeft: depth * 24 }}>
        {/* Main row */}
        <div className={`group rounded-xl my-1.5 transition-all ${isExpanded ? "ring-1" : ""}`}
          style={{ borderLeft: `3px solid ${color}`, ...(isExpanded ? { ringColor: `${color}40`, background: "rgba(22, 37, 68, 0.4)" } : {}) }}>

          <div className="flex items-center gap-2 p-3 cursor-pointer hover:bg-white/[0.03] rounded-xl transition" onClick={() => toggleExpand(s.id)}>
            {/* Move arrows */}
            <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
              <button onClick={e => { e.stopPropagation(); onMove(s.id, "up"); }} disabled={si === 0} className="text-gray-600 hover:text-white text-[10px] disabled:opacity-20 p-0.5">▲</button>
              <button onClick={e => { e.stopPropagation(); onMove(s.id, "down"); }} disabled={si >= sc - 1} className="text-gray-600 hover:text-white text-[10px] disabled:opacity-20 p-0.5">▼</button>
            </div>

            {/* Expand indicator */}
            <span className={`text-gray-600 text-[10px] transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>

            {/* Element info */}
            <span style={{ color, fontSize: 16 }}>{typeIcons[s.element_type] || "•"}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono opacity-40" style={{ color }}>{s.code}</span>
                <span className="text-white text-sm font-medium truncate">{lang === "ar" && s.title_ar ? s.title_ar : s.title}</span>
              </div>
              {s.description && !isExpanded && <div className="text-gray-600 text-xs mt-0.5 truncate max-w-md">{s.description}</div>}
            </div>
            <HealthBadge health={s.health} />
            <div className="w-14 text-right shrink-0">
              <div className="text-xs font-medium" style={{ color }}>{s.progress_percent}%</div>
              <div className="h-1 rounded-full bg-[#1e3a5f] mt-0.5 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${s.progress_percent}%`, background: color, transition: "width 0.6s ease" }} />
              </div>
            </div>
          </div>

          {/* Expanded panel */}
          {isExpanded && (
            <div className="px-4 pb-4 pt-1 space-y-3" style={{ borderTop: `1px solid ${color}15` }}>
              {/* Description */}
              {s.description && <div className="text-gray-400 text-sm leading-relaxed">{s.description}</div>}

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={(e) => { e.stopPropagation(); handleAI(s, "explain"); }}
                  disabled={isLoadingThis}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:scale-[1.02]"
                  style={{ borderColor: `${TEAL}60`, color: "#5eead4", background: `${TEAL}20` }}>
                  {isLoadingThis && aiAction?.type === "explain" ? <span className="animate-spin">⟳</span> : "💡"} Explain
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleAI(s, "enhance"); }}
                  disabled={isLoadingThis}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:scale-[1.02]"
                  style={{ borderColor: `${GOLD}60`, color: GOLD, background: `${GOLD}15` }}>
                  {isLoadingThis && aiAction?.type === "enhance" ? <span className="animate-spin">⟳</span> : "✨"} Enhance
                </button>
                <button onClick={(e) => { e.stopPropagation(); onEdit(s); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#1e3a5f] text-gray-400 hover:text-white transition hover:bg-white/5">
                  ✎ Edit
                </button>
              </div>

              {/* AI loading indicator */}
              {isLoadingThis && (
                <div className="flex items-center gap-2 py-3">
                  <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-amber-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                  <span className="text-gray-500 text-xs">{aiAction?.type === "explain" ? "Analyzing..." : "Generating recommendations..."}</span>
                </div>
              )}

              {/* AI Explain result */}
              {result?.explain && (
                <div className="p-3 rounded-lg" style={{ background: `${TEAL}10`, border: `1px solid ${TEAL}25` }}>
                  <div className="flex items-center gap-2 mb-2"><span className="text-xs font-semibold text-teal-300 uppercase tracking-wider">💡 Explanation</span></div>
                  <div className="text-sm"><Markdown text={result.explain} /></div>
                </div>
              )}

              {/* AI Enhance result */}
              {result?.enhance && (
                <div className="p-3 rounded-lg" style={{ background: `${GOLD}08`, border: `1px solid ${GOLD}20` }}>
                  <div className="flex items-center gap-2 mb-2"><span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">✨ Enhancement</span></div>
                  <div className="text-sm"><Markdown text={result.enhance} /></div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Children */}
        {node.children?.map((ch, ci) => renderStair(ch, depth + 1, ci, node.children.length))}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]" style={{ background: `${GOLD}22`, border: `1px solid ${GOLD}33`, color: GOLD }}>+ Add Element</button>
        <div className="flex-1" />
        <button onClick={onExport} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white transition" style={{ border: `1px solid ${BORDER}` }}>↓ Export PDF</button>
      </div>
      {!tree?.length ? <div className="text-gray-500 text-center py-12">No elements yet. Add your first strategic element or use the AI Advisor to generate them.</div>
        : <div className="space-y-0.5">{tree.map((n, i) => renderStair(n, 0, i, tree.length))}</div>}
      <div className="text-center text-gray-600 text-xs mt-6 italic">Click any element to expand · 💡 Explain · ✨ Enhance · ✎ Edit · ▲▼ Reorder</div>
    </div>
  );
};

const AIChatView = ({ lang, userId, strategyContext }) => {
  const storeRef = useRef(null);
  if (!storeRef.current && userId) storeRef.current = new ConvStore(userId);
  const store = storeRef.current;
  const [convs, setConvs] = useState([]); const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]); const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false); const [showHist, setShowHist] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (!store) return; const cs = store.list(); setConvs(cs);
    const aid = store.activeId(); if (aid && cs.find(c => c.id === aid)) { setActiveId(aid); setMessages(store.msgs(aid)); }
    else if (cs.length > 0) { setActiveId(cs[0].id); setMessages(store.msgs(cs[0].id)); }
  }, [store]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const welcomeText = strategyContext
    ? `I'm the ST.AIRS Strategy Advisor for **${strategyContext.name}** (${strategyContext.company || ""}).\n\nI can analyze risks, suggest improvements, generate strategic elements, and help you refine your staircase. What would you like to work on?`
    : "Welcome! I'm the ST.AIRS Strategy Advisor. Ask me anything about your strategy.";
  const welc = () => ({ role: "ai", text: welcomeText, ts: new Date().toISOString() });

  const newChat = () => {
    if (!store) return; const c = store.create("New"); store.saveMsgs(c.id, [welc()]); store.setActive(c.id);
    setActiveId(c.id); setMessages([welc()]); setConvs(store.list());
  };
  const loadConv = (id) => { if (!store) return; store.setActive(id); setActiveId(id); setMessages(store.msgs(id)); setShowHist(false); };
  const delConv = (id) => {
    if (!store) return; store.remove(id); const rem = store.list(); setConvs(rem);
    if (id === activeId) { if (rem.length > 0) loadConv(rem[0].id); else { setActiveId(null); setMessages([]); } }
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim(); setInput("");
    let cid = activeId;
    if (!cid && store) { const c = store.create(msg.slice(0, 50)); store.saveMsgs(c.id, [welc()]); store.setActive(c.id); cid = c.id; setActiveId(c.id); setConvs(store.list()); setMessages([welc()]); }

    // Prepend strategy context to the message so the backend AI knows which strategy we're in
    let contextMsg = msg;
    if (strategyContext && strategyContext.source !== "server") {
      contextMsg = `[CONTEXT: Working on strategy "${strategyContext.name}" for "${strategyContext.company || strategyContext.name}"${strategyContext.industry ? `, industry: ${strategyContext.industry}` : ""}${strategyContext.description ? `. ${strategyContext.description}` : ""}. This is NOT the RootRise strategy — give advice specific to this company.]\n\n${msg}`;
    }

    const userMsg = { role: "user", text: msg, ts: new Date().toISOString() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs); if (store && cid) store.saveMsgs(cid, newMsgs);
    setLoading(true);
    try {
      const res = await api.post("/api/v1/ai/chat", { message: contextMsg });
      const aiMsg = { role: "ai", text: res.response, tokens: res.tokens_used, actions: res.actions, ts: new Date().toISOString() };
      const final = [...newMsgs, aiMsg]; setMessages(final);
      if (store && cid) {
        store.saveMsgs(cid, final);
        const conv = store.list().find(c => c.id === cid);
        if (conv) { if (conv.title === "New") conv.title = msg.slice(0, 60); conv.updated_at = new Date().toISOString(); conv.count = final.length; store.save(conv); setConvs(store.list()); }
      }
    } catch (e) {
      const err = { role: "ai", text: `⚠️ ${e.message}`, error: true, ts: new Date().toISOString() };
      const final = [...newMsgs, err]; setMessages(final); if (store && cid) store.saveMsgs(cid, final);
    }
    setLoading(false);
  };

  const quicks = ["What are the biggest risks?", "Suggest improvements", "Generate KRs for our objectives"];
  const activeConv = convs.find(c => c.id === activeId);

  return (
    <div className="flex h-[calc(100vh-180px)] gap-3">
      <div className={`${showHist ? "w-60 opacity-100" : "w-0 opacity-0 overflow-hidden"} transition-all duration-300 flex flex-col rounded-xl shrink-0`} style={glass(0.5)}>
        <div className="flex items-center justify-between px-3 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <span className="text-xs text-gray-400 uppercase tracking-wider">History</span>
          <button onClick={newChat} className="text-xs text-amber-400 hover:bg-amber-500/10 px-2 py-1 rounded transition">+ New</button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {convs.map(c => (
            <div key={c.id} className={`group px-3 py-2 mx-1 my-0.5 rounded-lg cursor-pointer transition ${c.id === activeId ? "bg-amber-500/10 border border-amber-500/20" : "hover:bg-white/5 border border-transparent"}`} onClick={() => loadConv(c.id)}>
              <div className="flex items-start justify-between gap-2"><div className="text-sm text-white truncate flex-1">{c.title}</div><button onClick={e => { e.stopPropagation(); delConv(c.id); }} className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 text-xs transition">✕</button></div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setShowHist(!showHist)} className={`p-2 rounded-lg transition ${showHist ? "bg-amber-500/15 text-amber-400" : "text-gray-500 hover:text-gray-300"}`}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="12" width="14" height="2" rx="1"/></svg>
          </button>
          {activeConv && <span className="text-sm text-gray-400 truncate">{activeConv.title}</span>}
          <div className="flex-1" />
          <button onClick={newChat} className="text-xs px-3 py-1.5 rounded-lg text-amber-400/70 border border-amber-500/20 hover:bg-amber-500/10 transition">+ New Chat</button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 pb-4 px-1">
          {messages.length === 0 && <div className="text-gray-600 text-center py-12 text-sm">Start a new conversation</div>}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed ${m.role === "user" ? "bg-amber-500/20 text-amber-100 rounded-br-md" : m.error ? "bg-red-500/10 text-red-300 rounded-bl-md border border-red-500/20" : "bg-[#162544] text-gray-200 rounded-bl-md border border-[#1e3a5f]"}`}>
                {m.role === "ai" ? <Markdown text={m.text} /> : <div className="whitespace-pre-wrap">{m.text}</div>}
                {m.tokens > 0 && <div className="text-[10px] text-gray-600 mt-2 text-right">{m.tokens} tokens</div>}
              </div>
            </div>
          ))}
          {loading && <div className="flex gap-1 px-4 py-2">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-amber-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>}
          <div ref={endRef} />
        </div>
        {messages.length <= 1 && <div className="flex flex-wrap gap-2 mb-3">{quicks.map((q, i) => <button key={i} onClick={() => setInput(q)} className="text-xs px-3 py-1.5 rounded-full border border-amber-500/20 text-amber-400/70 hover:bg-amber-500/10 transition">{q}</button>)}</div>}
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask the strategy AI..." disabled={loading} className="flex-1 px-4 py-3 rounded-xl bg-[#0a1628]/60 border border-[#1e3a5f] text-white placeholder-gray-600 focus:border-amber-500/40 focus:outline-none transition text-sm" />
          <button onClick={send} disabled={loading || !input.trim()} className="px-5 py-3 rounded-xl font-medium text-sm disabled:opacity-30 transition-all hover:scale-105" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, color: DEEP }}>Send</button>
        </div>
      </div>
    </div>
  );
};

const AlertsView = ({ alerts }) => {
  const sc = { critical: { bg: "rgba(248,113,113,0.1)", border: "#f8717130", icon: "🔴", text: "text-red-300" }, high: { bg: "rgba(251,191,36,0.1)", border: "#fbbf2430", icon: "🟡", text: "text-amber-300" }, medium: { bg: "rgba(96,165,250,0.1)", border: "#60a5fa30", icon: "🔵", text: "text-blue-300" }, info: { bg: "rgba(96,165,250,0.08)", border: "#60a5fa20", icon: "ℹ️", text: "text-blue-300" } };
  if (!alerts?.length) return <div className="text-gray-500 text-center py-12">No active alerts</div>;
  return <div className="space-y-3">{alerts.map((a, i) => { const s = sc[a.severity] || sc.info; return <div key={i} className="p-4 rounded-xl" style={{ background: s.bg, border: `1px solid ${s.border}` }}><div className="flex items-start gap-3"><span className="text-lg">{s.icon}</span><div className="flex-1"><div className={`font-medium text-sm ${s.text}`}>{a.title}</div><div className="text-gray-400 text-xs mt-1">{a.description}</div></div></div></div>; })}</div>;
};

// â•â•â• PDF EXPORT â•â•â•
const ExportPDF = ({ open, onClose, tree, dashboard, strategyName }) => {
  const [busy, setBusy] = useState(false);
  const flat = useMemo(() => { const f = []; const w = (ns, d = 0) => { ns?.forEach(n => { f.push({ ...n.stair, depth: d }); if (n.children) w(n.children, d + 1); }); }; w(tree); return f; }, [tree]);

  const generate = () => {
    setBusy(true);
    const s = dashboard?.stats || {};
    const hl = h => ({ on_track: "✓ On Track", at_risk: "⚠ At Risk", off_track: "✗ Off Track", achieved: "★ Achieved" }[h] || h);
    const hbg = h => ({ on_track: "#d1fae5", at_risk: "#fef3c7", off_track: "#fecaca", achieved: "#dbeafe" }[h] || "#f3f4f6");
    const hfg = h => ({ on_track: "#065f46", at_risk: "#92400e", off_track: "#991b1b", achieved: "#1e40af" }[h] || "#374151");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'DM Sans',sans-serif;color:#1a1a2e;padding:40px}.header{text-align:center;margin-bottom:32px;padding-bottom:24px;border-bottom:2px solid ${GOLD}}.header h1{font-size:28px;color:${GOLD};letter-spacing:2px}.header .sub{font-size:14px;color:#666}.header .date{font-size:11px;color:#999;margin-top:4px}.stats{display:flex;gap:16px;margin-bottom:28px}.sc{flex:1;text-align:center;padding:16px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0}.sc .v{font-size:24px;font-weight:700}.sc .l{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-top:4px}.st{font-size:12px;text-transform:uppercase;letter-spacing:2px;color:${GOLD};margin:24px 0 12px;font-weight:600}.el{display:flex;align-items:center;gap:12px;padding:10px 14px;margin:4px 0;border-radius:8px;border-left:3px solid #ccc;background:#fafbfc}.el .code{font-size:10px;font-family:monospace;color:#94a3b8;min-width:50px}.el .t{flex:1;font-size:13px;font-weight:500}.el .b{font-size:9px;padding:2px 8px;border-radius:10px;font-weight:600}.el .p{font-size:12px;font-weight:600;min-width:40px;text-align:right}.footer{text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8}@media print{body{padding:20px}}</style></head><body>
    <div class="header"><h1>ST.AIRS</h1><div class="sub">${strategyName || "Strategy Report"}</div><div class="date">${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} · Read-Only Export</div></div>
    <div class="stats"><div class="sc"><div class="v" style="color:#60a5fa">${s.total_elements || flat.length}</div><div class="l">Elements</div></div><div class="sc"><div class="v" style="color:#34d399">${s.on_track || 0}</div><div class="l">On Track</div></div><div class="sc"><div class="v" style="color:#fbbf24">${s.at_risk || 0}</div><div class="l">At Risk</div></div><div class="sc"><div class="v" style="color:#f87171">${s.off_track || 0}</div><div class="l">Off Track</div></div></div>
    <div class="st">Strategy Staircase</div>
    ${flat.map(el => `<div class="el" style="margin-left:${el.depth * 24}px;border-left-color:${typeColors[el.element_type] || "#94a3b8"}"><div class="code" style="color:${typeColors[el.element_type]}">${el.code || ""}</div><div class="t">${el.title}</div><div class="b" style="background:${hbg(el.health)};color:${hfg(el.health)}">${hl(el.health)}</div><div class="p" style="color:${typeColors[el.element_type]}">${el.progress_percent}%</div></div>`).join("")}
    <div class="footer">Generated by ST.AIRS · DEVONEERS · ${new Date().toISOString().split("T")[0]}<br/>Read-only strategy snapshot — "Human IS the Loop"</div></body></html>`;
    const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); setTimeout(() => { w.print(); setBusy(false); }, 800); }
    else { const b = new Blob([html], { type: "text/html" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `${(strategyName || "strategy").replace(/\s+/g, "_")}.html`; a.click(); URL.revokeObjectURL(u); setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Export Strategy as PDF">
      <div className="space-y-4">
        <p className="text-gray-400 text-sm">A print dialog will open — choose "Save as PDF" to download your strategy as a formatted document.</p>
        <div className="p-4 rounded-xl text-center" style={glass(0.3)}><div className="text-2xl font-bold mb-1" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "'Instrument Serif', Georgia, serif" }}>ST.AIRS</div><div className="text-gray-500 text-xs">{strategyName}</div><div className="text-gray-600 text-[10px] mt-1">{flat.length} elements</div></div>
        <div className="flex justify-end gap-3"><button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">Cancel</button><button onClick={generate} disabled={busy} className="px-5 py-2 rounded-lg text-sm font-semibold text-[#0a1628] disabled:opacity-40 transition-all hover:scale-[1.02]" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` }}>{busy ? "Generating..." : "↓ Download PDF"}</button></div>
      </div>
    </Modal>
  );
};

// â•â•â• MAIN APP â•â•â•
export default function StairsApp() {
  const [user, setUser] = useState(api.user);
  const [lang, setLang] = useState("en");
  const stratRef = useRef(null);
  const [strategies, setStrategies] = useState([]);
  const [activeSt, setActiveSt] = useState(null);
  const [view, setView] = useState("dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [tree, setTree] = useState([]); const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false); const [err, setErr] = useState(null);
  const [editStair, setEditStair] = useState(null); const [editorOpen, setEditorOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (user) {
      const s = new StratStore(user.id || user.email); s.ensureDefaults(); stratRef.current = s;
      setStrategies(s.list());
      const aid = s.activeId(); if (aid) { const st = s.list().find(x => x.id === aid); if (st) setActiveSt(st); }
    }
  }, [user]);

  const loadData = useCallback(async () => {
    if (!activeSt) return; setLoading(true); setErr(null);
    try {
      if (activeSt.source === "server") {
        const [d, t, a] = await Promise.all([api.get("/api/v1/dashboard"), api.get("/api/v1/stairs/tree"), api.get("/api/v1/alerts")]);
        setDashboard(d); setTree(t); setAlerts(a);
      } else {
        const els = JSON.parse(localStorage.getItem(`stairs_el_${activeSt.id}`) || "[]");
        const map = {}; els.forEach(e => { map[e.id] = { stair: e, children: [] }; });
        const roots = []; els.forEach(e => { if (e.parent_id && map[e.parent_id]) map[e.parent_id].children.push(map[e.id]); else roots.push(map[e.id]); });
        setTree(roots);
        const on = els.filter(e => e.health === "on_track").length, at = els.filter(e => e.health === "at_risk").length, off = els.filter(e => e.health === "off_track").length;
        const avg = els.length > 0 ? els.reduce((s, e) => s + (e.progress_percent || 0), 0) / els.length : 0;
        setDashboard({ stats: { total_elements: els.length, on_track: on, at_risk: at, off_track: off, overall_progress: avg, active_alerts: 0, critical_alerts: 0 }, top_risks: els.filter(e => e.health !== "on_track").slice(0, 5) });
        setAlerts([]);
      }
    } catch (e) { if (e.message === "Session expired") { setUser(null); return; } setErr(e.message); }
    setLoading(false);
  }, [activeSt]);

  useEffect(() => { if (activeSt) loadData(); }, [activeSt, loadData]);

  const selectSt = (s) => { setActiveSt(s); stratRef.current?.setActive(s.id); setView("dashboard"); };
  const createSt = (s) => { stratRef.current?.add(s); setStrategies(stratRef.current?.list() || []); };
  const deleteSt = (id) => { stratRef.current?.remove(id); setStrategies(stratRef.current?.list() || []); if (activeSt?.id === id) setActiveSt(null); };
  const backToLanding = () => { setActiveSt(null); stratRef.current?.setActive(null); };

  const saveStair = async (form, existingId) => {
    if (activeSt?.source === "server") { if (existingId) await api.put(`/api/v1/stairs/${existingId}`, form); else await api.post("/api/v1/stairs", form); }
    else {
      const els = JSON.parse(localStorage.getItem(`stairs_el_${activeSt.id}`) || "[]");
      if (existingId) { const i = els.findIndex(e => e.id === existingId); if (i >= 0) els[i] = { ...els[i], ...form }; }
      else els.push({ ...form, id: `el_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, progress_percent: form.progress_percent || 0 });
      localStorage.setItem(`stairs_el_${activeSt.id}`, JSON.stringify(els));
    }
    await loadData();
  };
  const delStair = async (id) => {
    if (activeSt?.source === "server") await api.del(`/api/v1/stairs/${id}`);
    else { const els = JSON.parse(localStorage.getItem(`stairs_el_${activeSt.id}`) || "[]").filter(e => e.id !== id); localStorage.setItem(`stairs_el_${activeSt.id}`, JSON.stringify(els)); }
    await loadData();
  };
  const moveStair = async (id, dir) => {
    if (activeSt?.source === "server") {
      // Swap in tree in-place
      const walk = (nodes) => { for (let i = 0; i < nodes.length; i++) { if (nodes[i].stair.id === id) { const j = dir === "up" ? i - 1 : i + 1; if (j >= 0 && j < nodes.length) { [nodes[i], nodes[j]] = [nodes[j], nodes[i]]; } return true; } if (nodes[i].children && walk(nodes[i].children)) return true; } return false; };
      walk(tree); setTree([...tree]);
    } else {
      const els = JSON.parse(localStorage.getItem(`stairs_el_${activeSt.id}`) || "[]");
      const idx = els.findIndex(e => e.id === id); if (idx < 0) return;
      const el = els[idx]; const sibs = els.filter(e => e.parent_id === el.parent_id);
      const si = sibs.findIndex(s => s.id === id); const ti = dir === "up" ? si - 1 : si + 1;
      if (ti < 0 || ti >= sibs.length) return;
      const ai = els.findIndex(e => e.id === sibs[si].id); const bi = els.findIndex(e => e.id === sibs[ti].id);
      [els[ai], els[bi]] = [els[bi], els[ai]];
      localStorage.setItem(`stairs_el_${activeSt.id}`, JSON.stringify(els)); await loadData();
    }
  };

  if (!user) return <LoginScreen onLogin={u => setUser(u)} lang={lang} />;
  if (!activeSt) return <StrategyLanding strategies={strategies} onSelect={selectSt} onCreate={createSt} onDelete={deleteSt} userName={user.full_name || user.email} onLogout={() => { api.logout(); setUser(null); setActiveSt(null); }} onLangToggle={() => setLang(l => l === "en" ? "ar" : "en")} lang={lang} />;

  const navItems = [{ key: "dashboard", icon: "◫", label: "Dashboard" }, { key: "staircase", icon: "🪜", label: "Staircase" }, { key: "ai", icon: "◉", label: "AI Advisor" }, { key: "alerts", icon: "⚡", label: "Alerts" }];

  return (
    <div className="min-h-screen text-white" dir={lang === "ar" ? "rtl" : "ltr"} style={{ background: `linear-gradient(180deg, ${DEEP} 0%, #0f1f3a 50%, ${DEEP} 100%)`, fontFamily: lang === "ar" ? "'Noto Kufi Arabic', sans-serif" : "'DM Sans', system-ui, sans-serif" }}>
      <header className="sticky top-0 z-50 backdrop-blur-xl px-4 py-3 flex items-center gap-3" style={{ background: "rgba(10, 22, 40, 0.9)", borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={backToLanding} className="text-gray-500 hover:text-white transition p-1.5 rounded-lg hover:bg-white/5">â†</button>
        <div className="flex items-center gap-2 mr-2"><span className="text-lg">{activeSt.icon}</span><div><div className="text-sm font-semibold text-white leading-tight">{activeSt.name}</div><div className="text-[10px] text-gray-600">{activeSt.company}</div></div></div>
        <nav className="flex-1 flex justify-center gap-1">{navItems.map(n => <button key={n.key} onClick={() => setView(n.key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${view === n.key ? "bg-amber-500/15 text-amber-300 border border-amber-500/20" : "text-gray-500 hover:text-gray-300"}`}><span className="mr-1">{n.icon}</span>{n.label}{n.key === "alerts" && alerts.length > 0 && <span className="ml-1 bg-red-500/80 text-white text-[9px] px-1.5 py-0.5 rounded-full">{alerts.length}</span>}</button>)}</nav>
        <div className="flex items-center gap-3">
          <button onClick={() => setLang(l => l === "en" ? "ar" : "en")} className="text-xs text-gray-500 hover:text-amber-400 transition">{lang === "en" ? "عربي" : "EN"}</button>
          <button onClick={() => { api.logout(); setUser(null); setActiveSt(null); }} className="text-xs text-gray-600 hover:text-gray-300 transition">{user.full_name} ↗</button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        {err && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-center gap-2"><span>⚠️ {err}</span><button onClick={loadData} className="ml-auto text-xs underline">Retry</button></div>}
        {loading && view !== "ai" ? <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" /></div> : <>
          {view === "dashboard" && <DashboardView data={dashboard} lang={lang} />}
          {view === "staircase" && <StaircaseView tree={tree} lang={lang} onEdit={s => { setEditStair(s); setEditorOpen(true); }} onAdd={() => { setEditStair(null); setEditorOpen(true); }} onExport={() => setExportOpen(true)} onMove={moveStair} strategyContext={activeSt} />}
          {view === "ai" && <AIChatView lang={lang} userId={user?.id || user?.email} strategyContext={activeSt} />}
          {view === "alerts" && <AlertsView alerts={alerts} />}
        </>}
      </main>
      <footer className="text-center py-6 text-gray-700 text-[10px] tracking-widest uppercase">By DEVONEERS • ST.AIRS v3.4 • {new Date().getFullYear()}</footer>
      <StairEditor open={editorOpen} onClose={() => { setEditorOpen(false); setEditStair(null); }} stair={editStair} allStairs={tree} onSave={saveStair} onDelete={delStair} lang={lang} />
      <ExportPDF open={exportOpen} onClose={() => setExportOpen(false)} tree={tree} dashboard={dashboard} strategyName={activeSt?.name} />
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif&family=DM+Sans:wght@400;500;700&family=Noto+Kufi+Arabic:wght@400;500;700&display=swap');*{scrollbar-width:thin;scrollbar-color:rgba(184,144,74,0.15) transparent}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:rgba(184,144,74,0.15);border-radius:3px}`}</style>
    </div>
  );
}
