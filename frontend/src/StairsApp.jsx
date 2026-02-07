import { useState, useEffect, useCallback, useRef } from "react";

const API = "https://stairs-production.up.railway.app";

// ─── API Client ──────────────────────────────────────────────────────────────
class StairsAPI {
  constructor() { this.token = null; this.user = null; }
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
    this.token = data.access_token; this.user = data.user;
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

// ─── Embedded Knowledge Base ─────────────────────────────────────────────────
const KB = {
  frameworks: [
    { code: "five_forces", name: "Porter's Five Forces", phase: "analysis", originator: "Michael Porter", year: 1979, complexity: "moderate", desc: "Five competitive forces shaping industry profitability: entrants, suppliers, buyers, substitutes, rivalry." },
    { code: "pestel", name: "PESTEL Analysis", phase: "analysis", originator: "Francis Aguilar", year: 1967, complexity: "simple", desc: "Political, Economic, Social, Technological, Environmental, Legal macro-environmental scanning." },
    { code: "swot", name: "SWOT / TOWS", phase: "analysis", originator: "Harvard/SRI", year: 1965, complexity: "simple", desc: "Strengths, Weaknesses, Opportunities, Threats. TOWS generates four strategy types." },
    { code: "value_chain", name: "Value Chain Analysis", phase: "analysis", originator: "Michael Porter", year: 1985, complexity: "moderate", desc: "Primary and support activities disaggregated to identify competitive advantage sources." },
    { code: "generic", name: "Generic Strategies", phase: "formulation", originator: "Michael Porter", year: 1980, complexity: "simple", desc: "Three positioning options: cost leadership, differentiation, and focus." },
    { code: "blue_ocean", name: "Blue Ocean Strategy", phase: "formulation", originator: "Kim & Mauborgne", year: 2005, complexity: "moderate", desc: "Create uncontested market space via Strategy Canvas, ERRC Grid, value innovation." },
    { code: "ansoff", name: "Ansoff Matrix", phase: "formulation", originator: "Igor Ansoff", year: 1957, complexity: "simple", desc: "Growth via Market Penetration, Development, Product Development, or Diversification." },
    { code: "bcg", name: "BCG Growth-Share Matrix", phase: "formulation", originator: "Bruce Henderson", year: 1970, complexity: "simple", desc: "Stars, Cash Cows, Question Marks, Dogs — portfolio triage by growth and share." },
    { code: "ge_mckinsey", name: "GE-McKinsey Nine-Box", phase: "formulation", originator: "McKinsey for GE", year: 1971, complexity: "complex", desc: "3×3 grid scoring Industry Attractiveness and Competitive Strength on weighted factors." },
    { code: "bmc", name: "Business Model Canvas", phase: "design", originator: "Osterwalder & Pigneur", year: 2010, complexity: "moderate", desc: "9 building blocks for business model visualization — most widely used strategy visual tool." },
    { code: "lean_canvas", name: "Lean Canvas", phase: "design", originator: "Ash Maurya", year: 2012, complexity: "simple", desc: "BMC adapted for startups: Problem, Solution, Key Metrics, Unfair Advantage." },
    { code: "bsc", name: "Balanced Scorecard", phase: "execution", originator: "Kaplan & Norton", year: 1992, complexity: "complex", desc: "Four perspectives: Financial, Customer, Internal Process, Learning & Growth with measures and targets." },
    { code: "strategy_maps", name: "Strategy Maps", phase: "execution", originator: "Kaplan & Norton", year: 2004, complexity: "complex", desc: "Visual cause-and-effect between objectives across BSC perspectives." },
    { code: "okr", name: "OKR", phase: "execution", originator: "Andy Grove / John Doerr", year: 1975, complexity: "simple", desc: "Qualitative Objectives + 3-5 measurable Key Results. Quarterly cadence, stretch goals." },
    { code: "ogsm", name: "OGSM", phase: "execution", originator: "P&G Tradition", year: 1950, complexity: "simple", desc: "One-page plan: Objective, Goals, Strategies, Measures. Cascadable corporate to department." },
    { code: "hoshin", name: "Hoshin Kanri", phase: "execution", originator: "Yoji Akao", year: 1965, complexity: "expert", desc: "X-Matrix alignment, catchball communication, PDCA cycles. Most comprehensive deployment system." },
    { code: "toc", name: "Theory of Constraints", phase: "execution", originator: "Eliyahu Goldratt", year: 1984, complexity: "moderate", desc: "Five Focusing Steps: Identify → Exploit → Subordinate → Elevate → Repeat." },
  ],
  failures: [
    { code: "HOCKEY_STICK", name: "Hockey Stick Projection", sev: "high", stat: "Most common planning failure — optimistic curves that never materialize", cat: "planning", risk: 15, icon: "📈" },
    { code: "PEANUT_BUTTER", name: "Peanut Butter Resourcing", sev: "high", stat: "Only 2-3% annual reallocation vs 50%+ needed for value creation", cat: "resource", risk: 12, icon: "🥜" },
    { code: "CASCADE_GAP", name: "Strategy Cascade Failure", sev: "critical", stat: "93% of employees don't understand company strategy", cat: "communication", risk: 18, icon: "📢" },
    { code: "SILO_PROBLEM", name: "Cross-Silo Misalignment", sev: "critical", stat: "Only 9% of managers trust cross-functional colleagues", cat: "alignment", risk: 20, icon: "🏢" },
    { code: "MEASUREMENT_GAP", name: "Measurement Failure", sev: "high", stat: "55% of businesses struggle to track KPIs effectively", cat: "measurement", risk: 10, icon: "📊" },
    { code: "RESOURCE_STARVATION", name: "Resource Starvation", sev: "high", stat: "7.5% of strategy value lost from inadequate resources", cat: "resource", risk: 8, icon: "🏜️" },
    { code: "SET_AND_FORGET", name: "Set and Forget", sev: "high", stat: "85% of exec teams spend <1hr/month on strategy", cat: "adaptation", risk: 12, icon: "💤" },
    { code: "CONFIDENCE_COLLAPSE", name: "Confidence Collapse", sev: "critical", stat: "Rapid confidence drop is the leading indicator of execution failure", cat: "measurement", risk: 25, icon: "📉" },
  ],
  books: [
    { t: "Playing to Win", a: "Martin & Lafley", y: 2013, tier: 1, cat: "formulation" },
    { t: "The Execution Premium", a: "Kaplan & Norton", y: 2008, tier: 1, cat: "execution" },
    { t: "Measure What Matters", a: "John Doerr", y: 2018, tier: 1, cat: "execution" },
    { t: "Good Strategy Bad Strategy", a: "Richard Rumelt", y: 2011, tier: 1, cat: "formulation" },
    { t: "Business Model Generation", a: "Osterwalder & Pigneur", y: 2010, tier: 1, cat: "design" },
    { t: "Strategy Maps", a: "Kaplan & Norton", y: 2004, tier: 1, cat: "execution" },
    { t: "Blue Ocean Strategy", a: "Kim & Mauborgne", y: 2005, tier: 2, cat: "formulation" },
    { t: "4 Disciplines of Execution", a: "McChesney, Covey & Huling", y: 2012, tier: 2, cat: "execution" },
    { t: "Strategy Beyond the Hockey Stick", a: "Bradley, Hirt & Smit", y: 2018, tier: 2, cat: "formulation" },
    { t: "Seeing Around Corners", a: "Rita McGrath", y: 2019, tier: 2, cat: "formulation" },
    { t: "Execution", a: "Bossidy & Charan", y: 2002, tier: 2, cat: "execution" },
    { t: "Competitive Strategy", a: "Michael Porter", y: 1980, tier: 3, cat: "formulation" },
    { t: "The Innovator's Dilemma", a: "Clayton Christensen", y: 1997, tier: 3, cat: "innovation" },
    { t: "Thinking in Bets", a: "Annie Duke", y: 2018, tier: 3, cat: "decision" },
    { t: "The Lean Startup", a: "Eric Ries", y: 2011, tier: 3, cat: "execution" },
  ],
  stats: [
    { v: "63%", l: "of strategic financial performance actually delivered", s: "Mankins & Steele, Bain 2005" },
    { v: "37%", l: "of strategy value lost in execution gap", s: "Mankins & Steele, Bain 2005" },
    { v: "93%", l: "of employees don't understand company strategy", s: "PwC Strategy&" },
    { v: "5%", l: "of employees understand their company's strategy", s: "Kaplan & Norton" },
    { v: "9%", l: "of managers can count on cross-functional colleagues", s: "MIT Sloan / HBR 2015" },
    { v: "$166B", l: "projected MENA AI market by 2030 (44.8% CAGR)", s: "Industry Analysis" },
  ],
};

// ─── Design Tokens ───────────────────────────────────────────────────────────
const G = "#B8904A", T = "#2A5C5C", D = "#070E1A";
const CARD = "rgba(12,20,40,0.75)", BD = "rgba(184,144,74,0.1)";
const ph = {
  analysis: { bg: "rgba(96,165,250,0.08)", bd: "#60a5fa20", tx: "#93bbfc" },
  formulation: { bg: "rgba(168,85,247,0.08)", bd: "#a855f720", tx: "#c4a5fa" },
  design: { bg: "rgba(52,211,153,0.08)", bd: "#34d39920", tx: "#6ee7b7" },
  execution: { bg: "rgba(184,144,74,0.08)", bd: "#B8904A20", tx: "#d4b878" },
};
const hs = {
  on_track: { c: "#34d399", l: "On Track", i: "●" },
  at_risk: { c: "#fbbf24", l: "At Risk", i: "◐" },
  off_track: { c: "#f87171", l: "Off Track", i: "○" },
  achieved: { c: "#60a5fa", l: "Achieved", i: "★" },
};
const tc = {
  vision: { i: "◆", c: G }, objective: { i: "▣", c: "#60a5fa" },
  key_result: { i: "◎", c: "#34d399" }, initiative: { i: "▶", c: "#a78bfa" },
  task: { i: "•", c: "#94a3b8" }, kpi: { i: "◈", c: "#fbbf24" },
};

// ─── Micro Components ────────────────────────────────────────────────────────
const Ring = ({ pct = 0, sz = 80, sw = 5 }) => {
  const r = (sz - sw) / 2, c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  const col = pct >= 70 ? "#34d399" : pct >= 40 ? "#fbbf24" : "#f87171";
  return (
    <svg width={sz} height={sz} className="transform -rotate-90">
      <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke={`${G}15`} strokeWidth={sw} />
      <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke={col} strokeWidth={sw}
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1s ease" }} />
      <text x="50%" y="50%" textAnchor="middle" dy=".35em" fill={col}
        fontSize={sz * 0.22} fontWeight="700" transform={`rotate(90 ${sz/2} ${sz/2})`}>
        {Math.round(pct)}%
      </text>
    </svg>
  );
};

const Badge = ({ health }) => {
  const s = hs[health] || hs.at_risk;
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wide"
      style={{ background: `${s.c}12`, color: s.c, border: `1px solid ${s.c}20` }}>
      {s.i} {s.l}
    </span>
  );
};

