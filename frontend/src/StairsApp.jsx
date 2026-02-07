import { useState, useEffect, useCallback, useRef, useMemo } from "react";

const API = "https://stairs-production.up.railway.app";

// ═══════════════════════════════════════════════════════════════════════════
// API Client — now with PUT, DELETE, conversation persistence
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
    this.token = null;
    this.user = null;
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
// Local AI Conversation Storage (bridges until backend endpoints are wired)
// Persists in localStorage per-user, survives tab switches & refreshes
// ═══════════════════════════════════════════════════════════════════════════
class ConversationStore {
  constructor(userId) {
    this.prefix = `stairs_conv_${userId}`;
  }
  _key(k) { return `${this.prefix}_${k}`; }

  getConversations() {
    try {
      return JSON.parse(localStorage.getItem(this._key("list")) || "[]");
    } catch { return []; }
  }

  saveConversation(conv) {
    const list = this.getConversations();
    const idx = list.findIndex(c => c.id === conv.id);
    if (idx >= 0) list[idx] = conv;
    else list.unshift(conv);
    localStorage.setItem(this._key("list"), JSON.stringify(list));
  }

  deleteConversation(id) {
    const list = this.getConversations().filter(c => c.id !== id);
    localStorage.setItem(this._key("list"), JSON.stringify(list));
    localStorage.removeItem(this._key(`msgs_${id}`));
  }

  getMessages(convId) {
    try {
      return JSON.parse(localStorage.getItem(this._key(`msgs_${convId}`)) || "[]");
    } catch { return []; }
  }

  saveMessages(convId, messages) {
    localStorage.setItem(this._key(`msgs_${convId}`), JSON.stringify(messages));
  }

  createConversation(title) {
    const conv = {
      id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: title || "New conversation",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message_count: 0,
    };
    this.saveConversation(conv);
    return conv;
  }

  getActiveConversationId() {
    return localStorage.getItem(this._key("active")) || null;
  }

