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
  async signup(name, email, password, confirmPassword) {
    const r = await fetch(`${API}/api/v1/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password, confirm_password: confirmPassword }) });
    if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.detail || "Signup failed"); }
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
  async aiPost(p, b, onRetry) {
    const maxRetries = 3;
    const retryDelay = 5000;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const r = await fetch(`${API}${p}`, { method: "POST", headers: this.headers(), body: JSON.stringify(b) });
      if (r.status === 401) { this._handleUnauthorized(); }
      if (r.status === 529 && attempt < maxRetries) {
        if (onRetry) onRetry(attempt, maxRetries);
        await new Promise(res => setTimeout(res, retryDelay));
        continue;
      }
      if (!r.ok) throw new Error(`POST ${p} → ${r.status}`);
      return r.json();
    }
  }
  async put(p, b) { const r = await fetch(`${API}${p}`, { method: "PUT", headers: this.headers(), body: JSON.stringify(b) }); if (r.status === 401) { this._handleUnauthorized(); } if (!r.ok) throw new Error(`PUT ${p} → ${r.status}`); return r.json(); }
  async patch(p, b) { const r = await fetch(`${API}${p}`, { method: "PATCH", headers: this.headers(), body: JSON.stringify(b) }); if (r.status === 401) { this._handleUnauthorized(); } if (!r.ok) throw new Error(`PATCH ${p} → ${r.status}`); return r.json(); }
  async del(p) { const r = await fetch(`${API}${p}`, { method: "DELETE", headers: this.headers() }); if (r.status === 401) { this._handleUnauthorized(); } if (!r.ok) throw new Error(`DELETE ${p} → ${r.status}`); return r.status === 204 ? null : r.json(); }
  async uploadFile(p, file, onProgress) {
    const formData = new FormData();
    formData.append("file", file);
    const h = {};
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    const xhr = new XMLHttpRequest();
    return new Promise((resolve, reject) => {
      xhr.open("POST", `${API}${p}`);
      Object.entries(h).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      if (onProgress) xhr.upload.addEventListener("progress", e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); });
      xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) { try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({}); } } else if (xhr.status === 401) { this._handleUnauthorized(); } else { try { const err = JSON.parse(xhr.responseText); reject(new Error(err.detail || `Upload failed: ${xhr.status}`)); } catch { reject(new Error(`Upload failed: ${xhr.status}`)); } } };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(formData);
    });
  }
}

export const api = new StairsAPI();


// ═══ DOCUMENT TEXT EXTRACTION (Wizard) ═══
export async function extractDocumentText(files) {
  const formData = new FormData();
  files.forEach(f => formData.append("files", f));
  const h = {};
  if (api.token) h["Authorization"] = `Bearer ${api.token}`;
  const r = await fetch(`${API}/api/v1/ai/extract-document-text`, { method: "POST", headers: h, body: formData });
  if (r.status === 401) { api._handleUnauthorized(); }
  if (!r.ok) throw new Error(`Text extraction failed: ${r.status}`);
  return r.json();
}


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
  async updateTaskDone(planId, taskIndex, done) {
    return api.patch(`/api/v1/action-plans/${planId}/tasks`, {
      task_index: taskIndex,
      done,
    });
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


// ═══ SOURCES API (Source of Truth) ═══
export const SourcesAPI = {
  async list(strategyId, { sourceType, search } = {}) {
    let path = `/api/v1/strategies/${strategyId}/sources`;
    const params = [];
    if (sourceType) params.push(`source_type=${encodeURIComponent(sourceType)}`);
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    if (params.length) path += `?${params.join("&")}`;
    return api.get(path);
  },
  async count(strategyId, sourceType) {
    let path = `/api/v1/strategies/${strategyId}/sources/count`;
    if (sourceType) path += `?source_type=${encodeURIComponent(sourceType)}`;
    return api.get(path);
  },
  async create(strategyId, sourceType, content, metadata = {}) {
    return api.post(`/api/v1/strategies/${strategyId}/sources`, {
      source_type: sourceType,
      content,
      metadata,
    });
  },
  async update(strategyId, sourceId, updates) {
    return api.put(`/api/v1/strategies/${strategyId}/sources/${sourceId}`, updates);
  },
  async remove(strategyId, sourceId) {
    return api.del(`/api/v1/strategies/${strategyId}/sources/${sourceId}`);
  },
  async uploadDocument(strategyId, file, onProgress) {
    return api.uploadFile(`/api/v1/strategies/${strategyId}/sources/upload`, file, onProgress);
  },
  async getDownloadUrl(strategyId, sourceId) {
    return api.get(`/api/v1/strategies/${strategyId}/sources/${sourceId}/download-url`);
  },
  async removeWithFile(strategyId, sourceId) {
    return api.del(`/api/v1/strategies/${strategyId}/sources/${sourceId}/with-file`);
  },
  async analyzeDocument(strategyId, sourceId) {
    return api.aiPost(`/api/v1/strategies/${strategyId}/sources/${sourceId}/analyze`);
  },
  async approveExtractions(strategyId, sourceId, items) {
    return api.post(`/api/v1/strategies/${strategyId}/sources/${sourceId}/approve-extractions`, { items });
  },
};


// ═══ MANIFEST STORE (Manifest Room persistence) ═══
export class ManifestStore {
  constructor(strategyId) { this.key = `stairs_manifest_${strategyId}`; }
  _load() { try { return JSON.parse(localStorage.getItem(this.key) || "{}"); } catch { return {}; } }
  _save(data) { localStorage.setItem(this.key, JSON.stringify(data)); }
  getAll() { return this._load(); }
  get(stairId, taskId) { return this._load()[`${stairId}_${taskId}`] || null; }
  set(stairId, taskId, updates) {
    const all = this._load();
    const k = `${stairId}_${taskId}`;
    all[k] = { ...(all[k] || {}), stair_id: stairId, task_id: taskId, ...updates, updated_at: new Date().toISOString() };
    this._save(all);
    return all[k];
  }
  setImplSteps(stairId, taskId, steps) {
    const all = this._load();
    const k = `${stairId}_${taskId}`;
    if (all[k]) { all[k].impl_steps = steps; all[k].updated_at = new Date().toISOString(); this._save(all); }
  }
  getImplSteps(stairId, taskId) { return this._load()[`${stairId}_${taskId}`]?.impl_steps || null; }
  getAllForStair(stairId) {
    const all = this._load();
    return Object.values(all).filter(m => m.stair_id === stairId);
  }
}


// ═══ ADMIN / AGENT TRANSPARENCY API ═══
export const AdminAPI = {
  async getAgentStats() {
    return api.get("/api/v1/admin/agents");
  },
};


// ═══ MATRIX RESULTS STORE ═══
export class MatrixResultsStore {
  constructor(strategyId) { this.key = `stairs_matrix_${strategyId}`; }
  getAll() { try { return JSON.parse(localStorage.getItem(this.key) || "{}"); } catch { return {}; } }
  get(matrixKey) { return this.getAll()[matrixKey] || null; }
  save(matrixKey, data) { const all = this.getAll(); all[matrixKey] = { ...data, saved_at: new Date().toISOString() }; localStorage.setItem(this.key, JSON.stringify(all)); }
}
