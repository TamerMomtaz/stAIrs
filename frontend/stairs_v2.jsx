import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, TrendingUp, AlertTriangle, CheckCircle2, Target, Users, Brain, ChevronRight, ChevronDown, MessageSquare, BarChart3, Layers, LogIn, UserPlus, LogOut, Plus, X, Edit3, Trash2, RefreshCw, Send, Loader2, Settings, Globe, Download, Wifi, WifiOff } from 'lucide-react';

// ═══════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════
const API = 'http://localhost:8000/api/v1';
const WS_BASE = 'ws://localhost:8000/ws';

// ═══════════════════════════════════════════════
// API CLIENT
// ═══════════════════════════════════════════════
class StairsAPI {
  constructor() { this.token = localStorage.getItem('stairs_token'); }
  
  setToken(t) { this.token = t; if(t) localStorage.setItem('stairs_token', t); else localStorage.removeItem('stairs_token'); }
  
  headers() { 
    const h = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  async req(method, path, body) {
    try {
      const opts = { method, headers: this.headers() };
      if (body) opts.body = JSON.stringify(body);
      const r = await fetch(`${API}${path}`, opts);
      if (r.status === 401) { this.setToken(null); throw new Error('Session expired'); }
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || `Error ${r.status}`); }
      if (r.status === 204) return null;
      const ct = r.headers.get('content-type');
      if (ct && ct.includes('text/csv')) return r.text();
      return r.json();
    } catch(e) { if (e.message === 'Failed to fetch') throw new Error('Cannot reach server'); throw e; }
  }

  // Auth
  login(email, password) { return this.req('POST', '/auth/login', { email, password }); }
  register(email, password, full_name, language) { return this.req('POST', '/auth/register', { email, password, full_name, language }); }
  me() { return this.req('GET', '/auth/me'); }
  refresh() { return this.req('POST', '/auth/refresh'); }

  // Stairs
  listStairs(params = {}) { const q = new URLSearchParams(params).toString(); return this.req('GET', `/stairs${q ? '?' + q : ''}`); }
  getTree() { return this.req('GET', '/stairs/tree'); }
  getStair(id) { return this.req('GET', `/stairs/${id}`); }
  createStair(data) { return this.req('POST', '/stairs', data); }
  updateStair(id, data) { return this.req('PUT', `/stairs/${id}`, data); }
  deleteStair(id) { return this.req('DELETE', `/stairs/${id}`); }
  logProgress(id, data) { return this.req('POST', `/stairs/${id}/progress`, data); }
  getHistory(id) { return this.req('GET', `/stairs/${id}/history`); }

  // Dashboard & more
  dashboard() { return this.req('GET', '/dashboard'); }
  alerts() { return this.req('GET', '/alerts'); }
  updateAlert(id, status) { return this.req('PUT', `/alerts/${id}`, { status }); }
  frameworks() { return this.req('GET', '/frameworks'); }
  kpiSummary() { return this.req('GET', '/kpis/summary'); }
  
  // AI
  aiChat(message, context_stair_id, conversation_id) { return this.req('POST', '/ai/chat', { message, context_stair_id, conversation_id }); }
  aiAnalyze(id) { return this.req('POST', `/ai/analyze/${id}`); }
  aiGenerate(prompt, framework) { return this.req('POST', '/ai/generate', { prompt, framework }); }
}

