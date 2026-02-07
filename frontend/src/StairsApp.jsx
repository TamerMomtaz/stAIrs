import { useState, useEffect, useCallback, useRef, useMemo } from "react";

const API = "https://stairs-production.up.railway.app";

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN CONSTANTS — RootRise v6.5
// ═══════════════════════════════════════════════════════════════════════════
const GOLD = "#B8904A";
const GOLD_LIGHT = "#e8b94a";
const TEAL = "#2A5C5C";
const CHAMPAGNE = "#F7E7CE";
const DEEP = "#0a1628";
const PANEL = "rgba(22, 37, 68, 0.6)";
const BORDER = "rgba(30, 58, 95, 0.5)";

const typeColors = {
  vision: GOLD, objective: "#60a5fa", key_result: "#34d399",
  initiative: "#a78bfa", task: "#94a3b8",
};
const typeIcons = { vision: "◆", objective: "▣", key_result: "◎", initiative: "▶", task: "•" };
const typeLabelsEn = { vision: "Vision", objective: "Objective", key_result: "Key Result", initiative: "Initiative", task: "Task" };
const typeLabelsAr = { vision: "الرؤية", objective: "الهدف", key_result: "نتيجة رئيسية", initiative: "مبادرة", task: "مهمة" };

const glass = (op = 0.6) => ({ background: `rgba(22, 37, 68, ${op})`, border: `1px solid ${BORDER}` });

// ═══════════════════════════════════════════════════════════════════════════
// API CLIENT
// ═══════════════════════════════════════════════════════════════════════════
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
    const res = await fetch(`${API}/api/v1/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error("Login failed");
    const data = await res.json();
    this.token = data.access_token;
    this.user = data.user;
    localStorage.setItem("stairs_token", data.access_token);
    localStorage.setItem("stairs_user", JSON.stringify(data.user));
    return data;
  }
  logout() {
    this.token = null; this.user = null;
    localStorage.removeItem("stairs_token");
    localStorage.removeItem("stairs_user");
  }
  async get(path) {
    const res = await fetch(`${API}${path}`, { headers: this.headers() });
    if (res.status === 401) { this.logout(); throw new Error("Session expired"); }
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.json();
  }
  async post(path, body) {
    const res = await fetch(`${API}${path}`, {
      method: "POST", headers: this.headers(), body: JSON.stringify(body),
    });
    if (res.status === 401) { this.logout(); throw new Error("Session expired"); }
    if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
    return res.json();
  }
  async put(path, body) {
    const res = await fetch(`${API}${path}`, {
      method: "PUT", headers: this.headers(), body: JSON.stringify(body),
    });
    if (res.status === 401) { this.logout(); throw new Error("Session expired"); }
    if (!res.ok) throw new Error(`PUT ${path} → ${res.status}`);
    return res.json();
  }
  async del(path) {
    const res = await fetch(`${API}${path}`, {
      method: "DELETE", headers: this.headers(),
    });
    if (res.status === 401) { this.logout(); throw new Error("Session expired"); }
    if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
    return res.status === 204 ? null : res.json();
  }
}

const api = new StairsAPI();

// ═══════════════════════════════════════════════════════════════════════════
// AI CONVERSATION STORE — localStorage persistence per user
// ═══════════════════════════════════════════════════════════════════════════
class ConversationStore {
  constructor(userId) { this.prefix = `stairs_conv_${userId}`; }
  _key(k) { return `${this.prefix}_${k}`; }
  getConversations() {
    try { return JSON.parse(localStorage.getItem(this._key("list")) || "[]"); }
    catch { return []; }
  }
  saveConversation(conv) {
    const list = this.getConversations();
    const idx = list.findIndex(c => c.id === conv.id);
    if (idx >= 0) list[idx] = conv; else list.unshift(conv);
    localStorage.setItem(this._key("list"), JSON.stringify(list));
  }
  deleteConversation(id) {
    const list = this.getConversations().filter(c => c.id !== id);
    localStorage.setItem(this._key("list"), JSON.stringify(list));
    localStorage.removeItem(this._key(`msgs_${id}`));
  }
  getMessages(convId) {
    try { return JSON.parse(localStorage.getItem(this._key(`msgs_${convId}`)) || "[]"); }
    catch { return []; }
  }
  saveMessages(convId, messages) {
    localStorage.setItem(this._key(`msgs_${convId}`), JSON.stringify(messages));
  }
  createConversation(title) {
    const conv = {
      id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: title || "New conversation",
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      message_count: 0,
    };
    this.saveConversation(conv);
    return conv;
  }
  getActiveConversationId() { return localStorage.getItem(this._key("active")) || null; }
  setActiveConversationId(id) {
    if (id) localStorage.setItem(this._key("active"), id);
    else localStorage.removeItem(this._key("active"));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY STORE — local multi-strategy management
// The backend currently supports one org's data. This store layers
// multi-strategy support on top via localStorage, mapping each
// "strategy" to the same backend but tracking which is active.
// When multi-strategy backend lands (v3.3), this swaps to API calls.
// ═══════════════════════════════════════════════════════════════════════════
class StrategyStore {
  constructor(userId) { this.key = `stairs_strategies_${userId}`; }

  getStrategies() {
    try { return JSON.parse(localStorage.getItem(this.key) || "[]"); }
    catch { return []; }
  }

  saveStrategies(list) {
    localStorage.setItem(this.key, JSON.stringify(list));
  }

  addStrategy(strategy) {
    const list = this.getStrategies();
    list.push(strategy);
    this.saveStrategies(list);
    return strategy;
  }

  deleteStrategy(id) {
    const list = this.getStrategies().filter(s => s.id !== id);
    this.saveStrategies(list);
  }

  updateStrategy(id, updates) {
    const list = this.getStrategies();
    const idx = list.findIndex(s => s.id === id);
    if (idx >= 0) list[idx] = { ...list[idx], ...updates, updated_at: new Date().toISOString() };
    this.saveStrategies(list);
  }

  getActiveId() { return localStorage.getItem(`${this.key}_active`) || null; }
  setActiveId(id) {
    if (id) localStorage.setItem(`${this.key}_active`, id);
    else localStorage.removeItem(`${this.key}_active`);
  }

  // Seed the default RootRise strategy if none exist
  ensureDefaults() {
    const list = this.getStrategies();
    if (list.length === 0) {
      this.addStrategy({
        id: "rootrise_default",
        name: "RootRise Vision 2026",
        description: "DEVONEERS strategic roadmap for MENA AI market leadership",
        company: "DEVONEERS / RootRise",
        icon: "🌱",
        color: GOLD,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_backend: true, // This one maps to the seeded backend data
      });
      this.setActiveId("rootrise_default");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const HealthBadge = ({ health, size = "sm" }) => {
  const colors = {
    on_track: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    at_risk: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    off_track: "bg-red-500/20 text-red-300 border-red-500/30",
    achieved: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  };
  const dots = { on_track: "●", at_risk: "●", off_track: "○", achieved: "★" };
  const cls = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-3 py-1";
  return (
    <span className={`${cls} rounded-full border font-medium whitespace-nowrap ${colors[health] || colors.at_risk}`}>
      {dots[health] || "?"} {health?.replace("_", " ").toUpperCase()}
    </span>
  );
};

const ProgressRing = ({ percent = 0, size = 80, stroke = 6, color }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  const col = color || (percent >= 70 ? "#34d399" : percent >= 40 ? "#fbbf24" : "#f87171");
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e3a5f" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1s ease" }} />
      <text x="50%" y="50%" textAnchor="middle" dy=".35em" fill={col}
        fontSize={size * 0.22} fontWeight="700" transform={`rotate(90 ${size/2} ${size/2})`}>
        {Math.round(percent)}%
      </text>
    </svg>
  );
};

const Modal = ({ open, onClose, title, children, wide }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className={`relative z-10 w-full ${wide ? "max-w-4xl" : "max-w-lg"} max-h-[88vh] flex flex-col rounded-2xl overflow-hidden`}
        style={{ background: "rgba(15, 25, 50, 0.97)", border: `1px solid ${GOLD}33` }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${GOLD}22` }}>
          <h2 className="text-white font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition text-xl leading-none p-1">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
};