  setActiveConversationId(id) {
    if (id) localStorage.setItem(this._key("active"), id);
    else localStorage.removeItem(this._key("active"));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Translations
// ═══════════════════════════════════════════════════════════════════════════
const t = {
  en: {
    title: "ST.AIRS", subtitle: "Strategic Staircase",
    dashboard: "Dashboard", staircase: "Staircase", ai: "AI Advisor",
    alerts: "Alerts", knowledge: "Knowledge",
    login: "Sign In", email: "Email", password: "Password",
    totalElements: "Total Elements", overallProgress: "Overall Progress",
    onTrack: "On Track", atRisk: "At Risk", offTrack: "Off Track",
    critical: "Critical", high: "High", info: "Info",
    send: "Send", askAI: "Ask the strategy AI anything...",
    health: "Health", progress: "Progress", confidence: "Confidence",
    risk: "Risk Score", vision: "Vision", objective: "Objective",
    key_result: "Key Result", initiative: "Initiative", task: "Task",
    loading: "Loading...", error: "Error", retry: "Retry",
    byDevoneers: "By DEVONEERS", langSwitch: "عربي",
    save: "Save", cancel: "Cancel", edit: "Edit", delete: "Delete",
    addElement: "Add Element", editElement: "Edit Element",
    title_field: "Title", description: "Description",
    parent: "Parent Element", type: "Type", healthStatus: "Health Status",
    exportStrategy: "Export Strategy", readOnly: "Read-Only View",
    exportPDF: "Export PDF", copyLink: "Copy Shareable",
    conversations: "Conversations", newChat: "New Chat",
    noConversations: "No conversations yet",
    deleteConv: "Delete", loadConv: "Open",
    selectParent: "Select parent...", none: "None (top level)",
    created: "Created", updated: "Updated",
    exportTitle: "Strategy Export", exportDesc: "Read-only snapshot of your strategy",
    close: "Close", fullExport: "Full Strategy", selectExport: "Select Elements",
    snapshot: "Snapshot", strategySummary: "Strategy Summary",
  },
  ar: {
    title: "ستيرز", subtitle: "السلم الاستراتيجي",
    dashboard: "لوحة التحكم", staircase: "السلم", ai: "المستشار الذكي",
    alerts: "التنبيهات", knowledge: "المعرفة",
    login: "تسجيل الدخول", email: "البريد الإلكتروني", password: "كلمة المرور",
    totalElements: "إجمالي العناصر", overallProgress: "التقدم العام",
    onTrack: "على المسار", atRisk: "معرض للخطر", offTrack: "خارج المسار",
    critical: "حرج", high: "عالي", info: "معلومات",
    send: "إرسال", askAI: "اسأل الذكاء الاصطناعي عن استراتيجيتك...",
    health: "الحالة", progress: "التقدم", confidence: "الثقة",
    risk: "درجة الخطر", vision: "الرؤية", objective: "الهدف",
    key_result: "نتيجة رئيسية", initiative: "مبادرة", task: "مهمة",
    loading: "جارٍ التحميل...", error: "خطأ", retry: "إعادة المحاولة",
    byDevoneers: "من ديفونيرز", langSwitch: "EN",
    save: "حفظ", cancel: "إلغاء", edit: "تعديل", delete: "حذف",
    addElement: "إضافة عنصر", editElement: "تعديل العنصر",
    title_field: "العنوان", description: "الوصف",
    parent: "العنصر الأب", type: "النوع", healthStatus: "حالة الصحة",
    exportStrategy: "تصدير الاستراتيجية", readOnly: "عرض للقراءة فقط",
    exportPDF: "تصدير PDF", copyLink: "نسخ رابط",
    conversations: "المحادثات", newChat: "محادثة جديدة",
    noConversations: "لا توجد محادثات بعد",
    deleteConv: "حذف", loadConv: "فتح",
    selectParent: "اختر الأب...", none: "لا يوجد (مستوى أعلى)",
    created: "أنشئ", updated: "آخر تحديث",
    exportTitle: "تصدير الاستراتيجية", exportDesc: "لقطة للقراءة فقط من استراتيجيتك",
    close: "إغلاق", fullExport: "كامل الاستراتيجية", selectExport: "اختر العناصر",
    snapshot: "لقطة", strategySummary: "ملخص الاستراتيجية",
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// Shared UI Components
// ═══════════════════════════════════════════════════════════════════════════

const GOLD = "#B8904A";
const TEAL = "#2A5C5C";
const CHAMPAGNE = "#F7E7CE";

const typeColors = {
  vision: GOLD, objective: "#60a5fa", key_result: "#34d399",
  initiative: "#a78bfa", task: "#94a3b8",
};
const typeIcons = {
  vision: "◆", objective: "▣", key_result: "◎", initiative: "▶", task: "•"
};
const healthColors = {
  on_track: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  at_risk: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  off_track: "bg-red-500/20 text-red-300 border-red-500/30",
  achieved: "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

const HealthBadge = ({ health, size = "sm" }) => {
  const dots = { on_track: "●", at_risk: "●", off_track: "○", achieved: "★" };
  const cls = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-3 py-1";
  return (
    <span className={`${cls} rounded-full border font-medium ${healthColors[health] || healthColors.at_risk}`}>
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

// Glass panel background helper
const glass = (opacity = 0.6) => ({
  background: `rgba(22, 37, 68, ${opacity})`,
  border: "1px solid rgba(30, 58, 95, 0.5)",
});

// ═══════════════════════════════════════════════════════════════════════════
// Modal Component
// ═══════════════════════════════════════════════════════════════════════════
const Modal = ({ open, onClose, title, children, wide }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className={`relative z-10 w-full ${wide ? "max-w-4xl" : "max-w-lg"} max-h-[85vh] flex flex-col rounded-2xl overflow-hidden`}
        style={{ background: "rgba(15, 25, 50, 0.95)", border: `1px solid ${GOLD}33` }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: `1px solid ${GOLD}22` }}>
          <h2 className="text-white font-semibold text-lg">{title}</h2>
          <button onClick={onClose}
            className="text-gray-500 hover:text-white transition text-xl leading-none p-1">✕</button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Login Screen
// ═══════════════════════════════════════════════════════════════════════════
const LoginScreen = ({ onLogin, lang }) => {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const L = t[lang];

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setErr("");
    try {
      await api.login(email, pass);
      onLogin(api.user);
    } catch {
      setErr(lang === "ar" ? "فشل تسجيل الدخول" : "Invalid credentials");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{
      background: "linear-gradient(135deg, #0a1628 0%, #162544 40%, #1a3055 70%, #0f1f3a 100%)"
    }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="absolute border rounded-full"
            style={{
              borderColor: `${GOLD}08`,
              width: 200 + i * 150, height: 200 + i * 150,
              top: "50%", left: "50%",
              transform: `translate(-50%, -50%) rotate(${i * 15}deg)`,
              animation: `spin ${30 + i * 10}s linear infinite`,
            }} />
        ))}
      </div>
      <form onSubmit={handleLogin}
        className="relative z-10 w-full max-w-md p-8 rounded-2xl backdrop-blur-xl"
        style={{ background: "rgba(22, 37, 68, 0.8)", border: `1px solid ${GOLD}33` }}
        dir={lang === "ar" ? "rtl" : "ltr"}>
        <div className="text-center mb-8">
          <div className="text-5xl font-bold tracking-tight mb-1" style={{
            background: `linear-gradient(135deg, ${GOLD}, #e8b94a, ${CHAMPAGNE})`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            fontFamily: "'Instrument Serif', Georgia, serif"
          }}>ST.AIRS</div>
          <div className="text-gray-400 text-sm tracking-widest uppercase mt-1">{L.subtitle}</div>
          <div className="w-12 h-0.5 mx-auto mt-3" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        </div>
        <div className="space-y-4">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder={L.email} required
            className="w-full px-4 py-3 rounded-lg bg-[#0a1628]/60 border border-[#1e3a5f] text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none transition" />
          <input type="password" value={pass} onChange={e => setPass(e.target.value)}
            placeholder={L.password} required
            className="w-full px-4 py-3 rounded-lg bg-[#0a1628]/60 border border-[#1e3a5f] text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none transition" />
        </div>
        {err && <div className="mt-3 text-red-400 text-sm text-center">{err}</div>}
        <button type="submit" disabled={loading}
          className="w-full mt-6 py-3 rounded-lg font-semibold text-[#0a1628] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${GOLD}, #e8b94a)` }}>
          {loading ? "..." : L.login}
        </button>
        <div className="text-center mt-6 text-gray-600 text-xs">{L.byDevoneers}</div>
      </form>
      <style>{`@keyframes spin { to { transform: translate(-50%,-50%) rotate(360deg) } }`}</style>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard View
// ═══════════════════════════════════════════════════════════════════════════
const DashboardView = ({ data, lang }) => {
  const s = data?.stats || {};
  const L = t[lang];
  const stats = [
    { label: L.totalElements, value: s.total_elements || 0, color: "#60a5fa" },
    { label: L.onTrack, value: s.on_track || 0, color: "#34d399" },
    { label: L.atRisk, value: s.at_risk || 0, color: "#fbbf24" },
    { label: L.offTrack, value: s.off_track || 0, color: "#f87171" },
  ];
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6 p-6 rounded-2xl" style={glass()}>
        <ProgressRing percent={s.overall_progress || 0} size={120} stroke={8} />
        <div>
          <div className="text-gray-400 text-sm">{L.overallProgress}</div>
          <div className="text-3xl font-bold text-white">{Math.round(s.overall_progress || 0)}%</div>
          <div className="text-gray-500 text-xs mt-1">{s.active_alerts || 0} active alerts ({s.critical_alerts || 0} critical)</div>
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
                  <div className="text-gray-500 text-xs">{r.description?.slice(0, 60)}...</div>
                </div>
                <HealthBadge health={r.health} />
                <div className="text-right w-12">
                  <div className="text-white text-sm font-medium">{r.progress_percent}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {data?.recent_progress?.length > 0 && (
        <div>
          <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">Recent Progress</h3>
          <div className="space-y-1.5">
            {data.recent_progress.slice(0, 5).map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg text-sm" style={glass(0.3)}>
                <div className="text-gray-500 text-xs w-20 shrink-0">{p.snapshot_date}</div>
                <div className="flex-1">
                  <div className="h-1.5 rounded-full bg-[#1e3a5f] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{
                      width: `${p.progress_percent}%`,
                      background: p.health === "on_track" ? "#34d399" : p.health === "at_risk" ? "#fbbf24" : "#f87171"
                    }} />
                  </div>
                </div>
                <div className="text-gray-300 text-xs w-10 text-right">{p.progress_percent}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Stair Editor Modal — Create or Edit a strategic element
// ═══════════════════════════════════════════════════════════════════════════
const StairEditor = ({ open, onClose, stair, allStairs, onSave, onDelete, lang }) => {
  const L = t[lang];
  const isNew = !stair?.id;
  const [form, setForm] = useState({
    title: "", title_ar: "", description: "", description_ar: "",
    element_type: "objective", health: "on_track",
    progress_percent: 0, parent_id: null, code: "",
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (stair) {
      setForm({
        title: stair.title || "",
        title_ar: stair.title_ar || "",
        description: stair.description || "",
        description_ar: stair.description_ar || "",
        element_type: stair.element_type || "objective",
        health: stair.health || "on_track",
        progress_percent: stair.progress_percent || 0,
        parent_id: stair.parent_id || null,
        code: stair.code || "",
      });
    } else {
      setForm({
        title: "", title_ar: "", description: "", description_ar: "",
        element_type: "objective", health: "on_track",
        progress_percent: 0, parent_id: null, code: "",
      });
    }
    setConfirmDelete(false);
  }, [stair, open]);

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await onSave(form, stair?.id);
      onClose();
    } catch (e) {
      alert(e.message);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    try {
      await onDelete(stair.id);
      onClose();
    } catch (e) {
      alert(e.message);
    }
    setSaving(false);
  };

  // Flatten tree to get a list of all possible parents
  const parentOptions = useMemo(() => {
    if (!allStairs) return [];
    const flat = [];
    const walk = (nodes, depth = 0) => {
      nodes.forEach(n => {
        if (!stair || n.stair.id !== stair.id) {
          flat.push({ id: n.stair.id, label: `${"  ".repeat(depth)}${n.stair.code} — ${n.stair.title}`, type: n.stair.element_type });
        }
        if (n.children) walk(n.children, depth + 1);
      });
    };
    walk(allStairs);
    return flat;
  }, [allStairs, stair]);

  const inputClass = "w-full px-3 py-2.5 rounded-lg bg-[#0a1628]/80 border border-[#1e3a5f] text-white placeholder-gray-600 focus:border-amber-500/40 focus:outline-none transition text-sm";
  const labelClass = "text-gray-400 text-xs uppercase tracking-wider mb-1.5 block";

  return (
    <Modal open={open} onClose={onClose} title={isNew ? L.addElement : L.editElement}>
      <div className="space-y-4">
        {/* Type */}
        <div>
          <label className={labelClass}>{L.type}</label>
          <div className="flex gap-2 flex-wrap">
            {["vision", "objective", "key_result", "initiative", "task"].map(tp => (
              <button key={tp} onClick={() => setForm(f => ({ ...f, element_type: tp }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  form.element_type === tp
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                    : "border-[#1e3a5f] text-gray-500 hover:text-gray-300"
                }`}>
                <span style={{ color: typeColors[tp] }}>{typeIcons[tp]}</span> {L[tp] || tp}
              </button>
            ))}
          </div>
        </div>

        {/* Code */}
        <div>
          <label className={labelClass}>Code (e.g., OBJ-001)</label>
          <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
            placeholder="OBJ-001" className={inputClass} />
        </div>

        {/* Title EN */}
        <div>
          <label className={labelClass}>{L.title_field} (EN)</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Strategic element title..." className={inputClass} />
        </div>

        {/* Title AR */}
        <div>
          <label className={labelClass}>{L.title_field} (AR)</label>
          <input value={form.title_ar} onChange={e => setForm(f => ({ ...f, title_ar: e.target.value }))}
            placeholder="العنوان بالعربية..." className={inputClass} dir="rtl" />
        </div>

        {/* Description */}
        <div>
          <label className={labelClass}>{L.description}</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Describe this element..." rows={3}
            className={`${inputClass} resize-none`} />
        </div>

        {/* Parent */}
        <div>
          <label className={labelClass}>{L.parent}</label>
          <select value={form.parent_id || ""}
            onChange={e => setForm(f => ({ ...f, parent_id: e.target.value || null }))}
            className={inputClass}>
            <option value="">{L.none}</option>
            {parentOptions.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Health */}
        <div>
          <label className={labelClass}>{L.healthStatus}</label>
          <div className="flex gap-2 flex-wrap">
            {["on_track", "at_risk", "off_track", "achieved"].map(h => (
              <button key={h} onClick={() => setForm(f => ({ ...f, health: h }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  form.health === h
                    ? healthColors[h]
                    : "border-[#1e3a5f] text-gray-500 hover:text-gray-300"
                }`}>
                {h.replace("_", " ").toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Progress */}
        <div>
          <label className={labelClass}>{L.progress}: {form.progress_percent}%</label>
          <input type="range" min={0} max={100} value={form.progress_percent}
            onChange={e => setForm(f => ({ ...f, progress_percent: parseInt(e.target.value) }))}
            className="w-full accent-amber-500" />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-4" style={{ borderTop: "1px solid rgba(30, 58, 95, 0.5)" }}>
          {!isNew && (
            <button onClick={handleDelete}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                confirmDelete
                  ? "bg-red-500/30 text-red-200 border border-red-500/50"
                  : "text-red-400/60 hover:text-red-300 hover:bg-red-500/10"
              }`}>
              {confirmDelete ? "Confirm delete?" : L.delete}
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">
            {L.cancel}
          </button>
          <button onClick={handleSave} disabled={saving || !form.title.trim()}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-[#0a1628] transition-all hover:scale-[1.02] disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, ${GOLD}, #e8b94a)` }}>
            {saving ? "..." : L.save}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Staircase View — with inline editing + add element
// ═══════════════════════════════════════════════════════════════════════════
const StaircaseView = ({ tree, lang, onEdit, onAdd, onExport }) => {
  const L = t[lang];

  const renderStair = (node, depth = 0) => {
    const s = node.stair;
    const color = typeColors[s.element_type] || "#94a3b8";
    return (
      <div key={s.id} style={{ marginLeft: depth * 28 }}>
        <div className="group flex items-center gap-3 p-3 rounded-xl my-1.5 transition-all hover:scale-[1.005] cursor-pointer"
          style={{ background: `rgba(22, 37, 68, ${0.7 - depth * 0.08})`, borderLeft: `3px solid ${color}` }}
          onClick={() => onEdit(s)}>
          <span style={{ color, fontSize: 18 }}>{typeIcons[s.element_type] || "•"}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono opacity-50" style={{ color }}>{s.code}</span>
              <span className="text-white text-sm font-medium truncate">
                {lang === "ar" && s.title_ar ? s.title_ar : s.title}
              </span>
            </div>
            {s.description && (
              <div className="text-gray-500 text-xs mt-0.5 truncate max-w-md">{s.description}</div>
            )}
          </div>
          <HealthBadge health={s.health} />
          <div className="w-16 text-right">
            <div className="text-xs font-medium" style={{ color }}>{s.progress_percent}%</div>
            <div className="h-1 rounded-full bg-[#1e3a5f] mt-1 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${s.progress_percent}%`, background: color, transition: "width 0.8s ease" }} />
            </div>
          </div>
          {/* Edit indicator on hover */}
          <div className="opacity-0 group-hover:opacity-100 transition text-gray-600 text-xs">
            ✎
          </div>
        </div>
        {node.children?.map(child => renderStair(child, depth + 1))}
      </div>
    );
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ background: `${GOLD}22`, border: `1px solid ${GOLD}33`, color: GOLD }}>
          <span className="text-lg leading-none">+</span> {L.addElement}
        </button>
        <div className="flex-1" />
        <button onClick={onExport}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white transition"
          style={{ border: "1px solid rgba(30, 58, 95, 0.5)" }}>
          ↗ {L.exportStrategy}
        </button>
      </div>
      {/* Tree */}
      {!tree?.length
        ? <div className="text-gray-500 text-center py-12">{L.loading}</div>
        : <div className="space-y-1">{tree.map(node => renderStair(node, 0))}</div>
      }
      {/* Help hint */}
      <div className="text-center text-gray-600 text-xs mt-6 italic">
        {lang === "ar" ? "انقر على أي عنصر للتعديل" : "Click any element to edit it"}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// AI Chat View — with persistent conversations & history panel
// ═══════════════════════════════════════════════════════════════════════════
const AIChatView = ({ lang, userId }) => {
  const L = t[lang];
  const storeRef = useRef(null);
  if (!storeRef.current && userId) {
    storeRef.current = new ConversationStore(userId);
  }
  const store = storeRef.current;

  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef(null);

  // Load conversations list and restore active conversation
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

  const welcomeMessage = () => ({
    role: "ai",
    text: lang === "ar"
      ? "مرحباً! أنا المستشار الاستراتيجي الذكي لمنصة ستيرز. كيف يمكنني مساعدتك في تحليل استراتيجيتك؟"
      : "Welcome! I'm the ST.AIRS Strategy Advisor. I have full context of your staircase — ask me anything about risks, opportunities, or strategic moves.",
    ts: new Date().toISOString(),
  });

  const createNewChat = () => {
    if (!store) return;
    const conv = store.createConversation(lang === "ar" ? "محادثة جديدة" : "New conversation");
    const welcome = [welcomeMessage()];
    store.saveMessages(conv.id, welcome);
    store.setActiveConversationId(conv.id);
    setActiveConvId(conv.id);
    setMessages(welcome);
    setConversations(store.getConversations());
  };

  const loadConversation = (convId) => {
    if (!store) return;
    store.setActiveConversationId(convId);
    setActiveConvId(convId);
    setMessages(store.getMessages(convId));
    setShowHistory(false);
  };

  const deleteConversation = (convId) => {
    if (!store) return;
    store.deleteConversation(convId);
    const remaining = store.getConversations();
    setConversations(remaining);
    if (convId === activeConvId) {
      if (remaining.length > 0) {
        loadConversation(remaining[0].id);
      } else {
        setActiveConvId(null);
        setMessages([]);
      }
    }
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput("");

    // Auto-create conversation if none exists
    let convId = activeConvId;
    if (!convId && store) {
      const conv = store.createConversation(msg.slice(0, 50));
      const welcome = [welcomeMessage()];
      store.saveMessages(conv.id, welcome);
      store.setActiveConversationId(conv.id);
      convId = conv.id;
      setActiveConvId(conv.id);
      setConversations(store.getConversations());
      setMessages(welcome);
    }

    const userMsg = { role: "user", text: msg, ts: new Date().toISOString() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    if (store && convId) store.saveMessages(convId, newMsgs);

    setLoading(true);
    try {
      const res = await api.post("/api/v1/ai/chat", { message: msg });
      const aiMsg = {
        role: "ai", text: res.response,
        tokens: res.tokens_used, actions: res.actions,
        ts: new Date().toISOString(),
      };
      const finalMsgs = [...newMsgs, aiMsg];
      setMessages(finalMsgs);

      if (store && convId) {
        store.saveMessages(convId, finalMsgs);
        // Update conversation title from first user message
        const conv = store.getConversations().find(c => c.id === convId);
        if (conv) {
          if (conv.title === "New conversation" || conv.title === "محادثة جديدة") {
            conv.title = msg.slice(0, 60);
          }
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
    : ["What are our biggest risks?", "Analyze the vision progress", "Suggest next steps for KR-001"];

  const activeConv = conversations.find(c => c.id === activeConvId);

  return (
    <div className="flex h-[calc(100vh-180px)] gap-3">
      {/* History sidebar */}
      <div className={`${showHistory ? "w-64 opacity-100" : "w-0 opacity-0 overflow-hidden"} transition-all duration-300 flex flex-col rounded-xl shrink-0`}
        style={glass(0.5)}>
        <div className="flex items-center justify-between px-3 py-3" style={{ borderBottom: "1px solid rgba(30,58,95,0.4)" }}>
          <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">{L.conversations}</span>
          <button onClick={createNewChat}
            className="text-xs px-2 py-1 rounded-md text-amber-400 hover:bg-amber-500/10 transition"
            title={L.newChat}>+ {L.newChat}</button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {conversations.length === 0 ? (
            <div className="text-gray-600 text-xs text-center py-6">{L.noConversations}</div>
          ) : conversations.map(conv => (
            <div key={conv.id}
              className={`group px-3 py-2.5 mx-1 my-0.5 rounded-lg cursor-pointer transition ${
                conv.id === activeConvId
                  ? "bg-amber-500/10 border border-amber-500/20"
                  : "hover:bg-white/5 border border-transparent"
              }`}
              onClick={() => loadConversation(conv.id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm text-white truncate flex-1">{conv.title}</div>
                <button onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 text-xs transition shrink-0">
                  ✕
                </button>
              </div>
              <div className="text-[10px] text-gray-600 mt-0.5">
                {conv.message_count || 0} msgs · {new Date(conv.updated_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setShowHistory(!showHistory)}
            className={`p-2 rounded-lg transition ${showHistory ? "bg-amber-500/15 text-amber-400" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"}`}
            title={L.conversations}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="2" width="14" height="2" rx="1" />
              <rect x="1" y="7" width="14" height="2" rx="1" />
              <rect x="1" y="12" width="14" height="2" rx="1" />
            </svg>
          </button>
          {activeConv && (
            <span className="text-sm text-gray-400 truncate">{activeConv.title}</span>
          )}
          <div className="flex-1" />
          <button onClick={createNewChat}
            className="text-xs px-3 py-1.5 rounded-lg text-amber-400/70 border border-amber-500/20 hover:bg-amber-500/10 transition">
            + {L.newChat}
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 pb-4 px-1">
          {messages.length === 0 && (
            <div className="text-gray-600 text-center py-12 text-sm">
              {lang === "ar" ? "ابدأ محادثة جديدة مع المستشار الذكي" : "Start a new conversation with the Strategy Advisor"}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-amber-500/20 text-amber-100 rounded-br-md"
                  : m.error
                    ? "bg-red-500/10 text-red-300 rounded-bl-md border border-red-500/20"
                    : "bg-[#162544] text-gray-200 rounded-bl-md border border-[#1e3a5f]"
              }`}>
                <div className="whitespace-pre-wrap">{m.text}</div>
                {m.tokens > 0 && (
                  <div className="text-[10px] text-gray-600 mt-2 text-right">{m.tokens} tokens</div>
                )}
                {m.actions?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {m.actions.map((a, j) => (
                      <div key={j} className="text-xs text-amber-400/70 pl-2 border-l border-amber-500/20">
                        → {a.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-1 px-4 py-2">
              {[0,1,2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-amber-500/40 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Quick prompts */}
        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {quickPrompts.map((q, i) => (
              <button key={i} onClick={() => setInput(q)}
                className="text-xs px-3 py-1.5 rounded-full border border-amber-500/20 text-amber-400/70 hover:bg-amber-500/10 transition">
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder={L.askAI} disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl bg-[#0a1628]/60 border border-[#1e3a5f] text-white placeholder-gray-600 focus:border-amber-500/40 focus:outline-none transition text-sm" />
          <button onClick={send} disabled={loading || !input.trim()}
            className="px-5 py-3 rounded-xl font-medium text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
            style={{ background: `linear-gradient(135deg, ${GOLD}, #e8b94a)`, color: "#0a1628" }}>
            {L.send}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Alerts View
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
                <div className={`font-medium text-sm ${sev.text}`}>
                  {lang === "ar" && a.title_ar ? a.title_ar : a.title}
                </div>
                <div className="text-gray-400 text-xs mt-1">
                  {lang === "ar" && a.description_ar ? a.description_ar : a.description}
                </div>
                {a.recommended_actions?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {a.recommended_actions.map((act, j) => (
                      <div key={j} className="text-xs text-gray-500 flex gap-2">
                        <span className="text-amber-500/50">→</span> {act}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[10px] uppercase tracking-wider opacity-60 font-medium"
                style={{ color: sev.text.includes("red") ? "#f87171" : sev.text.includes("amber") ? "#fbbf24" : "#60a5fa" }}>
                {a.severity}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Read-Only Strategy Export View
// ═══════════════════════════════════════════════════════════════════════════
const ExportView = ({ open, onClose, tree, dashboard, lang }) => {
  const L = t[lang];
  const [exportMode, setExportMode] = useState("full"); // "full" or "select"
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [copied, setCopied] = useState(false);
  const exportRef = useRef(null);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Flatten tree for selection
  const flatNodes = useMemo(() => {
    const flat = [];
    const walk = (nodes, depth = 0) => {
      nodes?.forEach(n => {
        flat.push({ ...n.stair, depth, hasChildren: n.children?.length > 0 });
        if (n.children) walk(n.children, depth + 1);
      });
    };
    walk(tree);
    return flat;
  }, [tree]);

  // Filter tree for export
  const filterTree = (nodes) => {
    if (exportMode === "full") return nodes;
    return nodes?.map(n => {
      if (selectedIds.has(n.stair.id)) {
        return { ...n, children: filterTree(n.children) };
      }
      const filteredChildren = filterTree(n.children);
      if (filteredChildren?.length > 0) {
        return { ...n, children: filteredChildren };
      }
      return null;
    }).filter(Boolean) || [];
  };

  const exportTree = useMemo(() => filterTree(tree), [tree, exportMode, selectedIds]);

  // Generate plain text export
  const generateText = () => {
    const s = dashboard?.stats || {};
    let text = `═══════════════════════════════════════\n`;
    text += `  ST.AIRS — Strategy Snapshot\n`;
    text += `  ${new Date().toLocaleDateString()} · Read-Only Export\n`;
    text += `═══════════════════════════════════════\n\n`;
    text += `Overall Progress: ${Math.round(s.overall_progress || 0)}%\n`;
    text += `Elements: ${s.total_elements || 0} | On Track: ${s.on_track || 0} | At Risk: ${s.at_risk || 0} | Off Track: ${s.off_track || 0}\n\n`;
    text += `───────────────────────────────────────\n`;
    text += `  STRATEGY STAIRCASE\n`;
    text += `───────────────────────────────────────\n\n`;

    const walk = (nodes, depth = 0) => {
      nodes?.forEach(n => {
        const s = n.stair;
        const indent = "  ".repeat(depth);
        const title = lang === "ar" && s.title_ar ? s.title_ar : s.title;
        text += `${indent}${typeIcons[s.element_type] || "•"} [${s.code}] ${title}\n`;
        text += `${indent}  Health: ${s.health?.replace("_", " ")} | Progress: ${s.progress_percent}%\n`;
        if (s.description) {
          text += `${indent}  ${s.description.slice(0, 100)}${s.description.length > 100 ? "..." : ""}\n`;
        }
        text += `\n`;
        if (n.children) walk(n.children, depth + 1);
      });
    };
    walk(exportTree);

    text += `\n───────────────────────────────────────\n`;
    text += `  Generated by ST.AIRS · DEVONEERS\n`;
    text += `  ${new Date().toISOString()}\n`;
    return text;
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generateText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = generateText();
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderExportStair = (node, depth = 0) => {
    const s = node.stair;
    const color = typeColors[s.element_type] || "#94a3b8";
    return (
      <div key={s.id} style={{ marginLeft: depth * 24 }}>
        <div className="flex items-center gap-2 p-2 rounded-lg my-1"
          style={{ background: `rgba(22, 37, 68, ${0.5 - depth * 0.06})`, borderLeft: `2px solid ${color}` }}>
          <span style={{ color, fontSize: 14 }}>{typeIcons[s.element_type] || "•"}</span>
          <span className="text-[10px] font-mono opacity-40" style={{ color }}>{s.code}</span>
          <span className="text-white text-xs font-medium truncate flex-1">
            {lang === "ar" && s.title_ar ? s.title_ar : s.title}
          </span>
          <HealthBadge health={s.health} size="sm" />
          <span className="text-[10px] font-medium" style={{ color }}>{s.progress_percent}%</span>
        </div>
        {node.children?.map(child => renderExportStair(child, depth + 1))}
      </div>
    );
  };

  const stats = dashboard?.stats || {};

  return (
    <Modal open={open} onClose={onClose} title={L.exportTitle} wide>
      <div className="space-y-4">
        {/* Export mode toggle */}
        <div className="flex gap-2">
          <button onClick={() => setExportMode("full")}
            className={`px-4 py-2 rounded-lg text-xs font-medium border transition ${
              exportMode === "full"
                ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                : "border-[#1e3a5f] text-gray-500 hover:text-gray-300"
            }`}>{L.fullExport}</button>
          <button onClick={() => setExportMode("select")}
            className={`px-4 py-2 rounded-lg text-xs font-medium border transition ${
              exportMode === "select"
                ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                : "border-[#1e3a5f] text-gray-500 hover:text-gray-300"
            }`}>{L.selectExport}</button>
        </div>

        {/* Selection panel */}
        {exportMode === "select" && (
          <div className="max-h-48 overflow-y-auto p-3 rounded-lg" style={glass(0.3)}>
            {flatNodes.map(node => (
              <label key={node.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-white/5 px-2 rounded"
                style={{ paddingLeft: 8 + node.depth * 16 }}>
                <input type="checkbox" checked={selectedIds.has(node.id)}
                  onChange={() => toggleSelect(node.id)}
                  className="accent-amber-500 rounded" />
                <span style={{ color: typeColors[node.element_type], fontSize: 12 }}>{typeIcons[node.element_type]}</span>
                <span className="text-xs text-gray-300 truncate">{node.code} — {lang === "ar" && node.title_ar ? node.title_ar : node.title}</span>
              </label>
            ))}
          </div>
        )}

        {/* Preview */}
        <div ref={exportRef} className="p-5 rounded-xl" style={{ background: "rgba(8, 16, 32, 0.9)", border: "1px solid rgba(30, 58, 95, 0.5)" }}>
          {/* Header */}
          <div className="text-center mb-4 pb-4" style={{ borderBottom: `1px solid ${GOLD}22` }}>
            <div className="text-2xl font-bold mb-1" style={{
              background: `linear-gradient(135deg, ${GOLD}, #e8b94a, ${CHAMPAGNE})`,
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              fontFamily: "'Instrument Serif', Georgia, serif",
            }}>ST.AIRS</div>
            <div className="text-gray-500 text-xs tracking-widest uppercase">{L.snapshot} · {new Date().toLocaleDateString()}</div>
            <div className="text-gray-600 text-[10px] mt-1">{L.readOnly}</div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: L.overallProgress, value: `${Math.round(stats.overall_progress || 0)}%`, color: "#60a5fa" },
              { label: L.onTrack, value: stats.on_track || 0, color: "#34d399" },
              { label: L.atRisk, value: stats.at_risk || 0, color: "#fbbf24" },
              { label: L.offTrack, value: stats.off_track || 0, color: "#f87171" },
            ].map((s, i) => (
              <div key={i} className="text-center p-2 rounded-lg" style={glass(0.3)}>
                <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-gray-500 text-[10px]">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Strategy tree */}
          <div className="space-y-0.5">
            {exportTree?.length > 0
              ? exportTree.map(node => renderExportStair(node, 0))
              : <div className="text-gray-600 text-sm text-center py-4">
                  {exportMode === "select" ? (lang === "ar" ? "اختر عناصر للتصدير" : "Select elements to export") : L.loading}
                </div>
            }
          </div>

          {/* Footer */}
          <div className="text-center mt-4 pt-3" style={{ borderTop: `1px solid ${GOLD}15` }}>
            <div className="text-gray-600 text-[10px] tracking-widest uppercase">
              ST.AIRS by DEVONEERS · {new Date().getFullYear()}
            </div>
          </div>
        </div>

        {/* Export actions */}
        <div className="flex items-center gap-3 pt-2">
          <button onClick={copyToClipboard}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]"
            style={{ background: `${GOLD}22`, border: `1px solid ${GOLD}33`, color: GOLD }}>
            {copied ? "✓ Copied!" : `📋 ${L.copyLink}`}
          </button>
          <div className="text-gray-600 text-xs">
            {lang === "ar" ? "يُنسخ كنص منسّق للمشاركة" : "Copies as formatted text for sharing"}
          </div>
        </div>
      </div>
    </Modal>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Main App
// ═══════════════════════════════════════════════════════════════════════════
export default function StairsApp() {
  const [user, setUser] = useState(api.user);
  const [view, setView] = useState("dashboard");
  const [lang, setLang] = useState("en");
  const [dashboard, setDashboard] = useState(null);
  const [tree, setTree] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  // Editor state
  const [editingStair, setEditingStair] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const L = t[lang];

  const loadData = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [dash, treeData, alertData] = await Promise.all([
        api.get("/api/v1/dashboard"),
        api.get("/api/v1/stairs/tree"),
        api.get("/api/v1/alerts"),
      ]);
      setDashboard(dash);
      setTree(treeData);
      setAlerts(alertData);
    } catch (e) {
      if (e.message === "Session expired") {
        setUser(null);
        return;
      }
      setErr(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (user) loadData(); }, [user, loadData]);

  const handleLogin = (u) => { setUser(u); };

  const handleLogout = () => {
    api.logout();
    setUser(null);
    setDashboard(null);
    setTree([]);
    setAlerts([]);
  };

  // CRUD handlers
  const handleSaveStair = async (form, existingId) => {
    if (existingId) {
      await api.put(`/api/v1/stairs/${existingId}`, form);
    } else {
      await api.post("/api/v1/stairs", form);
    }
    await loadData(); // Refresh
  };

  const handleDeleteStair = async (id) => {
    await api.del(`/api/v1/stairs/${id}`);
    await loadData();
  };

  const openEditor = (stair = null) => {
    setEditingStair(stair);
    setEditorOpen(true);
  };

  if (!user) return <LoginScreen onLogin={handleLogin} lang={lang} />;

  const navItems = [
    { key: "dashboard", icon: "◫", label: L.dashboard },
    { key: "staircase", icon: "🪜", label: L.staircase },
    { key: "ai", icon: "◉", label: L.ai },
    { key: "alerts", icon: "⚡", label: L.alerts },
  ];

  return (
    <div className="min-h-screen text-white" dir={lang === "ar" ? "rtl" : "ltr"}
      style={{
        background: "linear-gradient(180deg, #0a1628 0%, #0f1f3a 50%, #0a1628 100%)",
        fontFamily: lang === "ar" ? "'Noto Kufi Arabic', sans-serif" : "'DM Sans', system-ui, sans-serif"
      }}>
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl px-4 py-3 flex items-center gap-4"
        style={{ background: "rgba(10, 22, 40, 0.85)", borderBottom: "1px solid rgba(30, 58, 95, 0.4)" }}>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold" style={{
            background: `linear-gradient(135deg, ${GOLD}, #e8b94a)`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            fontFamily: "'Instrument Serif', Georgia, serif",
          }}>ST.AIRS</span>
          <span className="text-[10px] text-gray-600 uppercase tracking-widest">v3.1</span>
        </div>
        <nav className="flex-1 flex justify-center gap-1">
          {navItems.map(n => (
            <button key={n.key} onClick={() => setView(n.key)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                view === n.key
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/20"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              }`}>
              <span className="mr-1.5">{n.icon}</span>
              {n.label}
              {n.key === "alerts" && alerts.length > 0 && (
                <span className="ml-1.5 bg-red-500/80 text-white text-[9px] px-1.5 py-0.5 rounded-full">{alerts.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <button onClick={() => setLang(lang === "en" ? "ar" : "en")}
            className="text-xs text-gray-500 hover:text-amber-400 transition px-2 py-1 rounded border border-transparent hover:border-amber-500/20">
            {L.langSwitch}
          </button>
          <button onClick={handleLogout}
            className="text-xs text-gray-600 hover:text-gray-300 transition"
            title="Logout">
            {user.full_name} ↗
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {err && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-center gap-2">
            <span>⚠️ {err}</span>
            <button onClick={loadData} className="ml-auto text-xs underline">{L.retry}</button>
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
                onEdit={(stair) => openEditor(stair)}
                onAdd={() => openEditor(null)}
                onExport={() => setExportOpen(true)} />
            )}
            {view === "ai" && <AIChatView lang={lang} userId={user?.id || user?.email} />}
            {view === "alerts" && <AlertsView alerts={alerts} lang={lang} />}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-gray-700 text-[10px] tracking-widest uppercase">
        {L.byDevoneers} • ST.AIRS v3.1 • {new Date().getFullYear()}
      </footer>

      {/* Modals */}
      <StairEditor
        open={editorOpen}
        onClose={() => { setEditorOpen(false); setEditingStair(null); }}
        stair={editingStair}
        allStairs={tree}
        onSave={handleSaveStair}
        onDelete={handleDeleteStair}
        lang={lang}
      />

      <ExportView
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tree={tree}
        dashboard={dashboard}
        lang={lang}
      />

      {/* Global font imports */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500&family=Noto+Kufi+Arabic:wght@400;500;700&display=swap');
        * { scrollbar-width: thin; scrollbar-color: rgba(184,144,74,0.2) transparent; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(184,144,74,0.2); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(184,144,74,0.4); }
      `}</style>
    </div>
  );
}