const api = new StairsAPI();

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const HEALTH = {
  on_track: { bg: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500', label: 'On Track', labelAr: 'على المسار' },
  at_risk: { bg: 'bg-amber-500', text: 'text-amber-400', border: 'border-amber-500', label: 'At Risk', labelAr: 'في خطر' },
  off_track: { bg: 'bg-red-500', text: 'text-red-400', border: 'border-red-500', label: 'Off Track', labelAr: 'خارج المسار' },
  achieved: { bg: 'bg-violet-500', text: 'text-violet-400', border: 'border-violet-500', label: 'Achieved', labelAr: 'تم التحقيق' },
};

const TYPE_ICONS = { vision: '🏔️', objective: '🎯', key_result: '📊', initiative: '🚀', task: '✅', kpi: '📈', perspective: '👁️', strategic_objective: '⭐', measure: '📏' };

// ═══════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════
export default function STAIRSApp() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dashboard');
  const [lang, setLang] = useState('en');
  const [wsConnected, setWsConnected] = useState(false);
  const [toast, setToast] = useState(null);
  const wsRef = useRef(null);

  // Data state
  const [stairs, setStairs] = useState([]);
  const [tree, setTree] = useState([]);
  const [dashData, setDashData] = useState(null);
  const [alertsData, setAlertsData] = useState([]);
  const [selected, setSelected] = useState(null);

  const showToast = useCallback((msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Auto-login
  useEffect(() => {
    if (api.token) {
      api.me().then(u => { setUser(u); }).catch(() => { api.setToken(null); }).finally(() => setLoading(false));
    } else { setLoading(false); }
  }, []);

  // Fetch data when logged in
  const refreshData = useCallback(async () => {
    if (!user) return;
    try {
      const [s, t, d, a] = await Promise.all([api.listStairs(), api.getTree(), api.dashboard(), api.alerts()]);
      setStairs(s); setTree(t); setDashData(d); setAlertsData(a);
    } catch (e) { showToast(e.message, 'error'); }
  }, [user, showToast]);

  useEffect(() => { refreshData(); }, [refreshData]);

  // WebSocket
  useEffect(() => {
    if (!user) return;
    const orgId = user.organization_id;
    const userId = user.id;
    const url = `${WS_BASE}/${orgId}/${userId}${api.token ? '?token=' + api.token : ''}`;
    
    let ws;
    const connect = () => {
      try {
        ws = new WebSocket(url);
        ws.onopen = () => { setWsConnected(true); };
        ws.onclose = () => { setWsConnected(false); setTimeout(connect, 5000); };
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (['stair_created','stair_updated','stair_deleted','progress_logged','strategy_generated','kpi_logged'].includes(msg.event)) {
              refreshData();
              if (msg.event !== 'ping') showToast(`Real-time: ${msg.event.replace('_',' ')}`, 'ws');
            }
          } catch {}
        };
        wsRef.current = ws;
      } catch { setTimeout(connect, 5000); }
    };
    connect();
    return () => { if (ws) ws.close(); };
  }, [user, refreshData, showToast]);

  const handleLogin = async (email, password) => {
    const r = await api.login(email, password);
    api.setToken(r.access_token);
    setUser(r.user);
    return r;
  };

  const handleRegister = async (email, password, name, language) => {
    const r = await api.register(email, password, name, language);
    api.setToken(r.access_token);
    setUser(r.user);
    return r;
  };

  const handleLogout = () => { api.setToken(null); setUser(null); setStairs([]); setTree([]); setDashData(null); };

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="w-8 h-8 text-indigo-400 animate-spin" /></div>;

  if (!user) return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} lang={lang} setLang={setLang} />;

  return (
    <div className="min-h-screen bg-slate-950 text-white" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-xl text-sm font-medium shadow-xl animate-in slide-in-from-top ${
          toast.type === 'error' ? 'bg-red-600' : toast.type === 'ws' ? 'bg-indigo-600' : 'bg-emerald-600'
        }`}>{toast.msg}</div>
      )}

      {/* Header */}
      <header className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-end gap-[2px]">
              {[1,2,3,4].map(i => <div key={i} className="rounded-t" style={{width:5,height:i*7,background:`linear-gradient(to top, #6366F1, #8B5CF6)`}} />)}
            </div>
            <div>
              <span className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">ST.AIRS</span>
              <span className="text-[10px] text-slate-500 ml-2">v2.0</span>
            </div>
          </div>
          
          <nav className="flex items-center gap-1">
            {[
              {id:'dashboard',label:'Dashboard',icon:BarChart3},
              {id:'stairs',label:'Staircase',icon:Layers},
              {id:'tree',label:'Tree',icon:Target},
              {id:'ai',label:'AI',icon:Brain},
              {id:'alerts',label:`Alerts${alertsData.length ? ` (${alertsData.length})` : ''}`,icon:AlertTriangle},
            ].map(t => (
              <button key={t.id} onClick={() => setView(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  view === t.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <t.icon className="w-3.5 h-3.5" />{t.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {wsConnected ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-red-400" />}
            <button onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} className="text-xs text-slate-400 hover:text-white">
              <Globe className="w-3.5 h-3.5" />
            </button>
            <button onClick={refreshData} className="text-slate-400 hover:text-white"><RefreshCw className="w-3.5 h-3.5" /></button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-xs font-bold">
                {user.full_name?.[0] || 'U'}
              </div>
              <button onClick={handleLogout} className="text-slate-400 hover:text-red-400"><LogOut className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            {view === 'dashboard' && <DashboardView data={dashData} lang={lang} />}
            {view === 'stairs' && <StaircaseView stairs={stairs} lang={lang} onSelect={setSelected} />}
            {view === 'tree' && <TreeView tree={tree} stairs={stairs} lang={lang} onSelect={setSelected} onRefresh={refreshData} />}
            {view === 'ai' && <AIView contextStair={selected} lang={lang} />}
            {view === 'alerts' && <AlertsView alerts={alertsData} onRefresh={refreshData} lang={lang} />}
          </div>
          <div>
            <DetailPanel stair={selected} onClose={() => setSelected(null)} onRefresh={refreshData} lang={lang} showToast={showToast} />
          </div>
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════
// AUTH SCREEN
// ═══════════════════════════════════════════════
function AuthScreen({ onLogin, onRegister, lang, setLang }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('tee@devoneers.com');
  const [password, setPassword] = useState('stairs2026');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      if (mode === 'login') await onLogin(email, password);
      else await onRegister(email, password, name, lang);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-end justify-center gap-[3px] mb-3">
            {[1,2,3,4,5].map(i => <div key={i} className="rounded-t" style={{width:8,height:i*12,background:`linear-gradient(to top, #6366F1, #8B5CF6)`}} />)}
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">ST.AIRS</h1>
          <p className="text-slate-500 text-xs mt-1">Strategy AI Interactive Real-time System</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
          <div className="flex gap-1 mb-6 bg-slate-800 rounded-lg p-1">
            {['login','register'].map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${mode === m ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <input type="text" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            )}
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'login' ? <><LogIn className="w-4 h-4" /> Sign In</> : <><UserPlus className="w-4 h-4" /> Create Account</>}
            </button>
          </form>
        </div>
        <p className="text-center text-slate-600 text-[10px] mt-6">DEVONEERS · "Human IS the Loop"</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════
function DashboardView({ data, lang }) {
  if (!data) return <div className="text-slate-500 text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading dashboard...</div>;
  const s = data.stats;
  const stats = [
    { label: 'Total', value: s.total_elements, color: 'text-white' },
    { label: 'On Track', value: s.on_track, color: 'text-emerald-400' },
    { label: 'At Risk', value: s.at_risk, color: 'text-amber-400' },
    { label: 'Off Track', value: s.off_track, color: 'text-red-400' },
    { label: 'Progress', value: `${s.overall_progress}%`, color: 'text-indigo-400' },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-5 gap-3">
        {stats.map((st, i) => (
          <div key={i} className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4 text-center">
            <div className={`text-2xl font-bold ${st.color}`}>{st.value}</div>
            <div className="text-slate-500 text-[11px] mt-1">{st.label}</div>
          </div>
        ))}
      </div>
      {data.top_risks?.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> Top Risks</h3>
          <div className="space-y-2">
            {data.top_risks.map(r => (
              <div key={r.id} className={`flex items-center justify-between p-2 rounded-lg bg-slate-800/50 border-l-2 ${HEALTH[r.health]?.border || 'border-slate-600'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{TYPE_ICONS[r.element_type] || '📋'}</span>
                  <span className="text-sm text-white">{lang === 'ar' && r.title_ar ? r.title_ar : r.title}</span>
                </div>
                <span className={`text-xs font-mono ${HEALTH[r.health]?.text || 'text-slate-400'}`}>{r.progress_percent}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.alerts?.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Brain className="w-4 h-4 text-violet-400" /> AI Alerts</h3>
          <div className="space-y-2">
            {data.alerts.slice(0, 5).map(a => (
              <div key={a.id} className={`p-2 rounded-lg border-l-2 ${a.severity === 'critical' ? 'border-red-500 bg-red-500/5' : a.severity === 'high' ? 'border-amber-500 bg-amber-500/5' : 'border-blue-500 bg-blue-500/5'}`}>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${a.severity === 'critical' ? 'bg-red-600 text-white' : a.severity === 'high' ? 'bg-amber-600 text-white' : 'bg-blue-600 text-white'}`}>{a.severity}</span>
                <span className="text-xs text-slate-300 ml-2">{a.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// STAIRCASE VISUALIZATION
// ═══════════════════════════════════════════════
function StaircaseView({ stairs, lang, onSelect }) {
  if (!stairs?.length) return <div className="text-slate-500 text-center py-12">No strategy elements yet</div>;
  const sorted = [...stairs].sort((a, b) => a.level - b.level || a.sort_order - b.sort_order);
  return (
    <div className="bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800/50 rounded-2xl p-6 min-h-[400px]">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-semibold text-white">Strategy Staircase</h3>
      </div>
      <div className="flex flex-wrap items-end gap-2 justify-center min-h-[300px] py-8">
        {sorted.map((s, i) => {
          const h = 50 + (3 - Math.min(s.level, 3)) * 40;
          const w = s.level === 0 ? 150 : s.level === 1 ? 130 : 110;
          const hc = HEALTH[s.health] || HEALTH.on_track;
          return (
            <div key={s.id} onClick={() => onSelect(s)} className="cursor-pointer group transition-transform hover:scale-105"
              style={{ height: `${h}px`, width: `${w}px`, marginBottom: `${s.level * 16}px` }}>
              <div className={`relative h-full ${hc.bg} rounded-xl p-3 flex flex-col items-center justify-center shadow-lg shadow-black/30`}>
                <div className="absolute top-2 right-2 text-[10px] text-white/60 font-mono">{Math.round(s.progress_percent)}%</div>
                <span className="text-lg mb-1">{TYPE_ICONS[s.element_type] || '📋'}</span>
                <span className="text-white text-[11px] font-semibold text-center leading-tight">
                  {(lang === 'ar' && s.title_ar ? s.title_ar : s.title).slice(0, 20)}
                </span>
                <div className="absolute bottom-2 left-2 right-2 h-1 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-white/70 rounded-full" style={{ width: `${s.progress_percent}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex gap-4 justify-center mt-2">
        {Object.entries(HEALTH).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1"><div className={`w-2 h-2 rounded-full ${v.bg}`} /><span className="text-[10px] text-slate-400">{lang === 'ar' ? v.labelAr : v.label}</span></div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TREE VIEW
// ═══════════════════════════════════════════════
function TreeView({ tree, stairs, lang, onSelect, onRefresh }) {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Target className="w-4 h-4 text-indigo-400" /> Strategy Tree</h3>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg">
          <Plus className="w-3 h-3" /> Add Element
        </button>
      </div>
      {showCreate && <CreateStairForm onCreated={() => { setShowCreate(false); onRefresh(); }} onCancel={() => setShowCreate(false)} />}
      <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4 space-y-1">
        {tree?.length ? tree.map(node => <TreeNode key={node.stair.id} node={node} lang={lang} onSelect={onSelect} depth={0} />) 
          : <div className="text-slate-500 text-center py-8">No elements — create your first stair!</div>}
      </div>
    </div>
  );
}

function TreeNode({ node, lang, onSelect, depth }) {
  const [open, setOpen] = useState(depth < 2);
  const s = node.stair;
  const hc = HEALTH[s.health] || HEALTH.on_track;
  const hasChildren = node.children?.length > 0;
  return (
    <div>
      <div className={`flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-slate-800/50 cursor-pointer transition-colors`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => onSelect(s)}>
        {hasChildren ? (
          <button onClick={(e) => { e.stopPropagation(); setOpen(!open); }} className="text-slate-400 hover:text-white">
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : <span className="w-3" />}
        <div className={`w-2 h-2 rounded-full ${hc.bg}`} />
        <span className="text-xs">{TYPE_ICONS[s.element_type] || '📋'}</span>
        <span className="text-sm text-white flex-1 truncate">{lang === 'ar' && s.title_ar ? s.title_ar : s.title}</span>
        <span className="text-[10px] text-slate-500 font-mono">{s.code}</span>
        <span className={`text-xs font-mono ${hc.text}`}>{Math.round(s.progress_percent)}%</span>
        <div className="w-16 h-1 bg-slate-700 rounded-full overflow-hidden"><div className={`h-full ${hc.bg}`} style={{width:`${s.progress_percent}%`}} /></div>
      </div>
      {open && hasChildren && node.children.map(c => <TreeNode key={c.stair.id} node={c} lang={lang} onSelect={onSelect} depth={depth + 1} />)}
    </div>
  );
}

// ═══════════════════════════════════════════════
// CREATE STAIR FORM
// ═══════════════════════════════════════════════
function CreateStairForm({ onCreated, onCancel, parentId }) {
  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [type, setType] = useState('objective');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      await api.createStair({ title, title_ar: titleAr || null, element_type: type, parent_id: parentId || null });
      onCreated();
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <form onSubmit={submit} className="bg-slate-900/80 border border-slate-700 rounded-xl p-4 space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm font-semibold text-white">New Strategy Element</span>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <select value={type} onChange={e => setType(e.target.value)}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
        {['vision','objective','key_result','initiative','task','kpi','perspective','strategic_objective','measure'].map(t =>
          <option key={t} value={t}>{TYPE_ICONS[t]} {t.replace('_',' ')}</option>
        )}
      </select>
      <input type="text" placeholder="Title (English)" value={title} onChange={e => setTitle(e.target.value)} required
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
      <input type="text" placeholder="العنوان (عربي)" value={titleAr} onChange={e => setTitleAr(e.target.value)} dir="rtl"
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Create</>}
      </button>
    </form>
  );
}

// ═══════════════════════════════════════════════
// AI CHAT
// ═══════════════════════════════════════════════
function AIView({ contextStair, lang }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState(null);
  const bottomRef = useRef(null);

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input; setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    try {
      const r = await api.aiChat(msg, contextStair?.id, convId);
      setConvId(r.conversation_id);
      setMessages(prev => [...prev, { role: 'assistant', content: r.response }]);
    } catch (e) { setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]); }
    setLoading(false);
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const quickPrompts = [
    "Analyze risks for this quarter",
    "Suggest Key Results",
    "What's blocking progress?",
    lang === 'ar' ? "حلل المخاطر الحالية" : "Generate a strategy for growth",
  ];

  return (
    <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl flex flex-col" style={{height:'520px'}}>
      <div className="flex items-center gap-3 p-4 border-b border-slate-800/50">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="text-white font-semibold text-sm">ST.AIRS AI</div>
          <div className="text-slate-500 text-[10px]">
            {contextStair ? `Focused on: ${contextStair.title}` : 'Strategy Intelligence'}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Sparkles className="w-10 h-10 mx-auto text-violet-500/50 mb-3" />
            <p className="text-slate-400 text-sm mb-4">How can I help with your strategy?</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {quickPrompts.map((p, i) => (
                <button key={i} onClick={() => setInput(p)} className="text-[11px] px-3 py-1 rounded-full border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">{p}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-200 rounded-tl-sm'}`}>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}
        {loading && <div className="flex items-center gap-2 text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs">Thinking...</span></div>}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-slate-800/50">
        <div className="flex gap-2">
          <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask ST.AIRS..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button onClick={send} disabled={loading || !input.trim()} className="bg-indigo-600 hover:bg-indigo-500 p-2 rounded-xl disabled:opacity-30">
            {loading ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// ALERTS
// ═══════════════════════════════════════════════
function AlertsView({ alerts, onRefresh, lang }) {
  const dismiss = async (id) => {
    try { await api.updateAlert(id, 'dismissed'); onRefresh(); } catch {}
  };
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Brain className="w-4 h-4 text-violet-400" /> AI Alerts ({alerts.length})</h3>
      {alerts.length === 0 ? <div className="text-slate-500 text-center py-12">No active alerts</div> :
        <div className="space-y-2">
          {alerts.map(a => (
            <div key={a.id} className={`bg-slate-900/60 border rounded-xl p-4 ${a.severity === 'critical' ? 'border-red-500/30' : a.severity === 'high' ? 'border-amber-500/30' : 'border-slate-700'}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${a.severity === 'critical' ? 'bg-red-600 text-white' : a.severity === 'high' ? 'bg-amber-600 text-white' : 'bg-slate-600 text-slate-200'}`}>{a.severity}</span>
                  <span className="text-sm text-white font-medium">{lang === 'ar' && a.title_ar ? a.title_ar : a.title}</span>
                </div>
                <button onClick={() => dismiss(a.id)} className="text-slate-500 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
              </div>
              {a.description && <p className="text-slate-400 text-xs mt-2">{a.description}</p>}
            </div>
          ))}
        </div>
      }
    </div>
  );
}

// ═══════════════════════════════════════════════
// DETAIL PANEL
// ═══════════════════════════════════════════════
function DetailPanel({ stair, onClose, onRefresh, lang, showToast }) {
  const [editing, setEditing] = useState(false);
  const [progress, setProgress] = useState('');
  const [notes, setNotes] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  if (!stair) return (
    <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4 text-center py-12">
      <Target className="w-8 h-8 text-slate-600 mx-auto mb-2" />
      <p className="text-slate-500 text-xs">Select a stair to see details</p>
    </div>
  );

  const hc = HEALTH[stair.health] || HEALTH.on_track;

  const logProg = async () => {
    if (!progress) return;
    try {
      await api.logProgress(stair.id, { progress_percent: parseFloat(progress), notes: notes || null });
      showToast('Progress logged!', 'info');
      setProgress(''); setNotes('');
      onRefresh();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const analyze = async () => {
    setAnalyzing(true);
    try {
      const r = await api.aiAnalyze(stair.id);
      showToast(`Risk: ${r.risk_level} (${r.risk_score}/100)`, r.risk_level === 'high' || r.risk_level === 'critical' ? 'error' : 'info');
      onRefresh();
    } catch (e) { showToast(e.message, 'error'); }
    setAnalyzing(false);
  };

  const del = async () => {
    if (!confirm('Delete this element?')) return;
    try { await api.deleteStair(stair.id); onClose(); onRefresh(); showToast('Deleted'); } catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">{stair.element_type?.replace('_',' ')}</div>
          <h3 className="text-white font-semibold text-sm">{lang === 'ar' && stair.title_ar ? stair.title_ar : stair.title}</h3>
          <div className="text-[10px] text-slate-500 font-mono">{stair.code}</div>
        </div>
        <div className="flex gap-1">
          <button onClick={del} className="text-slate-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <div className={`px-2 py-1 rounded-full text-[10px] font-medium ${hc.bg} text-white inline-block`}>{lang === 'ar' ? hc.labelAr : hc.label}</div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs mb-1"><span className="text-slate-400">Progress</span><span className="text-white font-mono">{Math.round(stair.progress_percent)}%</span></div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden"><div className={`h-full ${hc.bg} transition-all`} style={{width:`${stair.progress_percent}%`}} /></div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-800/50 rounded-lg p-2"><div className="text-[10px] text-slate-500">AI Risk</div><div className="text-white text-sm font-semibold">{stair.ai_risk_score != null ? `${Math.round(stair.ai_risk_score)}/100` : '—'}</div></div>
        <div className="bg-slate-800/50 rounded-lg p-2"><div className="text-[10px] text-slate-500">Confidence</div><div className="text-white text-sm font-semibold">{Math.round(stair.confidence_percent || 50)}%</div></div>
      </div>

      {stair.target_value != null && (
        <div className="bg-slate-800/50 rounded-lg p-2">
          <div className="text-[10px] text-slate-500">Target</div>
          <div className="text-white text-sm">{stair.current_value ?? 0} / {stair.target_value} {stair.unit || ''}</div>
        </div>
      )}

      {/* Log progress */}
      <div className="space-y-2 pt-2 border-t border-slate-800">
        <div className="text-xs text-slate-400">Log Progress</div>
        <div className="flex gap-2">
          <input type="number" min="0" max="100" placeholder="%" value={progress} onChange={e => setProgress(e.target.value)}
            className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" />
          <input type="text" placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-slate-500" />
          <button onClick={logProg} className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg text-xs text-white">Log</button>
        </div>
      </div>

      <button onClick={analyze} disabled={analyzing}
        className="w-full bg-violet-600 hover:bg-violet-500 text-white py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-50">
        {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {analyzing ? 'Analyzing...' : 'AI Risk Analysis'}
      </button>
    </div>
  );
}