const Card = ({ children, className = "", style = {} }) => (
  <div className={`rounded-xl ${className}`} style={{ background: CARD, border: `1px solid ${BD}`, ...style }}>
    {children}
  </div>
);

const SectionLabel = ({ children, color = `${G}80` }) => (
  <h3 className="text-[10px] uppercase tracking-[0.2em] mb-3 font-semibold" style={{ color }}>{children}</h3>
);

// ─── Login ────────────────────────────────────────────────────────────────────
const Login = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const go = async (e) => {
    e.preventDefault(); setLoading(true); setErr("");
    try { await api.login(email, pass); onLogin(api.user); }
    catch { setErr("Invalid credentials"); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center overflow-hidden"
      style={{ background: `linear-gradient(160deg, ${D} 0%, #0d1b30 40%, #122240 60%, ${D} 100%)` }}>
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[600px] h-[600px] rounded-full opacity-[0.025] top-[10%] left-[20%]"
          style={{ background: `radial-gradient(circle, ${G}, transparent 70%)`, filter: "blur(80px)" }} />
        <div className="absolute w-[400px] h-[400px] rounded-full opacity-[0.02] bottom-[20%] right-[15%]"
          style={{ background: `radial-gradient(circle, ${T}, transparent 70%)`, filter: "blur(60px)" }} />
      </div>
      <form onSubmit={go} className="relative z-10 w-full max-w-[360px] p-8 rounded-2xl backdrop-blur-xl"
        style={{ background: "rgba(10,18,35,0.88)", border: `1px solid ${BD}` }}>
        <div className="text-center mb-8">
          <div className="flex items-end justify-center gap-[3px] mb-4">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="rounded-t-sm" style={{ width: 5, height: i * 7, background: `linear-gradient(to top, ${T}, ${G})` }} />
            ))}
          </div>
          <h1 className="text-4xl font-bold tracking-tight" style={{
            background: `linear-gradient(135deg, ${G}, #e8c87a, ${G})`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            fontFamily: "Georgia, 'Times New Roman', serif",
          }}>ST.AIRS</h1>
          <p className="text-[9px] text-gray-500 tracking-[0.35em] uppercase mt-1.5">Knowledge-Powered Strategy Engine</p>
          <div className="w-14 h-px mx-auto mt-3" style={{ background: `linear-gradient(90deg, transparent, ${G}40, transparent)` }} />
        </div>
        <div className="space-y-3">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required
            className="w-full px-4 py-3 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none transition"
            style={{ background: "rgba(7,14,26,0.5)", border: `1px solid ${BD}` }} />
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Password" required
            className="w-full px-4 py-3 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none transition"
            style={{ background: "rgba(7,14,26,0.5)", border: `1px solid ${BD}` }} />
        </div>
        {err && <p className="mt-2 text-red-400 text-xs text-center">{err}</p>}
        <button type="submit" disabled={loading}
          className="w-full mt-5 py-3 rounded-lg font-semibold text-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
          style={{ background: `linear-gradient(135deg, ${G}, #c9a050)`, color: D }}>
          {loading ? "Authenticating..." : "Enter ST.AIRS"}
        </button>
        <p className="text-center mt-6 text-gray-700 text-[9px] tracking-[0.25em]">DEVONEERS × RootRise</p>
      </form>
    </div>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = ({ data }) => {
  const s = data?.stats || {};
  const metrics = [
    { label: "Elements", val: s.total_elements || 0, col: "#60a5fa" },
    { label: "On Track", val: s.on_track || 0, col: "#34d399" },
    { label: "At Risk", val: s.at_risk || 0, col: "#fbbf24" },
    { label: "Off Track", val: s.off_track || 0, col: "#f87171" },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map((m, i) => (
          <Card key={i} className="p-4 text-center">
            <div className="text-3xl font-bold tabular-nums" style={{ color: m.col }}>{m.val}</div>
            <div className="text-gray-500 text-[10px] mt-1 uppercase tracking-wider">{m.label}</div>
          </Card>
        ))}
      </div>

      <Card className="flex items-center gap-6 p-5">
        <Ring pct={s.overall_progress || 0} sz={100} sw={6} />
        <div className="flex-1">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">Strategy Progress</p>
          <p className="text-2xl font-bold text-white mt-0.5">{Math.round(s.overall_progress || 0)}%</p>
          <p className="text-gray-600 text-xs mt-0.5">{s.active_alerts || 0} alerts · {s.critical_alerts || 0} critical</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Execution Gap</p>
          <p className="text-xl font-bold" style={{ color: G }}>37%</p>
          <p className="text-[9px] text-gray-600">avg. value lost (Bain)</p>
        </div>
      </Card>

      {data?.top_risks?.length > 0 && (
        <div>
          <SectionLabel>Top Risks</SectionLabel>
          <div className="space-y-1.5">
            {data.top_risks.slice(0, 5).map((r, i) => (
              <Card key={i} className="flex items-center gap-3 p-3 hover:brightness-110 transition-all">
                <span className="text-[10px] font-mono w-14 shrink-0" style={{ color: G }}>{r.code}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{r.title}</p>
                </div>
                <Badge health={r.health} />
                <span className="text-white text-xs font-mono w-10 text-right">{r.progress_percent}%</span>
              </Card>
            ))}
          </div>
        </div>
      )}

      {data?.recent_progress?.length > 0 && (
        <div>
          <SectionLabel>Recent Activity</SectionLabel>
          <div className="space-y-1">
            {data.recent_progress.slice(0, 5).map((p, i) => (
              <Card key={i} className="flex items-center gap-3 p-2.5 text-xs">
                <span className="text-gray-600 w-16 shrink-0 font-mono">{p.snapshot_date}</span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: `${G}10` }}>
                  <div className="h-full rounded-full" style={{
                    width: `${p.progress_percent}%`,
                    background: p.health === "on_track" ? "#34d399" : p.health === "at_risk" ? "#fbbf24" : "#f87171",
                    transition: "width 0.6s ease",
                  }} />
                </div>
                <span className="text-gray-400 w-8 text-right font-mono">{p.progress_percent}%</span>
                <span className="text-gray-600 truncate max-w-[100px]">{p.notes}</span>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Staircase ────────────────────────────────────────────────────────────────
const Staircase = ({ tree, onSelect }) => {
  const render = (node, depth = 0) => {
    const s = node.stair;
    const cfg = tc[s.element_type] || tc.task;
    return (
      <div key={s.id} style={{ paddingLeft: depth * 22 }}>
        <div className="group flex items-center gap-3 p-3 rounded-xl my-1 transition-all hover:brightness-125 cursor-pointer"
          onClick={() => onSelect?.(s)}
          style={{ background: CARD, borderLeft: `3px solid ${cfg.c}` }}>
          <span style={{ color: cfg.c, fontSize: 15 }}>{cfg.i}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono opacity-35" style={{ color: cfg.c }}>{s.code}</span>
              <span className="text-white text-sm font-medium truncate">{s.title}</span>
            </div>
            {s.description && <p className="text-gray-600 text-[11px] truncate mt-0.5">{s.description}</p>}
          </div>
          <Badge health={s.health} />
          <div className="w-14 text-right">
            <span className="text-[11px] font-mono" style={{ color: cfg.c }}>{s.progress_percent}%</span>
            <div className="h-1 rounded-full mt-0.5 overflow-hidden" style={{ background: `${cfg.c}12` }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${s.progress_percent}%`, background: cfg.c }} />
            </div>
          </div>
        </div>
        {node.children?.map(ch => render(ch, depth + 1))}
      </div>
    );
  };
  if (!tree?.length) return <div className="text-gray-600 text-center py-16">Loading staircase...</div>;
  return <div className="space-y-0.5">{tree.map(n => render(n, 0))}</div>;
};

// ─── Knowledge Library ───────────────────────────────────────────────────────
const Knowledge = () => {
  const [tab, setTab] = useState("frameworks");
  const tabs = [
    { k: "frameworks", l: "17 Frameworks", ic: "⬡" },
    { k: "failures", l: "Failure Patterns", ic: "⚠" },
    { k: "books", l: "41 Books", ic: "📚" },
    { k: "stats", l: "Key Stats", ic: "📊" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === t.k ? "" : "text-gray-500 hover:text-gray-300"}`}
            style={tab === t.k ? { background: `${G}18`, border: `1px solid ${G}25`, color: G } : { border: "1px solid transparent" }}>
            <span className="mr-1">{t.ic}</span>{t.l}
          </button>
        ))}
      </div>

      {tab === "frameworks" && (
        <div className="space-y-4">
          {["analysis", "formulation", "design", "execution"].map(phase => {
            const items = KB.frameworks.filter(f => f.phase === phase);
            if (!items.length) return null;
            const p = ph[phase];
            return (
              <div key={phase}>
                <SectionLabel color={p.tx}>{phase} phase ({items.length})</SectionLabel>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {items.map(f => (
                    <div key={f.code} className="p-3 rounded-xl transition-all hover:brightness-110"
                      style={{ background: p.bg, border: `1px solid ${p.bd}` }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold" style={{ color: p.tx }}>{f.name}</span>
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider"
                          style={{ background: `${p.tx}10`, color: p.tx }}>{f.complexity}</span>
                      </div>
                      <p className="text-gray-400 text-[11px] leading-relaxed">{f.desc}</p>
                      <p className="text-gray-600 text-[10px] mt-1.5">{f.originator} · {f.year}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "failures" && (
        <div className="space-y-2">
          {KB.failures.map(fp => (
            <div key={fp.code} className="p-4 rounded-xl" style={{
              background: fp.sev === "critical" ? "rgba(248,113,113,0.05)" : "rgba(251,191,36,0.05)",
              border: `1px solid ${fp.sev === "critical" ? "#f8717112" : "#fbbf2412"}`,
            }}>
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5">{fp.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{fp.name}</span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium uppercase ${
                      fp.sev === "critical" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"
                    }`}>{fp.sev}</span>
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-500 uppercase">{fp.cat}</span>
                  </div>
                  <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">{fp.stat}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[9px] text-gray-600">Value at Risk:</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden max-w-[120px]" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <div className="h-full rounded-full" style={{
                        width: `${fp.risk * 3}%`,
                        background: fp.sev === "critical" ? "#f87171" : "#fbbf24",
                      }} />
                    </div>
                    <span className="text-[9px] font-mono" style={{ color: fp.sev === "critical" ? "#f87171" : "#fbbf24" }}>{fp.risk}%</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <Card className="p-4 text-center">
            <p className="text-gray-500 text-xs">ST.AIRS AI continuously monitors your staircase for these execution failure patterns</p>
          </Card>
        </div>
      )}

      {tab === "books" && (
        <div className="space-y-3">
          {[1, 2, 3].map(tier => {
            const items = KB.books.filter(b => b.tier === tier);
            const tierCol = tier === 1 ? G : tier === 2 ? "#60a5fa" : "#94a3b8";
            const tierName = tier === 1 ? "Must-Integrate" : tier === 2 ? "Essential Enhancement" : "Conceptual AI Logic";
            return (
              <div key={tier}>
                <SectionLabel color={tierCol}>Tier {tier}: {tierName} ({items.length})</SectionLabel>
                <div className="space-y-1">
                  {items.map((b, i) => {
                    const catCol = b.cat === "execution" ? "#34d399" : b.cat === "formulation" ? "#a78bfa" : b.cat === "design" ? "#6ee7b7" : "#60a5fa";
                    return (
                      <Card key={i} className="flex items-center gap-3 p-2.5">
                        <span className="text-base opacity-30">📖</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-white text-sm font-medium">{b.t}</span>
                          <span className="text-gray-600 text-xs ml-1.5">({b.y})</span>
                          <p className="text-gray-600 text-[11px]">{b.a}</p>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: `${catCol}10`, color: catCol }}>{b.cat}</span>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "stats" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {KB.stats.map((s, i) => (
            <Card key={i} className="p-5 text-center">
              <div className="text-3xl font-bold" style={{ color: G }}>{s.v}</div>
              <p className="text-gray-300 text-sm mt-2 leading-snug">{s.l}</p>
              <p className="text-gray-600 text-[9px] mt-1.5">{s.s}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── AI Chat ──────────────────────────────────────────────────────────────────
const AIChat = () => {
  const [msgs, setMsgs] = useState([
    { role: "ai", text: "Welcome to ST.AIRS Strategy Intelligence. I have full context of your staircase, 17 canonical frameworks, failure pattern taxonomy, and 41 books of strategy science.\n\nAsk me about risks, opportunities, framework selection, or strategic moves." }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async () => {
    if (!input.trim() || busy) return;
    const msg = input.trim(); setInput("");
    setMsgs(p => [...p, { role: "user", text: msg }]);
    setBusy(true);
    try {
      const res = await api.post("/api/v1/ai/chat", { message: msg });
      setMsgs(p => [...p, { role: "ai", text: res.response, tokens: res.tokens_used }]);
    } catch (e) {
      setMsgs(p => [...p, { role: "ai", text: `⚠ ${e.message}`, err: true }]);
    }
    setBusy(false);
  };

  const prompts = [
    "What are our biggest strategic risks?",
    "Which failure patterns apply to us?",
    "Recommend a framework for MENA expansion",
    "Analyze our progress using the outside view",
  ];

  return (
    <div className="flex flex-col" style={{ height: "min(calc(100vh - 160px), 700px)" }}>
      <div className="flex-1 overflow-y-auto space-y-3 pb-4 pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: `${G}30 transparent` }}>
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed ${
              m.role === "user"
                ? "rounded-br-md"
                : m.err
                  ? "rounded-bl-md"
                  : "rounded-bl-md"
            }`} style={{
              background: m.role === "user" ? `${G}18` : m.err ? "rgba(248,113,113,0.08)" : CARD,
              color: m.role === "user" ? "#e8c87a" : m.err ? "#fca5a5" : "#d1d5db",
              border: `1px solid ${m.role === "user" ? `${G}25` : m.err ? "#f8717118" : BD}`,
            }}>
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.tokens > 0 && <div className="text-[9px] text-gray-700 mt-2 text-right">{m.tokens} tokens</div>}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex gap-1.5 px-4 py-2">
            {[0,1,2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: `${G}50`, animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}
        <div ref={end} />
      </div>

      {msgs.length <= 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {prompts.map((q, i) => (
            <button key={i} onClick={() => setInput(q)}
              className="text-[11px] px-2.5 py-1.5 rounded-lg transition-all hover:brightness-125"
              style={{ border: `1px solid ${G}18`, color: `${G}90`, background: `${G}06` }}>
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2" style={{ borderTop: `1px solid ${BD}` }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Ask about your strategy, risks, frameworks..." disabled={busy}
          className="flex-1 px-4 py-3 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none transition"
          style={{ background: "rgba(7,14,26,0.5)", border: `1px solid ${BD}` }} />
        <button onClick={send} disabled={busy || !input.trim()}
          className="px-5 py-3 rounded-xl font-semibold text-sm transition-all hover:brightness-110 active:scale-95 disabled:opacity-30"
          style={{ background: `linear-gradient(135deg, ${G}, #c9a050)`, color: D }}>
          Send
        </button>
      </div>
    </div>
  );
};

// ─── Alerts ───────────────────────────────────────────────────────────────────
const Alerts = ({ alerts }) => {
  const sev = {
    critical: { bg: "rgba(248,113,113,0.06)", bd: "#f8717112", ic: "🔴", tx: "#fca5a5" },
    high: { bg: "rgba(251,191,36,0.06)", bd: "#fbbf2412", ic: "🟡", tx: "#fde68a" },
    medium: { bg: "rgba(96,165,250,0.06)", bd: "#60a5fa12", ic: "🔵", tx: "#93c5fd" },
    info: { bg: "rgba(96,165,250,0.04)", bd: "#60a5fa08", ic: "ℹ️", tx: "#93c5fd" },
  };
  if (!alerts?.length) return <div className="text-gray-600 text-center py-16">No active alerts — your strategy is on track</div>;
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => {
        const s = sev[a.severity] || sev.info;
        return (
          <div key={i} className="p-4 rounded-xl" style={{ background: s.bg, border: `1px solid ${s.bd}` }}>
            <div className="flex items-start gap-3">
              <span className="text-base mt-0.5">{s.ic}</span>
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: s.tx }}>{a.title}</p>
                <p className="text-gray-500 text-xs mt-1">{a.description}</p>
                {a.recommended_actions?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {a.recommended_actions.map((act, j) => (
                      <p key={j} className="text-[11px] text-gray-600 flex gap-1.5">
                        <span style={{ color: `${G}60` }}>→</span> {act}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[8px] uppercase tracking-wider font-semibold" style={{ color: s.tx }}>{a.severity}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Detail Panel ─────────────────────────────────────────────────────────────
const Detail = ({ stair, onClose }) => {
  if (!stair) return null;
  const cfg = tc[stair.element_type] || tc.task;
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-wider" style={{ color: cfg.c }}>{stair.element_type?.replace("_", " ")}</p>
          <h3 className="text-white text-lg font-semibold mt-0.5">{stair.title}</h3>
          {stair.description && <p className="text-gray-500 text-xs mt-1">{stair.description}</p>}
        </div>
        <button onClick={onClose} className="text-gray-600 hover:text-white text-lg transition">×</button>
      </div>
      <div className="flex items-center gap-3">
        <Badge health={stair.health} />
        <span className="text-[10px] font-mono" style={{ color: G }}>{stair.code}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg" style={{ background: "rgba(7,14,26,0.4)" }}>
          <p className="text-gray-600 text-[9px] uppercase">Progress</p>
          <p className="text-white text-lg font-bold mt-0.5">{stair.progress_percent}%</p>
        </div>
        <div className="p-3 rounded-lg" style={{ background: "rgba(7,14,26,0.4)" }}>
          <p className="text-gray-600 text-[9px] uppercase">AI Risk</p>
          <p className="text-lg font-bold mt-0.5" style={{ color: (stair.ai_risk_score || 0) > 60 ? "#f87171" : (stair.ai_risk_score || 0) > 30 ? "#fbbf24" : "#34d399" }}>
            {stair.ai_risk_score || "—"}/100
          </p>
        </div>
      </div>
      {stair.ai_insights?.summary && (
        <div className="p-3 rounded-lg" style={{ background: `${G}08`, border: `1px solid ${G}12` }}>
          <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: G }}>AI Insight</p>
          <p className="text-gray-300 text-xs leading-relaxed">{stair.ai_insights.summary}</p>
        </div>
      )}
    </Card>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function StairsApp() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [tree, setTree] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [d, t, a] = await Promise.all([
        api.get("/api/v1/dashboard"),
        api.get("/api/v1/stairs/tree"),
        api.get("/api/v1/alerts"),
      ]);
      setDashboard(d); setTree(t); setAlerts(a);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  if (!user) return <Login onLogin={setUser} />;

  const nav = [
    { k: "dashboard", l: "Dashboard", ic: "◫" },
    { k: "staircase", l: "Staircase", ic: "🪜" },
    { k: "knowledge", l: "Knowledge", ic: "🧠" },
    { k: "ai", l: "AI Advisor", ic: "◉" },
    { k: "alerts", l: "Alerts", ic: "⚡" },
  ];

  return (
    <div className="min-h-screen text-white" style={{
      background: `linear-gradient(180deg, ${D} 0%, #0f1f3a 50%, ${D} 100%)`,
      fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${G}25; border-radius: 4px; }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl px-4 py-2.5 flex items-center gap-4"
        style={{ background: "rgba(7,14,26,0.88)", borderBottom: `1px solid ${BD}` }}>
        <div className="flex items-center gap-2">
          <div className="flex items-end gap-[2px]">
            {[1,2,3,4].map(i => (
              <div key={i} className="rounded-t-sm" style={{ width: 3, height: i * 5, background: `linear-gradient(to top, ${T}, ${G})` }} />
            ))}
          </div>
          <span className="text-lg font-bold" style={{
            background: `linear-gradient(135deg, ${G}, #e8c87a)`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            fontFamily: "Georgia, serif",
          }}>ST.AIRS</span>
          <span className="text-[8px] text-gray-600 uppercase tracking-widest">v3.0</span>
        </div>

        <nav className="flex-1 flex justify-center gap-0.5">
          {nav.map(n => (
            <button key={n.k} onClick={() => { setView(n.k); setSelected(null); }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                view === n.k ? "" : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]"
              }`}
              style={view === n.k ? { background: `${G}15`, border: `1px solid ${G}20`, color: G } : { border: "1px solid transparent" }}>
              <span className="mr-1">{n.ic}</span>{n.l}
              {n.k === "alerts" && alerts.length > 0 && (
                <span className="ml-1 bg-red-500/70 text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">{alerts.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-600 hidden sm:inline">{user.full_name}</span>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: `${G}20`, color: G }}>
            {(user.full_name || "U")[0]}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-5">
        {err && (
          <Card className="mb-4 p-3 flex items-center gap-2 text-sm" style={{ borderColor: "#f8717120" }}>
            <span className="text-red-400">⚠ {err}</span>
            <button onClick={load} className="ml-auto text-xs underline text-gray-400 hover:text-white">Retry</button>
          </Card>
        )}

        {loading && view !== "ai" && view !== "knowledge" ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: `${G}20`, borderTopColor: G }} />
          </div>
        ) : (
          <div className={selected ? "grid grid-cols-1 lg:grid-cols-3 gap-5" : ""}>
            <div className={selected ? "lg:col-span-2" : ""}>
              {view === "dashboard" && <Dashboard data={dashboard} />}
              {view === "staircase" && <Staircase tree={tree} onSelect={setSelected} />}
              {view === "knowledge" && <Knowledge />}
              {view === "ai" && <AIChat />}
              {view === "alerts" && <Alerts alerts={alerts} />}
            </div>
            {selected && (
              <div className="lg:col-span-1">
                <Detail stair={selected} onClose={() => setSelected(null)} />
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="text-center py-5 text-gray-800 text-[9px] tracking-[0.3em] uppercase">
        DEVONEERS · ST.AIRS v3.0 · Knowledge Engine · {new Date().getFullYear()}
      </footer>
    </div>
  );
}