const inputClass = "w-full px-3 py-2.5 rounded-lg bg-[#0a1628]/80 border border-[#1e3a5f] text-white placeholder-gray-600 focus:border-amber-500/40 focus:outline-none transition text-sm";
const labelClass = "text-gray-400 text-xs uppercase tracking-wider mb-1.5 block";

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════
const LoginScreen = ({ onLogin, lang }) => {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); setErr("");
    try { await api.login(email, pass); onLogin(api.user); }
    catch { setErr(lang === "ar" ? "فشل تسجيل الدخول" : "Invalid credentials"); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{
      background: `linear-gradient(135deg, ${DEEP} 0%, #162544 40%, #1a3055 70%, #0f1f3a 100%)`
    }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="absolute border rounded-full"
            style={{ borderColor: `${GOLD}08`, width: 200 + i * 150, height: 200 + i * 150,
              top: "50%", left: "50%", transform: `translate(-50%, -50%) rotate(${i * 15}deg)`,
              animation: `spin ${30 + i * 10}s linear infinite` }} />
        ))}
      </div>
      <form onSubmit={handleLogin} className="relative z-10 w-full max-w-md p-8 rounded-2xl backdrop-blur-xl"
        style={{ background: "rgba(22, 37, 68, 0.8)", border: `1px solid ${GOLD}33` }}
        dir={lang === "ar" ? "rtl" : "ltr"}>
        <div className="text-center mb-8">
          <div className="text-5xl font-bold tracking-tight mb-1" style={{
            background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT}, ${CHAMPAGNE})`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            fontFamily: "'Instrument Serif', Georgia, serif"
          }}>ST.AIRS</div>
          <div className="text-gray-400 text-sm tracking-widest uppercase mt-1">
            {lang === "ar" ? "السلم الاستراتيجي" : "Strategic Staircase"}
          </div>
          <div className="w-12 h-0.5 mx-auto mt-3" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        </div>
        <div className="space-y-4">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder={lang === "ar" ? "البريد الإلكتروني" : "Email"} required className={inputClass} />
          <input type="password" value={pass} onChange={e => setPass(e.target.value)}
            placeholder={lang === "ar" ? "كلمة المرور" : "Password"} required className={inputClass} />
        </div>
        {err && <div className="mt-3 text-red-400 text-sm text-center">{err}</div>}
        <button type="submit" disabled={loading}
          className="w-full mt-6 py-3 rounded-lg font-semibold text-[#0a1628] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})` }}>
          {loading ? "..." : lang === "ar" ? "تسجيل الدخول" : "Sign In"}
        </button>
        <div className="text-center mt-6 text-gray-600 text-xs">By DEVONEERS</div>
      </form>
      <style>{`@keyframes spin { to { transform: translate(-50%,-50%) rotate(360deg) } }`}</style>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY LANDING PAGE — Pick, create, or delete strategies
// ═══════════════════════════════════════════════════════════════════════════
const StrategyLanding = ({ strategies, onSelect, onCreate, onDelete, userName, lang, onLogout, onLangToggle }) => {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", description: "", icon: "🎯", color: GOLD });

  const iconOptions = ["🎯", "🌱", "🚀", "🏗️", "💡", "🏭", "📊", "🌍", "⚡", "🔬", "🛡️", "🌐"];
  const colorOptions = [GOLD, TEAL, "#60a5fa", "#a78bfa", "#f87171", "#34d399", "#fbbf24", "#ec4899"];

  const handleCreate = () => {
    if (!form.name.trim()) return;
    onCreate({
      id: `strat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: form.name,
      company: form.company || form.name,
      description: form.description,
      icon: form.icon,
      color: form.color,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_backend: false,
      elements: [], // Local strategy elements stored separately
    });
    setForm({ name: "", company: "", description: "", icon: "🎯", color: GOLD });
    setShowCreate(false);
  };

  return (
    <div className="min-h-screen text-white" style={{
      background: `linear-gradient(180deg, ${DEEP} 0%, #0f1f3a 50%, ${DEEP} 100%)`,
      fontFamily: lang === "ar" ? "'Noto Kufi Arabic', sans-serif" : "'DM Sans', system-ui, sans-serif"
    }} dir={lang === "ar" ? "rtl" : "ltr"}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold" style={{
            background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            fontFamily: "'Instrument Serif', Georgia, serif"
          }}>ST.AIRS</span>
          <span className="text-[10px] text-gray-600 uppercase tracking-widest">v3.2</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onLangToggle}
            className="text-xs text-gray-500 hover:text-amber-400 transition px-2 py-1 rounded border border-transparent hover:border-amber-500/20">
            {lang === "en" ? "عربي" : "EN"}
          </button>
          <button onClick={onLogout} className="text-xs text-gray-600 hover:text-gray-300 transition">
            {userName} ↗
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-12 pb-8 text-center">
        <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
          {lang === "ar" ? "استراتيجياتك" : "Your Strategies"}
        </h1>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          {lang === "ar"
            ? "اختر استراتيجية للعمل عليها أو أنشئ واحدة جديدة"
            : "Choose a strategy to continue working on, or create a new one"}
        </p>
      </div>

      {/* Strategy Cards */}
      <div className="max-w-4xl mx-auto px-6 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Create New Card */}
          <button onClick={() => setShowCreate(true)}
            className="group p-6 rounded-2xl border-2 border-dashed border-[#1e3a5f] hover:border-amber-500/40 transition-all hover:scale-[1.02] text-left min-h-[200px] flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-all group-hover:scale-110"
              style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}30` }}>+</div>
            <div className="text-center">
              <div className="text-white font-medium text-sm">
                {lang === "ar" ? "إنشاء استراتيجية جديدة" : "Create New Strategy"}
              </div>
              <div className="text-gray-600 text-xs mt-1">
                {lang === "ar" ? "لأي شركة أو منتج أو مشروع" : "For any company, product, or project"}
              </div>
            </div>
          </button>

          {/* Existing strategies */}
          {strategies.map(strat => (
            <div key={strat.id}
              className="group relative p-6 rounded-2xl transition-all hover:scale-[1.02] cursor-pointer min-h-[200px] flex flex-col"
              style={{ ...glass(0.5), borderColor: `${strat.color}30` }}
              onClick={() => onSelect(strat)}>
              {/* Delete button */}
              {!strat.is_backend && (
                <button onClick={(e) => { e.stopPropagation(); onDelete(strat.id); }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 text-xs transition p-1.5 rounded-lg hover:bg-red-500/10">
                  ✕
                </button>
              )}
              {/* Icon */}
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl mb-4"
                style={{ background: `${strat.color}20`, border: `1px solid ${strat.color}30` }}>
                {strat.icon || "🎯"}
              </div>
              {/* Info */}
              <div className="flex-1">
                <div className="text-white font-semibold text-base mb-1">{strat.name}</div>
                <div className="text-gray-500 text-xs mb-2">{strat.company}</div>
                {strat.description && (
                  <div className="text-gray-600 text-xs leading-relaxed line-clamp-2">{strat.description}</div>
                )}
              </div>
              {/* Footer */}
              <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
                <div className="text-gray-600 text-[10px]">
                  {new Date(strat.updated_at).toLocaleDateString()}
                </div>
                <div className="text-xs font-medium" style={{ color: strat.color }}>
                  {strat.is_backend ? "● Live" : "● Local"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Strategy Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)}
        title={lang === "ar" ? "إنشاء استراتيجية جديدة" : "Create New Strategy"}>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>{lang === "ar" ? "اسم الاستراتيجية" : "Strategy Name"}</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={lang === "ar" ? "مثال: خطة توسع 2026" : "e.g., Expansion Plan 2026"}
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{lang === "ar" ? "الشركة / المنتج" : "Company / Product"}</label>
            <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
              placeholder={lang === "ar" ? "مثال: شركة المنار" : "e.g., Al-Manar Corp"}
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{lang === "ar" ? "الوصف" : "Description"}</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder={lang === "ar" ? "وصف مختصر للاستراتيجية..." : "Brief description of this strategy..."}
              rows={2} className={`${inputClass} resize-none`} />
          </div>
          <div>
            <label className={labelClass}>{lang === "ar" ? "الأيقونة" : "Icon"}</label>
            <div className="flex flex-wrap gap-2">
              {iconOptions.map(ic => (
                <button key={ic} onClick={() => setForm(f => ({ ...f, icon: ic }))}
                  className={`w-10 h-10 rounded-lg text-lg flex items-center justify-center transition ${
                    form.icon === ic ? "bg-amber-500/20 border border-amber-500/40 scale-110" : "bg-[#0a1628]/60 border border-[#1e3a5f] hover:border-gray-500"
                  }`}>{ic}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelClass}>{lang === "ar" ? "اللون" : "Accent Color"}</label>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map(col => (
                <button key={col} onClick={() => setForm(f => ({ ...f, color: col }))}
                  className={`w-8 h-8 rounded-full transition ${form.color === col ? "scale-125 ring-2 ring-white/30" : "hover:scale-110"}`}
                  style={{ background: col }} />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </button>
            <button onClick={handleCreate} disabled={!form.name.trim()}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-[#0a1628] disabled:opacity-40 transition-all hover:scale-[1.02]"
              style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})` }}>
              {lang === "ar" ? "إنشاء" : "Create Strategy"}
            </button>
          </div>
        </div>
      </Modal>

      <footer className="text-center py-8 text-gray-700 text-[10px] tracking-widest uppercase">
        By DEVONEERS • ST.AIRS v3.2 • {new Date().getFullYear()}
      </footer>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// STAIR EDITOR MODAL
