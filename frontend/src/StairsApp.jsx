import { useState, useEffect, useCallback, useRef } from "react";

const API = "https://stairs-production.up.railway.app";

// ─── API Client ──────────────────────────────────────────────────────────────
class StairsAPI {
  constructor() {
    this.token = null;
    this.user = null;
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
    return data;
  }
  async get(path) {
    const res = await fetch(`${API}${path}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.json();
  }
  async post(path, body) {
    const res = await fetch(`${API}${path}`, {
      method: "POST", headers: this.headers(), body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
    return res.json();
  }
}

const api = new StairsAPI();

// ─── Translations ────────────────────────────────────────────────────────────
const t = {
  en: {
    title: "ST.AIRS", subtitle: "Strategic Staircase",
    dashboard: "Dashboard", staircase: "Staircase", ai: "AI Advisor", alerts: "Alerts",
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
  },
  ar: {
    title: "ستيرز", subtitle: "السلم الاستراتيجي",
    dashboard: "لوحة التحكم", staircase: "السلم", ai: "المستشار الذكي", alerts: "التنبيهات",
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
  }
};

// ─── Health Badge ────────────────────────────────────────────────────────────
const HealthBadge = ({ health, size = "sm" }) => {
  const colors = {
    on_track: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    at_risk: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    off_track: "bg-red-500/20 text-red-300 border-red-500/30",
    achieved: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  };
  const dots = { on_track: "●", at_risk: "◐", off_track: "○", achieved: "★" };
  const cls = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-3 py-1";
  return (
    <span className={`${cls} rounded-full border font-medium ${colors[health] || colors.at_risk}`}>
      {dots[health] || "?"} {health?.replace("_", " ").toUpperCase()}
    </span>
  );
};

// ─── Progress Ring ───────────────────────────────────────────────────────────
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

// ─── Login Screen ────────────────────────────────────────────────────────────
const LoginScreen = ({ onLogin, lang }) => {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

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
          <div key={i} className="absolute border border-amber-500/5 rounded-full"
            style={{
              width: 200 + i * 150, height: 200 + i * 150,
              top: "50%", left: "50%",
              transform: `translate(-50%, -50%) rotate(${i * 15}deg)`,
              animation: `spin ${30 + i * 10}s linear infinite`,
            }} />
        ))}
      </div>
      <form onSubmit={handleLogin} className="relative z-10 w-full max-w-md p-8 rounded-2xl backdrop-blur-xl"
        style={{ background: "rgba(22, 37, 68, 0.8)", border: "1px solid rgba(212, 168, 83, 0.2)" }}
        dir={lang === "ar" ? "rtl" : "ltr"}>
        <div className="text-center mb-8">
          <div className="text-5xl font-bold tracking-tight mb-1" style={{
            background: "linear-gradient(135deg, #d4a853, #e8b94a, #f5e6c8)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            fontFamily: "'Instrument Serif', Georgia, serif"
          }}>ST.AIRS</div>
          <div className="text-gray-400 text-sm tracking-widest uppercase mt-1">{t[lang].subtitle}</div>
          <div className="w-12 h-0.5 mx-auto mt-3" style={{ background: "linear-gradient(90deg, transparent, #d4a853, transparent)" }} />
        </div>
        <div className="space-y-4">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder={t[lang].email} required
            className="w-full px-4 py-3 rounded-lg bg-[#0a1628]/60 border border-[#1e3a5f] text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none transition" />
          <input type="password" value={pass} onChange={e => setPass(e.target.value)}
            placeholder={t[lang].password} required
            className="w-full px-4 py-3 rounded-lg bg-[#0a1628]/60 border border-[#1e3a5f] text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none transition" />
        </div>
        {err && <div className="mt-3 text-red-400 text-sm text-center">{err}</div>}
        <button type="submit" disabled={loading}
          className="w-full mt-6 py-3 rounded-lg font-semibold text-[#0a1628] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #d4a853, #e8b94a)" }}>
          {loading ? "..." : t[lang].login}
        </button>
        <div className="text-center mt-6 text-gray-600 text-xs">{t[lang].byDevoneers}</div>
      </form>
      <style>{`@keyframes spin { to { transform: translate(-50%,-50%) rotate(360deg) } }`}</style>
    </div>
  );
};

// ─── Dashboard View ──────────────────────────────────────────────────────────
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
      {/* Progress Hero */}
      <div className="flex items-center gap-6 p-6 rounded-2xl" style={{ background: "rgba(22, 37, 68, 0.6)", border: "1px solid rgba(30, 58, 95, 0.5)" }}>
        <ProgressRing percent={s.overall_progress || 0} size={120} stroke={8} />
        <div>
          <div className="text-gray-400 text-sm">{L.overallProgress}</div>
          <div className="text-3xl font-bold text-white">{Math.round(s.overall_progress || 0)}%</div>
          <div className="text-gray-500 text-xs mt-1">{s.active_alerts || 0} active alerts ({s.critical_alerts || 0} critical)</div>
        </div>
      </div>
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((st, i) => (
          <div key={i} className="p-4 rounded-xl text-center" style={{ background: "rgba(22, 37, 68, 0.5)", border: `1px solid ${st.color}22` }}>
            <div className="text-3xl font-bold" style={{ color: st.color }}>{st.value}</div>
            <div className="text-gray-400 text-xs mt-1">{st.label}</div>
          </div>
        ))}
      </div>
      {/* Top Risks */}
      {data?.top_risks?.length > 0 && (
        <div>
          <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">Top Risks</h3>
          <div className="space-y-2">
            {data.top_risks.map((r, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "rgba(22, 37, 68, 0.4)" }}>
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
      {/* Recent Progress */}
      {data?.recent_progress?.length > 0 && (
        <div>
          <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">Recent Progress</h3>
          <div className="space-y-1.5">
            {data.recent_progress.slice(0, 5).map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg text-sm" style={{ background: "rgba(22, 37, 68, 0.3)" }}>
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
                <div className="text-gray-500 text-xs truncate max-w-[120px]">{p.notes}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Staircase View ──────────────────────────────────────────────────────────
const StaircaseView = ({ tree, lang }) => {
  const L = t[lang];
  const typeIcons = { vision: "◆", objective: "▣", key_result: "◎", initiative: "▶", task: "•" };
  const typeColors = {
    vision: "#d4a853", objective: "#60a5fa", key_result: "#34d399",
    initiative: "#a78bfa", task: "#94a3b8",
  };

  const renderStair = (node, depth = 0) => {
    const s = node.stair;
    const color = typeColors[s.element_type] || "#94a3b8";
    return (
      <div key={s.id} style={{ marginLeft: depth * 28 }}>
        <div className="group flex items-center gap-3 p-3 rounded-xl my-1.5 transition-all hover:scale-[1.01] cursor-pointer"
          style={{ background: `rgba(22, 37, 68, ${0.7 - depth * 0.08})`, borderLeft: `3px solid ${color}` }}>
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
        </div>
        {node.children?.map(child => renderStair(child, depth + 1))}
      </div>
    );
  };

  if (!tree?.length) return <div className="text-gray-500 text-center py-12">{L.loading}</div>;
  return <div className="space-y-1">{tree.map(node => renderStair(node, 0))}</div>;
};

// ─── AI Chat View ────────────────────────────────────────────────────────────
const AIChatView = ({ lang }) => {
  const L = t[lang];
  const [messages, setMessages] = useState([
    { role: "ai", text: lang === "ar"
      ? "مرحباً! أنا المستشار الاستراتيجي الذكي لمنصة ستيرز. كيف يمكنني مساعدتك في تحليل استراتيجيتك؟"
      : "Welcome! I'm the ST.AIRS Strategy Advisor. I have full context of your staircase — ask me anything about risks, opportunities, or strategic moves." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: msg }]);
    setLoading(true);
    try {
      const res = await api.post("/api/v1/ai/chat", { message: msg });
      setMessages(prev => [...prev, {
        role: "ai", text: res.response,
        tokens: res.tokens_used, actions: res.actions
      }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "ai", text: `⚠️ ${e.message}`, error: true }]);
    }
    setLoading(false);
  };

  const quickPrompts = lang === "ar"
    ? ["ما هي أكبر المخاطر؟", "حلل تقدم الرؤية", "اقترح خطوات تالية"]
    : ["What are our biggest risks?", "Analyze the vision progress", "Suggest next steps for KR-001"];

  return (
    <div className="flex flex-col h-[calc(100vh-180px)]">
      <div className="flex-1 overflow-y-auto space-y-3 pb-4 px-1">
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
            <button key={i} onClick={() => { setInput(q); }}
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
          style={{ background: "linear-gradient(135deg, #d4a853, #e8b94a)", color: "#0a1628" }}>
          {L.send}
        </button>
      </div>
    </div>
  );
};

// ─── Alerts View ─────────────────────────────────────────────────────────────
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
              <span className="text-[10px] uppercase tracking-wider opacity-50 font-medium" style={{ color: sev.text.includes("red") ? "#f87171" : sev.text.includes("amber") ? "#fbbf24" : "#60a5fa" }}>
                {a.severity}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Main App ────────────────────────────────────────────────────────────────
export default function StairsApp() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("dashboard");
  const [lang, setLang] = useState("en");
  const [dashboard, setDashboard] = useState(null);
  const [tree, setTree] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
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
      setErr(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (user) loadData(); }, [user, loadData]);

  if (!user) return <LoginScreen onLogin={setUser} lang={lang} />;

  const navItems = [
    { key: "dashboard", icon: "◫" },
    { key: "staircase", icon: "🪜" },
    { key: "ai", icon: "◉" },
    { key: "alerts", icon: "⚡" },
  ];

  return (
    <div className="min-h-screen text-white" dir={lang === "ar" ? "rtl" : "ltr"}
      style={{ background: "linear-gradient(180deg, #0a1628 0%, #0f1f3a 50%, #0a1628 100%)", fontFamily: lang === "ar" ? "'Noto Kufi Arabic', sans-serif" : "'DM Sans', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl px-4 py-3 flex items-center gap-4"
        style={{ background: "rgba(10, 22, 40, 0.85)", borderBottom: "1px solid rgba(30, 58, 95, 0.4)" }}>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold" style={{
            background: "linear-gradient(135deg, #d4a853, #e8b94a)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            fontFamily: "'Instrument Serif', Georgia, serif",
          }}>ST.AIRS</span>
          <span className="text-[10px] text-gray-600 uppercase tracking-widest">v2.0</span>
        </div>
        {/* Nav */}
        <nav className="flex-1 flex justify-center gap-1">
          {navItems.map(n => (
            <button key={n.key} onClick={() => setView(n.key)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                view === n.key
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/20"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              }`}>
              <span className="mr-1.5">{n.icon}</span>
              {L[n.key]}
              {n.key === "alerts" && alerts.length > 0 && (
                <span className="ml-1.5 bg-red-500/80 text-white text-[9px] px-1.5 py-0.5 rounded-full">{alerts.length}</span>
              )}
            </button>
          ))}
        </nav>
        {/* Right side */}
        <div className="flex items-center gap-3">
          <button onClick={() => setLang(lang === "en" ? "ar" : "en")}
            className="text-xs text-gray-500 hover:text-amber-400 transition px-2 py-1 rounded border border-transparent hover:border-amber-500/20">
            {L.langSwitch}
          </button>
          <div className="text-xs text-gray-600">{user.full_name}</div>
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
            {view === "staircase" && <StaircaseView tree={tree} lang={lang} />}
            {view === "ai" && <AIChatView lang={lang} />}
            {view === "alerts" && <AlertsView alerts={alerts} lang={lang} />}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-gray-700 text-[10px] tracking-widest uppercase">
        {L.byDevoneers} • ST.AIRS v2.0 • {new Date().getFullYear()}
      </footer>

      {/* Global font imports */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500&family=Noto+Kufi+Arabic:wght@400;500;700&display=swap');
      `}</style>
    </div>
  );
}
