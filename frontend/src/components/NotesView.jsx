import { useState, useEffect, useRef } from "react";
import { NotesStore, NotesAPI } from "../api";
import { GOLD, GRAD_ACCENT, glass, inputCls, tint } from "../constants";
import { logoUrl, printDocument } from "../exportUtils";
import { ViewHeader } from "./ViewHeader";

export const NotesView = ({ lang, userId, strategyName }) => {
  const storeRef = useRef(null); if (!storeRef.current && userId) storeRef.current = new NotesStore(userId); const store = storeRef.current;
  const [notes, setNotes] = useState([]); const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState(""); const [content, setContent] = useState("");
  const [search, setSearch] = useState(""); const [confirmDel, setConfirmDel] = useState(null);
  const [offline, setOffline] = useState(false);
  const isAr = lang === "ar";

  // Notes are server-backed. The local store is an offline cache and the home
  // of any note written before notes were persisted — those are pushed up once
  // on first load so nothing written earlier stays stranded in one browser.
  const refresh = async () => {
    try {
      const server = await NotesAPI.list();
      const local = store ? store.list() : [];
      const seen = new Set(server.map(n => `${n.title}::${n.content}`));
      const strays = local.filter(n => !seen.has(`${n.title}::${n.content}`));
      if (strays.length) {
        const migrated = await Promise.all(strays.map(n =>
          NotesAPI.create({ title: n.title, content: n.content, source: n.source || "manual", pinned: !!n.pinned })
            .then(saved => { store.remove(n.id); return saved; })
            .catch(() => null)
        ));
        setNotes([...migrated.filter(Boolean), ...server].sort((a, b) => (b.pinned - a.pinned) || String(b.updated_at).localeCompare(String(a.updated_at))));
      } else {
        setNotes(server);
      }
      setOffline(false);
    } catch (e) {
      console.warn("[stairs] notes unavailable, showing local cache:", e.message);
      setOffline(true);
      if (store) setNotes(store.list());
    }
  };
  useEffect(() => { refresh(); }, [store]);

  const startNew = () => { setEditing("new"); setTitle(""); setContent(""); };
  const startEdit = (n) => { setEditing(n.id); setTitle(n.title); setContent(n.content); };
  const saveNote = async () => {
    if (!title.trim()) return;
    try {
      if (editing === "new") await NotesAPI.create({ title: title.trim(), content, source: "manual" });
      else await NotesAPI.update(editing, { title: title.trim(), content });
    } catch (e) {
      console.warn("[stairs] note save failed, keeping local copy:", e.message);
      setOffline(true);
      if (store) {
        if (editing === "new") store.create(title.trim(), content, "manual");
        else { const n = notes.find(x => x.id === editing); if (n) { n.title = title.trim(); n.content = content; n.updated_at = new Date().toISOString(); store.save(n); } }
      }
    }
    setEditing(null); setTitle(""); setContent(""); refresh();
  };
  const deleteNote = async (id) => {
    try { await NotesAPI.remove(id); } catch { if (store) store.remove(id); }
    setConfirmDel(null); refresh();
  };
  const togglePin = async (n) => {
    try { await NotesAPI.update(n.id, { pinned: !n.pinned }); }
    catch { if (store) { n.pinned = !n.pinned; n.updated_at = new Date().toISOString(); store.save(n); } }
    refresh();
  };
  const exportNote = (n) => {
    const w = window.open("", "_blank"); if (!w) return;
    printDocument(w, `<!DOCTYPE html><html><head><title>${n.title}</title><style>body{font-family:system-ui;padding:40px;max-width:700px;margin:0 auto;color:#1e293b;line-height:1.7}h1{color:#B8904A;border-bottom:2px solid #B8904A;padding-bottom:8px}pre{background:#f1f5f9;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;white-space:pre-wrap}.meta{color:#94a3b8;font-size:12px;margin-bottom:24px}.source{display:inline-block;background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:4px;font-size:11px}</style></head><body><div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><img src="${logoUrl()}" style="height:28px" alt="DEVONEERS" /><span style="font-size:14px;font-weight:700;color:#B8904A;letter-spacing:2px">Stairs</span><span style="color:#64748b;font-size:12px;letter-spacing:1px">&nbsp;|&nbsp; ${strategyName || "Strategy"} &nbsp;|&nbsp; ${new Date().toLocaleDateString()}</span></div><h1>${n.title}</h1><div class="meta">${strategyName ? `Strategy: ${strategyName} · ` : ""}${new Date(n.created_at).toLocaleString()} · <span class="source">${n.source}</span></div><pre>${n.content}</pre><div style="margin-top:40px;text-align:center;padding-top:20px;border-top:2px solid #B8904A"><div style="font-size:14px;font-weight:700;color:#B8904A;letter-spacing:3px;margin-bottom:4px">BY DEVONEERS &bull; Stairs &bull; HUMAN IS THE LOOP &bull; ${new Date().getFullYear()}</div></div></body></html>`);
  };
  const copyNote = (n) => { navigator.clipboard?.writeText(`${n.title}\n\n${n.content}`).then(() => alert("Copied to clipboard!")); };
  const filtered = notes.filter(n => !search || n.title.toLowerCase().includes(search.toLowerCase()) || n.content.toLowerCase().includes(search.toLowerCase()));
  const pinned = filtered.filter(n => n.pinned);
  const unpinned = filtered.filter(n => !n.pinned);
  const sourceIcon = s => ({ ai_chat: "🤖", ai_explain: "💡", ai_enhance: "✨", manual: "📝" }[s] || "📄");

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => { setEditing(null); setTitle(""); setContent(""); }} className="text-ink-muted hover:text-ink text-sm transition">← {isAr ? "رجوع" : "Back"}</button>
          <span className="text-ink font-semibold text-sm">{editing === "new" ? (isAr ? "ملاحظة جديدة" : "New Note") : (isAr ? "تعديل" : "Edit Note")}</span>
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={isAr ? "عنوان الملاحظة..." : "Note title..."} className={inputCls} style={{ padding: "12px 16px", fontSize: "15px" }} />
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder={isAr ? "اكتب ملاحظتك هنا..." : "Write your note here... (paste AI insights, ideas, etc.)"} rows={12} className={`${inputCls} resize-none`} style={{ padding: "12px 16px", fontSize: "14px", lineHeight: "1.7" }} />
        <div className="flex justify-end gap-3">
          <button onClick={() => { setEditing(null); }} className="px-4 py-2 rounded-lg text-sm text-ink-3 hover:text-ink transition">{isAr ? "إلغاء" : "Cancel"}</button>
          <button onClick={saveNote} disabled={!title.trim()} className="px-5 py-2 rounded-lg text-sm font-semibold text-ink-on-accent disabled:opacity-40 transition-all hover:scale-[1.02]" style={{ background: GRAD_ACCENT }}>{isAr ? "حفظ" : "Save Note"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ViewHeader title={isAr ? "ملاحظات" : "Notes"} />
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]" style={{ background: `${tint(GOLD, 13)}`, border: `1px solid ${tint(GOLD, 20)}`, color: GOLD }}>+ {isAr ? "ملاحظة جديدة" : "New Note"}</button>
        <div className="flex-1" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={isAr ? "بحث..." : "Search notes..."} className={inputCls} style={{ padding: "8px 14px", fontSize: "13px", maxWidth: "240px" }} />
        <span className="text-ink-faint text-xs">{notes.length} {isAr ? "ملاحظة" : "notes"}</span>
      </div>
      {offline && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] bg-amber-500/10 border border-amber-500/25 text-amber-300">
          <span>⚠</span>
          <span>{isAr
            ? "تعذّر الوصول إلى الخادم — تُعرض نسخة محلية من هذا المتصفح فقط، وستُرفع تلقائيًا عند عودة الاتصال."
            : "Can't reach the server — showing a local copy from this browser only. It will be uploaded automatically once the connection is back."}</span>
        </div>
      )}
      {notes.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">📝</div>
          <div className="text-ink-muted text-sm mb-2">{isAr ? "لا توجد ملاحظات بعد." : "No notes yet."}</div>
          <div className="text-ink-faint text-xs">{isAr ? "احفظ الأفكار من محادثات الذكاء الاصطناعي أو اكتب ملاحظاتك." : "Save insights from AI chats, or write your own notes."}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {[...pinned, ...unpinned].map(n => (
            <div key={n.id} className="group p-4 rounded-xl transition-all hover:scale-[1.005]" style={{ ...glass(0.5), borderColor: n.pinned ? `${tint(GOLD, 25)}` : undefined }}>
              <div className="flex items-start gap-3">
                <span className="text-base shrink-0 mt-0.5">{sourceIcon(n.source)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {n.pinned && <span className="text-amber-400 text-xs">📌</span>}
                    <span className="text-ink font-medium text-sm truncate">{n.title}</span>
                  </div>
                  <div className="text-ink-muted text-xs mt-1 line-clamp-2">{n.content.slice(0, 150)}{n.content.length > 150 ? "..." : ""}</div>
                  <div className="text-ink-ghost text-[10px] mt-2">{new Date(n.updated_at).toLocaleString()} · {n.source.replace("_", " ")}</div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                  <button onClick={() => togglePin(n)} className="p-1.5 rounded-lg text-xs hover:bg-lift/5 transition" title="Pin">{n.pinned ? "📌" : "📍"}</button>
                  <button onClick={() => startEdit(n)} className="p-1.5 rounded-lg text-xs text-ink-muted hover:text-ink hover:bg-lift/5 transition" title="Edit">✎</button>
                  <button onClick={() => copyNote(n)} className="p-1.5 rounded-lg text-xs text-ink-muted hover:text-ink hover:bg-lift/5 transition" title="Copy">📋</button>
                  <button onClick={() => exportNote(n)} className="p-1.5 rounded-lg text-xs text-ink-muted hover:text-ink hover:bg-lift/5 transition" title="Export">↗</button>
                  <button onClick={() => confirmDel === n.id ? deleteNote(n.id) : setConfirmDel(n.id)} className={`p-1.5 rounded-lg text-xs transition ${confirmDel === n.id ? "bg-red-500/20 text-red-300" : "text-ink-faint hover:text-red-400 hover:bg-red-500/10"}`} title="Delete">{confirmDel === n.id ? "?" : "✕"}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