// ═══════════════════════════════════════════════════════════════════════════
const StairEditor = ({ open, onClose, stair, allStairs, onSave, onDelete, lang }) => {
  const isNew = !stair?.id;
  const [form, setForm] = useState({
    title: "", title_ar: "", description: "", description_ar: "",
    element_type: "objective", health: "on_track", progress_percent: 0,
    parent_id: null, code: "",
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (stair) {
      setForm({
        title: stair.title || "", title_ar: stair.title_ar || "",
        description: stair.description || "", description_ar: stair.description_ar || "",
        element_type: stair.element_type || "objective", health: stair.health || "on_track",
        progress_percent: stair.progress_percent || 0,
        parent_id: stair.parent_id || null, code: stair.code || "",
      });
    } else {
      setForm({ title: "", title_ar: "", description: "", description_ar: "",
        element_type: "objective", health: "on_track", progress_percent: 0,
        parent_id: null, code: "" });
    }
    setConfirmDelete(false);
  }, [stair, open]);

  const parentOptions = useMemo(() => {
    if (!allStairs) return [];
    const flat = [];
    const walk = (nodes, depth = 0) => {
      nodes.forEach(n => {
        if (!stair || n.stair.id !== stair.id)
          flat.push({ id: n.stair.id, label: `${"  ".repeat(depth)}${n.stair.code} — ${n.stair.title}`, type: n.stair.element_type });
        if (n.children) walk(n.children, depth + 1);
      });
    };
    walk(allStairs);
    return flat;
  }, [allStairs, stair]);

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try { await onSave(form, stair?.id); onClose(); }
    catch (e) { alert(e.message); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    try { await onDelete(stair.id); onClose(); }
    catch (e) { alert(e.message); }
    setSaving(false);
  };

  const labels = lang === "ar" ? typeLabelsAr : typeLabelsEn;

  return (
    <Modal open={open} onClose={onClose} title={isNew ? (lang === "ar" ? "إضافة عنصر" : "Add Element") : (lang === "ar" ? "تعديل العنصر" : "Edit Element")}>
      <div className="space-y-4">
        {/* Type */}
        <div>
          <label className={labelClass}>{lang === "ar" ? "النوع" : "Type"}</label>
          <div className="flex gap-2 flex-wrap">
            {["vision", "objective", "key_result", "initiative", "task"].map(tp => (
              <button key={tp} onClick={() => setForm(f => ({ ...f, element_type: tp }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  form.element_type === tp ? "border-amber-500/40 bg-amber-500/15 text-amber-300" : "border-[#1e3a5f] text-gray-500 hover:text-gray-300"
                }`}>
                <span style={{ color: typeColors[tp] }}>{typeIcons[tp]}</span> {labels[tp]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelClass}>Code</label>
          <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
            placeholder="OBJ-001" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{lang === "ar" ? "العنوان (EN)" : "Title (EN)"}</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Strategic element title..." className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{lang === "ar" ? "العنوان (AR)" : "Title (AR)"}</label>
          <input value={form.title_ar} onChange={e => setForm(f => ({ ...f, title_ar: e.target.value }))}
            placeholder="العنوان بالعربية..." className={inputClass} dir="rtl" />
        </div>
        <div>
          <label className={labelClass}>{lang === "ar" ? "الوصف" : "Description"}</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={2} className={`${inputClass} resize-none`} />
        </div>
        <div>
          <label className={labelClass}>{lang === "ar" ? "العنصر الأب" : "Parent"}</label>
          <select value={form.parent_id || ""} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value || null }))}
            className={inputClass}>
            <option value="">{lang === "ar" ? "لا يوجد (مستوى أعلى)" : "None (top level)"}</option>
            {parentOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>{lang === "ar" ? "الحالة" : "Health"}</label>
          <div className="flex gap-2 flex-wrap">
            {["on_track", "at_risk", "off_track", "achieved"].map(h => (
              <button key={h} onClick={() => setForm(f => ({ ...f, health: h }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  form.health === h
                    ? (h === "on_track" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                       : h === "at_risk" ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                       : h === "off_track" ? "bg-red-500/20 text-red-300 border-red-500/30"
                       : "bg-blue-500/20 text-blue-300 border-blue-500/30")
                    : "border-[#1e3a5f] text-gray-500 hover:text-gray-300"
                }`}>
                {h.replace("_", " ").toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelClass}>{lang === "ar" ? "التقدم" : "Progress"}: {form.progress_percent}%</label>
          <input type="range" min={0} max={100} value={form.progress_percent}
            onChange={e => setForm(f => ({ ...f, progress_percent: parseInt(e.target.value) }))}
            className="w-full accent-amber-500" />
        </div>
        <div className="flex items-center gap-3 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
          {!isNew && (
            <button onClick={handleDelete}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                confirmDelete ? "bg-red-500/30 text-red-200 border border-red-500/50" : "text-red-400/60 hover:text-red-300 hover:bg-red-500/10"
              }`}>
              {confirmDelete ? (lang === "ar" ? "تأكيد الحذف؟" : "Confirm?") : (lang === "ar" ? "حذف" : "Delete")}
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">
            {lang === "ar" ? "إلغاء" : "Cancel"}
          </button>
          <button onClick={handleSave} disabled={saving || !form.title.trim()}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-[#0a1628] disabled:opacity-40 transition-all hover:scale-[1.02]"
            style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})` }}>
            {saving ? "..." : lang === "ar" ? "حفظ" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD VIEW
// ═══════════════════════════════════════════════════════════════════════════
const DashboardView = ({ data, lang }) => {
  const s = data?.stats || {};
  const labels = lang === "ar"
    ? { total: "إجمالي العناصر", on: "على المسار", risk: "معرض للخطر", off: "خارج المسار", progress: "التقدم العام" }
    : { total: "Total Elements", on: "On Track", risk: "At Risk", off: "Off Track", progress: "Overall Progress" };
  const stats = [
    { label: labels.total, value: s.total_elements || 0, color: "#60a5fa" },
    { label: labels.on, value: s.on_track || 0, color: "#34d399" },
    { label: labels.risk, value: s.at_risk || 0, color: "#fbbf24" },
    { label: labels.off, value: s.off_track || 0, color: "#f87171" },
  ];
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6 p-6 rounded-2xl" style={glass()}>
        <ProgressRing percent={s.overall_progress || 0} size={120} stroke={8} />
        <div>
          <div className="text-gray-400 text-sm">{labels.progress}</div>
          <div className="text-3xl font-bold text-white">{Math.round(s.overall_progress || 0)}%</div>
          <div className="text-gray-500 text-xs mt-1">{s.active_alerts || 0} alerts ({s.critical_alerts || 0} critical)</div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((st, i) => (
          <div key={i} className="p-4 rounded-xl text-center" style={{ ...glass(0.5), borderColor: `${st.color}22` }}>
            <div className="text-3xl font-bold" style={{ color: st.color }}>{st.value}</div>
            <div className="text-gray-400 text-xs mt-1">{st.label}</div>
          </div>
        ))}
      </div>
      {data?.top_risks?.length > 0 && (
        <div>
          <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">Top Risks</h3>
          <div className="space-y-2">
            {data.top_risks.map((r, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={glass(0.4)}>
                <div className="text-xs font-mono text-amber-400/80 w-16 shrink-0">{r.code}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm truncate">{lang === "ar" && r.title_ar ? r.title_ar : r.title}</div>
                </div>
                <HealthBadge health={r.health} />
                <div className="text-white text-sm font-medium w-12 text-right">{r.progress_percent}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// STAIRCASE VIEW — with move up/down controls + inline edit trigger
// ═══════════════════════════════════════════════════════════════════════════
const StaircaseView = ({ tree, lang, onEdit, onAdd, onExport, onMove }) => {

  // Flatten tree with indices for move operations
  const flatList = useMemo(() => {
    const flat = [];
    const walk = (nodes, depth = 0, parentId = null) => {
      nodes.forEach((n, idx) => {
        flat.push({ stair: n.stair, depth, parentId, siblingIndex: idx, siblingCount: nodes.length });
        if (n.children) walk(n.children, depth + 1, n.stair.id);
      });
    };
    walk(tree || []);
    return flat;
  }, [tree]);

  const renderStair = (node, depth = 0, siblingIdx = 0, siblingCount = 1) => {
    const s = node.stair;
    const color = typeColors[s.element_type] || "#94a3b8";
    return (
      <div key={s.id} style={{ marginLeft: depth * 28 }}>
        <div className="group flex items-center gap-2 p-3 rounded-xl my-1 transition-all hover:bg-white/[0.03]"
          style={{ borderLeft: `3px solid ${color}` }}>

          {/* Move controls */}
          <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
            <button onClick={(e) => { e.stopPropagation(); onMove(s.id, "up"); }}
              disabled={siblingIdx === 0}
              className="text-gray-600 hover:text-white text-[10px] leading-none disabled:opacity-20 p-0.5"
              title="Move up">▲</button>
            <button onClick={(e) => { e.stopPropagation(); onMove(s.id, "down"); }}
              disabled={siblingIdx >= siblingCount - 1}
              className="text-gray-600 hover:text-white text-[10px] leading-none disabled:opacity-20 p-0.5"
              title="Move down">▼</button>
          </div>

          {/* Element */}
          <div className="flex-1 flex items-center gap-3 cursor-pointer min-w-0" onClick={() => onEdit(s)}>
            <span style={{ color, fontSize: 16 }}>{typeIcons[s.element_type] || "•"}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono opacity-40" style={{ color }}>{s.code}</span>
                <span className="text-white text-sm font-medium truncate">
                  {lang === "ar" && s.title_ar ? s.title_ar : s.title}
                </span>
              </div>
              {s.description && <div className="text-gray-600 text-xs mt-0.5 truncate max-w-md">{s.description}</div>}
            </div>
            <HealthBadge health={s.health} />
            <div className="w-14 text-right shrink-0">
              <div className="text-xs font-medium" style={{ color }}>{s.progress_percent}%</div>
              <div className="h-1 rounded-full bg-[#1e3a5f] mt-0.5 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${s.progress_percent}%`, background: color, transition: "width 0.6s ease" }} />
              </div>
            </div>
            <div className="opacity-0 group-hover:opacity-60 transition text-gray-500 text-xs shrink-0">✎</div>
          </div>
        </div>
        {node.children?.map((child, ci) => renderStair(child, depth + 1, ci, node.children.length))}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ background: `${GOLD}22`, border: `1px solid ${GOLD}33`, color: GOLD }}>
          + {lang === "ar" ? "إضافة عنصر" : "Add Element"}
        </button>
        <div className="flex-1" />
        <button onClick={onExport}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white transition"
          style={{ border: `1px solid ${BORDER}` }}>
          ↓ {lang === "ar" ? "تصدير PDF" : "Export PDF"}
        </button>
      </div>
      {!tree?.length
        ? <div className="text-gray-500 text-center py-12">{lang === "ar" ? "لا توجد عناصر بعد" : "No elements yet. Add your first strategic element."}</div>
        : <div className="space-y-0.5">{tree.map((node, i) => renderStair(node, 0, i, tree.length))}</div>
      }
      <div className="text-center text-gray-600 text-xs mt-6 italic">
        {lang === "ar" ? "انقر على أي عنصر للتعديل · استخدم الأسهم للترتيب" : "Click any element to edit · Use arrows to reorder"}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// AI CHAT VIEW — with persistent conversations & history panel
// ═══════════════════════════════════════════════════════════════════════════
const AIChatView = ({ lang, userId }) => {
  const storeRef = useRef(null);
  if (!storeRef.current && userId) storeRef.current = new ConversationStore(userId);
  const store = storeRef.current;

  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (!store) return;
    const convs = store.getConversations();
    setConversations(convs);
    const activeId = store.getActiveConversationId();
    if (activeId && convs.find(c => c.id === activeId)) {
      setActiveConvId(activeId);
      setMessages(store.getMessages(activeId));
    } else if (convs.length > 0) {
      setActiveConvId(convs[0].id);
      setMessages(store.getMessages(convs[0].id));
    }
  }, [store]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const welcomeMsg = () => ({
    role: "ai", ts: new Date().toISOString(),
    text: lang === "ar"
      ? "مرحباً! أنا المستشار الاستراتيجي الذكي. كيف يمكنني مساعدتك؟"
      : "Welcome! I'm the ST.AIRS Strategy Advisor. Ask me anything about risks, opportunities, or strategic moves.",
  });

  const createNewChat = () => {
    if (!store) return;
    const conv = store.createConversation(lang === "ar" ? "محادثة جديدة" : "New conversation");
    const welcome = [welcomeMsg()];
    store.saveMessages(conv.id, welcome);
    store.setActiveConversationId(conv.id);
    setActiveConvId(conv.id);
    setMessages(welcome);
    setConversations(store.getConversations());
  };

  const loadConversation = (id) => {
    if (!store) return;
    store.setActiveConversationId(id);
    setActiveConvId(id);
    setMessages(store.getMessages(id));
    setShowHistory(false);
  };

  const deleteConversation = (id) => {
    if (!store) return;
    store.deleteConversation(id);
    const remaining = store.getConversations();
    setConversations(remaining);
    if (id === activeConvId) {
      if (remaining.length > 0) loadConversation(remaining[0].id);
      else { setActiveConvId(null); setMessages([]); }
    }
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim(); setInput("");
    let convId = activeConvId;
    if (!convId && store) {
      const conv = store.createConversation(msg.slice(0, 50));
      store.saveMessages(conv.id, [welcomeMsg()]);
      store.setActiveConversationId(conv.id);
      convId = conv.id;
      setActiveConvId(conv.id);
      setConversations(store.getConversations());
      setMessages([welcomeMsg()]);
    }
    const userMsg = { role: "user", text: msg, ts: new Date().toISOString() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    if (store && convId) store.saveMessages(convId, newMsgs);
    setLoading(true);
    try {
      const res = await api.post("/api/v1/ai/chat", { message: msg });
      const aiMsg = { role: "ai", text: res.response, tokens: res.tokens_used, actions: res.actions, ts: new Date().toISOString() };
      const finalMsgs = [...newMsgs, aiMsg];
      setMessages(finalMsgs);
      if (store && convId) {
        store.saveMessages(convId, finalMsgs);
        const conv = store.getConversations().find(c => c.id === convId);
        if (conv) {
          if (conv.title === "New conversation" || conv.title === "محادثة جديدة") conv.title = msg.slice(0, 60);
          conv.updated_at = new Date().toISOString();
          conv.message_count = finalMsgs.length;
          store.saveConversation(conv);
          setConversations(store.getConversations());
        }
      }
    } catch (e) {
      const errMsg = { role: "ai", text: `⚠️ ${e.message}`, error: true, ts: new Date().toISOString() };
      const finalMsgs = [...newMsgs, errMsg];
      setMessages(finalMsgs);
      if (store && convId) store.saveMessages(convId, finalMsgs);
    }
    setLoading(false);
  };

  const quickPrompts = lang === "ar"
    ? ["ما هي أكبر المخاطر؟", "حلل تقدم الرؤية", "اقترح خطوات تالية"]
    : ["What are our biggest risks?", "Analyze vision progress", "Suggest next steps"];

  const activeConv = conversations.find(c => c.id === activeConvId);

  return (
    <div className="flex h-[calc(100vh-180px)] gap-3">
      {/* History sidebar */}
      <div className={`${showHistory ? "w-64 opacity-100" : "w-0 opacity-0 overflow-hidden"} transition-all duration-300 flex flex-col rounded-xl shrink-0`}
        style={glass(0.5)}>
        <div className="flex items-center justify-between px-3 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">
            {lang === "ar" ? "المحادثات" : "History"}
          </span>
          <button onClick={createNewChat} className="text-xs px-2 py-1 rounded-md text-amber-400 hover:bg-amber-500/10 transition">
            + {lang === "ar" ? "جديد" : "New"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {conversations.length === 0
            ? <div className="text-gray-600 text-xs text-center py-6">{lang === "ar" ? "لا توجد محادثات" : "No conversations"}</div>
            : conversations.map(conv => (
              <div key={conv.id}
                className={`group px-3 py-2.5 mx-1 my-0.5 rounded-lg cursor-pointer transition ${
                  conv.id === activeConvId ? "bg-amber-500/10 border border-amber-500/20" : "hover:bg-white/5 border border-transparent"
                }`}
                onClick={() => loadConversation(conv.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm text-white truncate flex-1">{conv.title}</div>
                  <button onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                    className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 text-xs transition shrink-0">✕</button>
                </div>
                <div className="text-[10px] text-gray-600 mt-0.5">{conv.message_count || 0} msgs</div>
              </div>
            ))
          }
        </div>
      </div>

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setShowHistory(!showHistory)}
            className={`p-2 rounded-lg transition ${showHistory ? "bg-amber-500/15 text-amber-400" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"}`}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="12" width="14" height="2" rx="1"/>
            </svg>
          </button>
          {activeConv && <span className="text-sm text-gray-400 truncate">{activeConv.title}</span>}
          <div className="flex-1" />
          <button onClick={createNewChat} className="text-xs px-3 py-1.5 rounded-lg text-amber-400/70 border border-amber-500/20 hover:bg-amber-500/10 transition">
            + {lang === "ar" ? "جديد" : "New Chat"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 pb-4 px-1">
          {messages.length === 0 && <div className="text-gray-600 text-center py-12 text-sm">{lang === "ar" ? "ابدأ محادثة جديدة" : "Start a new conversation"}</div>}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed ${
                m.role === "user" ? "bg-amber-500/20 text-amber-100 rounded-br-md"
                : m.error ? "bg-red-500/10 text-red-300 rounded-bl-md border border-red-500/20"
                : "bg-[#162544] text-gray-200 rounded-bl-md border border-[#1e3a5f]"
              }`}>
                <div className="whitespace-pre-wrap">{m.text}</div>
                {m.tokens > 0 && <div className="text-[10px] text-gray-600 mt-2 text-right">{m.tokens} tokens</div>}
                {m.actions?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {m.actions.map((a, j) => (
                      <div key={j} className="text-xs text-amber-400/70 pl-2 border-l border-amber-500/20">→ {a.text}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-1 px-4 py-2">
              {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-amber-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          )}
          <div ref={endRef} />
        </div>
        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {quickPrompts.map((q, i) => (
              <button key={i} onClick={() => setInput(q)}
                className="text-xs px-3 py-1.5 rounded-full border border-amber-500/20 text-amber-400/70 hover:bg-amber-500/10 transition">{q}</button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder={lang === "ar" ? "اسأل الذكاء الاصطناعي..." : "Ask the strategy AI..."} disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl bg-[#0a1628]/60 border border-[#1e3a5f] text-white placeholder-gray-600 focus:border-amber-500/40 focus:outline-none transition text-sm" />
          <button onClick={send} disabled={loading || !input.trim()}
            className="px-5 py-3 rounded-xl font-medium text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
            style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, color: DEEP }}>
            {lang === "ar" ? "إرسال" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// ALERTS VIEW
// ═══════════════════════════════════════════════════════════════════════════
const AlertsView = ({ alerts, lang }) => {
  const sevColors = {
    critical: { bg: "rgba(248,113,113,0.1)", border: "#f8717130", icon: "🔴", text: "text-red-300" },
    high: { bg: "rgba(251,191,36,0.1)", border: "#fbbf2430", icon: "🟡", text: "text-amber-300" },
    medium: { bg: "rgba(96,165,250,0.1)", border: "#60a5fa30", icon: "🔵", text: "text-blue-300" },
    info: { bg: "rgba(96,165,250,0.08)", border: "#60a5fa20", icon: "ℹ️", text: "text-blue-300" },
  };
  if (!alerts?.length) return <div className="text-gray-500 text-center py-12">No active alerts</div>;
  return (
    <div className="space-y-3">
      {alerts.map((a, i) => {
        const sev = sevColors[a.severity] || sevColors.info;
        return (
          <div key={i} className="p-4 rounded-xl" style={{ background: sev.bg, border: `1px solid ${sev.border}` }}>
            <div className="flex items-start gap-3">
              <span className="text-lg mt-0.5">{sev.icon}</span>
              <div className="flex-1">
                <div className={`font-medium text-sm ${sev.text}`}>{lang === "ar" && a.title_ar ? a.title_ar : a.title}</div>
                <div className="text-gray-400 text-xs mt-1">{lang === "ar" && a.description_ar ? a.description_ar : a.description}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// PDF EXPORT — generates and downloads a real PDF document
// ═══════════════════════════════════════════════════════════════════════════
const ExportPDF = ({ open, onClose, tree, dashboard, lang, strategyName }) => {
  const [generating, setGenerating] = useState(false);
  const [exportMode, setExportMode] = useState("full");
  const [selectedIds, setSelectedIds] = useState(new Set());

  const flatNodes = useMemo(() => {
    const flat = [];
    const walk = (nodes, depth = 0) => {
      nodes?.forEach(n => {
        flat.push({ ...n.stair, depth });
        if (n.children) walk(n.children, depth + 1);
      });
    };
    walk(tree);
    return flat;
  }, [tree]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const shouldInclude = (id) => exportMode === "full" || selectedIds.has(id);

  const generatePDF = async () => {
    setGenerating(true);

    // Build HTML for PDF conversion via print
    const s = dashboard?.stats || {};
    const elements = flatNodes.filter(n => shouldInclude(n.id));
    const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    const healthLabel = (h) => ({ on_track: "✓ On Track", at_risk: "⚠ At Risk", off_track: "✗ Off Track", achieved: "★ Achieved" }[h] || h);
    const healthBg = (h) => ({ on_track: "#d1fae5", at_risk: "#fef3c7", off_track: "#fecaca", achieved: "#dbeafe" }[h] || "#f3f4f6");
    const healthFg = (h) => ({ on_track: "#065f46", at_risk: "#92400e", off_track: "#991b1b", achieved: "#1e40af" }[h] || "#374151");
    const typeSym = (t) => ({ vision: "◆", objective: "▣", key_result: "◎", initiative: "▶", task: "•" }[t] || "•");

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', sans-serif; color: #1a1a2e; background: #fff; padding: 40px; }
  .header { text-align: center; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid ${GOLD}; }
  .header h1 { font-size: 28px; color: ${GOLD}; letter-spacing: 2px; margin-bottom: 4px; }
  .header .subtitle { font-size: 14px; color: #666; }
  .header .date { font-size: 11px; color: #999; margin-top: 4px; }
  .stats { display: flex; gap: 16px; margin-bottom: 28px; }
  .stat-card { flex: 1; text-align: center; padding: 16px; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; }
  .stat-card .value { font-size: 24px; font-weight: 700; }
  .stat-card .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
  .section-title { font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: ${GOLD}; margin: 24px 0 12px; font-weight: 600; }
  .element { display: flex; align-items: center; gap: 12px; padding: 10px 14px; margin: 4px 0; border-radius: 8px; border-left: 3px solid #ccc; background: #fafbfc; }
  .element .icon { font-size: 14px; width: 20px; text-align: center; }
  .element .code { font-size: 10px; font-family: monospace; color: #94a3b8; min-width: 60px; }
  .element .title { flex: 1; font-size: 13px; font-weight: 500; }
  .element .badge { font-size: 9px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
  .element .progress { font-size: 12px; font-weight: 600; min-width: 40px; text-align: right; }
  .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; }
  @media print { body { padding: 20px; } .no-print { display: none; } }
</style></head><body>
<div class="header">
  <h1>ST.AIRS</h1>
  <div class="subtitle">${strategyName || "Strategy Report"}</div>
  <div class="date">${date} · Read-Only Export</div>
</div>
<div class="stats">
  <div class="stat-card"><div class="value" style="color:#60a5fa">${s.total_elements || elements.length}</div><div class="label">Total Elements</div></div>
  <div class="stat-card"><div class="value" style="color:#34d399">${s.on_track || 0}</div><div class="label">On Track</div></div>
  <div class="stat-card"><div class="value" style="color:#fbbf24">${s.at_risk || 0}</div><div class="label">At Risk</div></div>
  <div class="stat-card"><div class="value" style="color:#f87171">${s.off_track || 0}</div><div class="label">Off Track</div></div>
</div>
<div class="section-title">Strategy Staircase</div>
${elements.map(el => {
  const color = typeColors[el.element_type] || "#94a3b8";
  return `<div class="element" style="margin-left:${el.depth * 24}px; border-left-color:${color}">
    <div class="icon" style="color:${color}">${typeSym(el.element_type)}</div>
    <div class="code" style="color:${color}">${el.code || ""}</div>
    <div class="title">${lang === "ar" && el.title_ar ? el.title_ar : el.title}</div>
    <div class="badge" style="background:${healthBg(el.health)};color:${healthFg(el.health)}">${healthLabel(el.health)}</div>
    <div class="progress" style="color:${color}">${el.progress_percent}%</div>
  </div>`;
}).join("\n")}
<div class="footer">
  Generated by ST.AIRS · DEVONEERS · ${new Date().toISOString().split("T")[0]}<br/>
  Read-only strategy snapshot — "Human IS the Loop"
</div>
</body></html>`;

    // Open in new window for print-to-PDF
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      // Give fonts time to load
      setTimeout(() => {
        printWindow.print();
        setGenerating(false);
      }, 800);
    } else {
      // Fallback: download as HTML
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(strategyName || "strategy").replace(/\s+/g, "_")}_export.html`;
      a.click();
      URL.revokeObjectURL(url);
      setGenerating(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={lang === "ar" ? "تصدير الاستراتيجية" : "Export Strategy as PDF"} wide>
      <div className="space-y-4">
        <p className="text-gray-400 text-sm">
          {lang === "ar"
            ? "سيتم فتح نافذة طباعة — اختر 'حفظ كـ PDF' لتنزيل المستند"
            : "A print dialog will open — choose \"Save as PDF\" to download your strategy document."}
        </p>

        <div className="flex gap-2">
          <button onClick={() => setExportMode("full")}
            className={`px-4 py-2 rounded-lg text-xs font-medium border transition ${
              exportMode === "full" ? "border-amber-500/40 bg-amber-500/15 text-amber-300" : "border-[#1e3a5f] text-gray-500"
            }`}>{lang === "ar" ? "كامل الاستراتيجية" : "Full Strategy"}</button>
          <button onClick={() => setExportMode("select")}
            className={`px-4 py-2 rounded-lg text-xs font-medium border transition ${
              exportMode === "select" ? "border-amber-500/40 bg-amber-500/15 text-amber-300" : "border-[#1e3a5f] text-gray-500"
            }`}>{lang === "ar" ? "اختر عناصر" : "Select Elements"}</button>
        </div>

        {exportMode === "select" && (
          <div className="max-h-56 overflow-y-auto p-3 rounded-lg" style={glass(0.3)}>
            {flatNodes.map(node => (
              <label key={node.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-white/5 px-2 rounded"
                style={{ paddingLeft: 8 + node.depth * 16 }}>
                <input type="checkbox" checked={selectedIds.has(node.id)}
                  onChange={() => toggleSelect(node.id)} className="accent-amber-500 rounded" />
                <span style={{ color: typeColors[node.element_type], fontSize: 12 }}>{typeIcons[node.element_type]}</span>
                <span className="text-xs text-gray-300 truncate">{node.code} — {lang === "ar" && node.title_ar ? node.title_ar : node.title}</span>
              </label>
            ))}
          </div>
        )}

        {/* Preview summary */}
        <div className="p-4 rounded-xl text-center" style={glass(0.3)}>
          <div className="text-2xl font-bold mb-1" style={{
            background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            fontFamily: "'Instrument Serif', Georgia, serif"
          }}>ST.AIRS</div>
          <div className="text-gray-500 text-xs">{strategyName}</div>
          <div className="text-gray-600 text-[10px] mt-1">
            {exportMode === "full"
              ? `${flatNodes.length} elements`
              : `${selectedIds.size} of ${flatNodes.length} selected`}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">
            {lang === "ar" ? "إلغاء" : "Cancel"}
          </button>
          <button onClick={generatePDF}
            disabled={generating || (exportMode === "select" && selectedIds.size === 0)}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-[#0a1628] disabled:opacity-40 transition-all hover:scale-[1.02]"
            style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})` }}>
            {generating ? "Generating..." : lang === "ar" ? "↓ تنزيل PDF" : "↓ Download PDF"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP — routes between landing → strategy workspace
// ═══════════════════════════════════════════════════════════════════════════
export default function StairsApp() {
  const [user, setUser] = useState(api.user);
  const [lang, setLang] = useState("en");

  // Strategy management
  const stratStore = useRef(null);
  const [strategies, setStrategies] = useState([]);
  const [activeStrategy, setActiveStrategy] = useState(null);

  // Workspace state (when inside a strategy)
  const [view, setView] = useState("dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [tree, setTree] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [editingStair, setEditingStair] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // Initialize strategy store when user logs in
  useEffect(() => {
    if (user) {
      const store = new StrategyStore(user.id || user.email);
      store.ensureDefaults();
      stratStore.current = store;
      setStrategies(store.getStrategies());
      // Auto-open last active strategy
      const activeId = store.getActiveId();
      if (activeId) {
        const strat = store.getStrategies().find(s => s.id === activeId);
        if (strat) { setActiveStrategy(strat); }
      }
    }
  }, [user]);

  // Load data when a strategy is selected
  const loadData = useCallback(async () => {
    if (!activeStrategy) return;
    setLoading(true); setErr(null);
    try {
      if (activeStrategy.is_backend) {
        const [dash, treeData, alertData] = await Promise.all([
          api.get("/api/v1/dashboard"),
          api.get("/api/v1/stairs/tree"),
          api.get("/api/v1/alerts"),
        ]);
        setDashboard(dash);
        setTree(treeData);
        setAlerts(alertData);
      } else {
        // Local strategy — load from localStorage
        const elements = JSON.parse(localStorage.getItem(`stairs_local_${activeStrategy.id}`) || "[]");
        const treeData = buildLocalTree(elements);
        setTree(treeData);
        setDashboard(buildLocalDashboard(elements));
        setAlerts([]);
      }
    } catch (e) {
      if (e.message === "Session expired") { setUser(null); return; }
      setErr(e.message);
    }
    setLoading(false);
  }, [activeStrategy]);

  useEffect(() => { if (activeStrategy) loadData(); }, [activeStrategy, loadData]);

  // Build tree from flat local elements
  const buildLocalTree = (elements) => {
    const map = {};
    elements.forEach(el => { map[el.id] = { stair: el, children: [] }; });
    const roots = [];
    elements.forEach(el => {
      if (el.parent_id && map[el.parent_id]) map[el.parent_id].children.push(map[el.id]);
      else roots.push(map[el.id]);
    });
    return roots;
  };

  const buildLocalDashboard = (elements) => {
    const on = elements.filter(e => e.health === "on_track").length;
    const at = elements.filter(e => e.health === "at_risk").length;
    const off = elements.filter(e => e.health === "off_track").length;
    const avg = elements.length > 0 ? elements.reduce((s, e) => s + (e.progress_percent || 0), 0) / elements.length : 0;
    return {
      stats: { total_elements: elements.length, on_track: on, at_risk: at, off_track: off, overall_progress: avg, active_alerts: 0, critical_alerts: 0 },
      top_risks: elements.filter(e => e.health === "at_risk" || e.health === "off_track").slice(0, 5),
    };
  };

  // Strategy actions
  const handleSelectStrategy = (strat) => {
    setActiveStrategy(strat);
    stratStore.current?.setActiveId(strat.id);
    setView("dashboard");
  };

  const handleCreateStrategy = (strat) => {
    stratStore.current?.addStrategy(strat);
    setStrategies(stratStore.current?.getStrategies() || []);
  };

  const handleDeleteStrategy = (id) => {
    stratStore.current?.deleteStrategy(id);
    localStorage.removeItem(`stairs_local_${id}`);
    setStrategies(stratStore.current?.getStrategies() || []);
    if (activeStrategy?.id === id) setActiveStrategy(null);
  };

  const handleBackToLanding = () => {
    setActiveStrategy(null);
    stratStore.current?.setActiveId(null);
    setTree([]); setDashboard(null); setAlerts([]);
  };

  // CRUD for stairs
  const handleSaveStair = async (form, existingId) => {
    if (activeStrategy?.is_backend) {
      if (existingId) await api.put(`/api/v1/stairs/${existingId}`, form);
      else await api.post("/api/v1/stairs", form);
    } else {
      // Local strategy
      const elements = JSON.parse(localStorage.getItem(`stairs_local_${activeStrategy.id}`) || "[]");
      if (existingId) {
        const idx = elements.findIndex(e => e.id === existingId);
        if (idx >= 0) elements[idx] = { ...elements[idx], ...form };
      } else {
        elements.push({
          ...form,
          id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          progress_percent: form.progress_percent || 0,
        });
      }
      localStorage.setItem(`stairs_local_${activeStrategy.id}`, JSON.stringify(elements));
    }
    await loadData();
  };

  const handleDeleteStair = async (id) => {
    if (activeStrategy?.is_backend) {
      await api.del(`/api/v1/stairs/${id}`);
    } else {
      const elements = JSON.parse(localStorage.getItem(`stairs_local_${activeStrategy.id}`) || "[]")
        .filter(e => e.id !== id);
      localStorage.setItem(`stairs_local_${activeStrategy.id}`, JSON.stringify(elements));
    }
    await loadData();
  };

  // Move stair up/down among siblings
  const handleMoveStair = async (stairId, direction) => {
    if (activeStrategy?.is_backend) {
      // For backend: we need to swap sort_order with sibling
      // Currently the backend may not have a sort_order field,
      // so we reorder locally and send bulk updates
      // For now, we'll do a visual reorder by swapping in the tree
      // This is a best-effort approach until sort_order is on the backend
      try {
        // Find the stair and its siblings in the flat list
        const flatWithParent = [];
        const walk = (nodes, parentId = null) => {
          nodes.forEach((n, idx) => {
            flatWithParent.push({ id: n.stair.id, parentId, siblingIndex: idx, siblings: nodes });
            if (n.children) walk(n.children, n.stair.id);
          });
        };
        walk(tree);

        const current = flatWithParent.find(f => f.id === stairId);
        if (!current) return;

        const swapIdx = direction === "up" ? current.siblingIndex - 1 : current.siblingIndex + 1;
        if (swapIdx < 0 || swapIdx >= current.siblings.length) return;

        const swapNode = current.siblings[swapIdx];
        // Swap by updating sort_order (or a dummy field)
        // For now, just swap in the tree and re-render
        const temp = current.siblings[current.siblingIndex];
        current.siblings[current.siblingIndex] = current.siblings[swapIdx];
        current.siblings[swapIdx] = temp;
        setTree([...tree]);
      } catch (e) {
        console.error("Move failed:", e);
      }
    } else {
      // Local: reorder in localStorage
      const elements = JSON.parse(localStorage.getItem(`stairs_local_${activeStrategy.id}`) || "[]");
      const idx = elements.findIndex(e => e.id === stairId);
      if (idx < 0) return;
      const el = elements[idx];
      // Find siblings (same parent_id)
      const siblings = elements.filter(e => e.parent_id === el.parent_id);
      const sibIdx = siblings.findIndex(s => s.id === stairId);
      const swapIdx = direction === "up" ? sibIdx - 1 : sibIdx + 1;
      if (swapIdx < 0 || swapIdx >= siblings.length) return;
      // Swap positions in the main array
      const aGlobalIdx = elements.findIndex(e => e.id === siblings[sibIdx].id);
      const bGlobalIdx = elements.findIndex(e => e.id === siblings[swapIdx].id);
      [elements[aGlobalIdx], elements[bGlobalIdx]] = [elements[bGlobalIdx], elements[aGlobalIdx]];
      localStorage.setItem(`stairs_local_${activeStrategy.id}`, JSON.stringify(elements));
      await loadData();
    }
  };

  const handleLogin = (u) => setUser(u);
  const handleLogout = () => { api.logout(); setUser(null); setActiveStrategy(null); };

  // ─── RENDER ───────────────────────────────────────────────────────────

  if (!user) return <LoginScreen onLogin={handleLogin} lang={lang} />;

  // Landing page (no strategy selected)
  if (!activeStrategy) {
    return <StrategyLanding
      strategies={strategies}
      onSelect={handleSelectStrategy}
      onCreate={handleCreateStrategy}
      onDelete={handleDeleteStrategy}
      userName={user.full_name || user.email}
      lang={lang}
      onLogout={handleLogout}
      onLangToggle={() => setLang(l => l === "en" ? "ar" : "en")}
    />;
  }

  // Strategy workspace
  const navItems = [
    { key: "dashboard", icon: "◫", label: lang === "ar" ? "لوحة التحكم" : "Dashboard" },
    { key: "staircase", icon: "🪜", label: lang === "ar" ? "السلم" : "Staircase" },
    { key: "ai", icon: "◉", label: lang === "ar" ? "المستشار" : "AI Advisor" },
    { key: "alerts", icon: "⚡", label: lang === "ar" ? "التنبيهات" : "Alerts" },
  ];

  return (
    <div className="min-h-screen text-white" dir={lang === "ar" ? "rtl" : "ltr"}
      style={{
        background: `linear-gradient(180deg, ${DEEP} 0%, #0f1f3a 50%, ${DEEP} 100%)`,
        fontFamily: lang === "ar" ? "'Noto Kufi Arabic', sans-serif" : "'DM Sans', system-ui, sans-serif"
      }}>
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl px-4 py-3 flex items-center gap-3"
        style={{ background: "rgba(10, 22, 40, 0.9)", borderBottom: `1px solid ${BORDER}` }}>
        {/* Back button */}
        <button onClick={handleBackToLanding}
          className="text-gray-500 hover:text-white transition p-1.5 rounded-lg hover:bg-white/5"
          title={lang === "ar" ? "رجوع" : "Back to strategies"}>
          ←
        </button>
        {/* Strategy name */}
        <div className="flex items-center gap-2 mr-2">
          <span className="text-lg">{activeStrategy.icon}</span>
          <div>
            <div className="text-sm font-semibold text-white leading-tight">{activeStrategy.name}</div>
            <div className="text-[10px] text-gray-600">{activeStrategy.company}</div>
          </div>
        </div>
        {/* Nav */}
        <nav className="flex-1 flex justify-center gap-1">
          {navItems.map(n => (
            <button key={n.key} onClick={() => setView(n.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                view === n.key ? "bg-amber-500/15 text-amber-300 border border-amber-500/20" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              }`}>
              <span className="mr-1">{n.icon}</span>{n.label}
              {n.key === "alerts" && alerts.length > 0 && (
                <span className="ml-1 bg-red-500/80 text-white text-[9px] px-1.5 py-0.5 rounded-full">{alerts.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <button onClick={() => setLang(l => l === "en" ? "ar" : "en")}
            className="text-xs text-gray-500 hover:text-amber-400 transition px-2 py-1 rounded border border-transparent hover:border-amber-500/20">
            {lang === "en" ? "عربي" : "EN"}
          </button>
          <button onClick={handleLogout} className="text-xs text-gray-600 hover:text-gray-300 transition">
            {user.full_name} ↗
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {err && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-center gap-2">
            <span>⚠️ {err}</span>
            <button onClick={loadData} className="ml-auto text-xs underline">{lang === "ar" ? "إعادة" : "Retry"}</button>
          </div>
        )}
        {loading && view !== "ai" ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {view === "dashboard" && <DashboardView data={dashboard} lang={lang} />}
            {view === "staircase" && (
              <StaircaseView tree={tree} lang={lang}
                onEdit={(s) => { setEditingStair(s); setEditorOpen(true); }}
                onAdd={() => { setEditingStair(null); setEditorOpen(true); }}
                onExport={() => setExportOpen(true)}
                onMove={handleMoveStair} />
            )}
            {view === "ai" && <AIChatView lang={lang} userId={user?.id || user?.email} />}
            {view === "alerts" && <AlertsView alerts={alerts} lang={lang} />}
          </>
        )}
      </main>

      <footer className="text-center py-6 text-gray-700 text-[10px] tracking-widest uppercase">
        By DEVONEERS • ST.AIRS v3.2 • {new Date().getFullYear()}
      </footer>

      {/* Modals */}
      <StairEditor open={editorOpen}
        onClose={() => { setEditorOpen(false); setEditingStair(null); }}
        stair={editingStair} allStairs={tree}
        onSave={handleSaveStair} onDelete={handleDeleteStair} lang={lang} />

      <ExportPDF open={exportOpen} onClose={() => setExportOpen(false)}
        tree={tree} dashboard={dashboard} lang={lang}
        strategyName={activeStrategy?.name} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500&family=Noto+Kufi+Arabic:wght@400;500;700&display=swap');
        * { scrollbar-width: thin; scrollbar-color: rgba(184,144,74,0.15) transparent; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(184,144,74,0.15); border-radius: 3px; }
      `}</style>
    </div>
  );
}
