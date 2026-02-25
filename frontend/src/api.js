import { API, GOLD } from "./constants";

// ═══ API CLIENT ═══
class StairsAPI {
  constructor() {
    this.token = localStorage.getItem("stairs_token");
    this.user = JSON.parse(localStorage.getItem("stairs_user") || "null");
    this._onAuthExpired = null;
  }
  setOnAuthExpired(callback) { this._onAuthExpired = callback; }
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
  _handleUnauthorized() {
    this.logout();
    if (this._onAuthExpired) this._onAuthExpired();
    throw new Error("Session expired");
  }
  async get(p) { const r = await fetch(`${API}${p}`, { headers: this.headers() }); if (r.status === 401) { this._handleUnauthorized(); } if (!r.ok) throw new Error(`GET ${p} → ${r.status}`); return r.json(); }
  async post(p, b) { const r = await fetch(`${API}${p}`, { method: "POST", headers: this.headers(), body: JSON.stringify(b) }); if (r.status === 401) { this._handleUnauthorized(); } if (!r.ok) throw new Error(`POST ${p} → ${r.status}`); return r.json(); }
  async put(p, b) { const r = await fetch(`${API}${p}`, { method: "PUT", headers: this.headers(), body: JSON.stringify(b) }); if (r.status === 401) { this._handleUnauthorized(); } if (!r.ok) throw new Error(`PUT ${p} → ${r.status}`); return r.json(); }
  async del(p) { const r = await fetch(`${API}${p}`, { method: "DELETE", headers: this.headers() }); if (r.status === 401) { this._handleUnauthorized(); } if (!r.ok) throw new Error(`DELETE ${p} → ${r.status}`); return r.status === 204 ? null : r.json(); }
}

export const api = new StairsAPI();


// ═══ ACTION PLANS API ═══
export const ActionPlansAPI = {
  async save(stairId, planType, rawText, tasks, feedback) {
    return api.post(`/api/v1/stairs/${stairId}/action-plans`, {
      plan_type: planType,
      raw_text: rawText,
      tasks: tasks || [],
      feedback: feedback || null,
    });
  },
  async getForStair(stairId) {
    return api.get(`/api/v1/stairs/${stairId}/action-plans`);
  },
  async getForStrategy(strategyId) {
    return api.get(`/api/v1/strategies/${strategyId}/action-plans`);
  },
};


// ═══ CONVERSATION STORE ═══
export class ConvStore {
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


// ═══ STRATEGY API ═══
export class StrategyAPI {
  constructor(uid) { this.uid = uid; this.localKey = `stairs_s_${uid}`; }
  async list() {
    try {
      const serverStrategies = await api.get("/api/v1/strategies");
      const localDrafts = this._getLocal().filter(s => s.source === "local");
      const serverIds = new Set(serverStrategies.map(s => String(s.id)));
      const cleanLocal = localDrafts.filter(s => !serverIds.has(s.id));
      if (cleanLocal.length !== this._getLocal().length) this._saveLocal(cleanLocal);
      return [...serverStrategies.map(s => ({ ...s, id: String(s.id), source: "server" })), ...cleanLocal];
    } catch (e) {
      if (e.message === "Session expired") throw e;
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
      if (e.message === "Session expired") throw e;
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


// ═══ NOTES STORE ═══
export class NotesStore {
  constructor(uid) { this.key = `stairs_notes_${uid}`; }
  list() { try { return JSON.parse(localStorage.getItem(this.key) || "[]").sort((a,b) => b.updated_at.localeCompare(a.updated_at)); } catch { return []; } }
  save(note) { const all = this.list(); const i = all.findIndex(n => n.id === note.id); if (i >= 0) all[i] = note; else all.unshift(note); localStorage.setItem(this.key, JSON.stringify(all)); }
  remove(id) { localStorage.setItem(this.key, JSON.stringify(this.list().filter(n => n.id !== id))); }
  create(title, content, source) { const n = { id: `n_${Date.now()}_${Math.random().toString(36).slice(2,5)}`, title, content, source: source || "manual", tags: [], pinned: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; this.save(n); return n; }
}
