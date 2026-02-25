import { useState, useEffect, useRef } from "react";
import { NotesStore, NotesAPI } from "../api";
import { GOLD, GOLD_L, glass, inputCls } from "../constants";

export const NotesView = ({ lang, userId, strategyName }) => {
  const storeRef = useRef(null); if (!storeRef.current && userId) storeRef.current = new NotesStore(userId); const store = storeRef.current;
  const [notes, setNotes] = useState([]); const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState(""); const [content, setContent] = useState("");
  const [search, setSearch] = useState(""); const [confirmDel, setConfirmDel] = useState(null);
  const isAr = lang === "ar";
  useEffect(() => {
    NotesAPI.list().then(serverNotes => {
      setNotes(serverNotes || []);
      if (store) store._saveLocal(serverNotes || []);
    }).catch(() => {
      if (store) setNotes(store.list());
    });
  }, [store]);
  const refresh = () => {
    NotesAPI.list().then(serverNotes => {
      setNotes(serverNotes || []);
      if (store) store._saveLocal(serverNotes || []);
    }).catch(() => {
      if (store) setNotes(store.list());
    });
  };
  const startNew = () => { setEditing("new"); setTitle(""); setContent(""); };
  const startEdit = (n) => { setEditing(n.id); setTitle(n.title); setContent(n.content); };
  const saveNote = async () => {
    if (!title.trim()) return;
    try {
      if (editing === "new") {
        await NotesAPI.create(title.trim(), content, "manual");
      } else {
        await NotesAPI.update(editing, { title: title.trim(), content });
      }
    } catch (err) {
      console.warn("Note save failed:", err.message);
      if (store) {
        if (editing === "new") { store.create(title.trim(), content, "manual"); }
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
    const newPinned = !n.pinned;
    try { await NotesAPI.update(n.id, { pinned: newPinned }); } catch { if (store) { n.pinned = newPinned; n.updated_at = new Date().toISOString(); store.save(n); } }
    refresh();
  };
  const exportNote = (n) => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>${n.title}</title><style>body{font-family:system-ui;padding:40px;max-width:700px;margin:0 auto;color:#1e293b;line-height:1.7}h1{color:#B8904A;border-bottom:2px solid #B8904A;padding-bottom:8px}pre{background:#f1f5f9;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;white-space:pre-wrap}.meta{color:#94a3b8;font-size:12px;margin-bottom:24px}.source{display:inline-block;background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:4px;font-size:11px}</style></head><body><h1>${n.title}</h1><div class="meta">${strategyName ? `Strategy: ${strategyName} · ` : ""}${new Date(n.created_at).toLocaleString()} · <span class="source">${n.source}</span></div><pre>${n.content}</pre><div style="margin-top:30px;text-align:center;color:#94a3b8;font-size:10px">ST.AIRS Notes · By DEVONEERS</div></body></html>`);
    w.document.close(); w.print();
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
          <button onClick={() => { setEditing(null); setTitle(""); setContent(""); }} className="text-gray-500 hover:text-white text-sm transition">← {isAr ? "رجوع" : "Back"}</button>
          <span className="text-white font-semibold text-sm">{editing === "new" ? (isAr ? "ملاحظة جديدة" : "New Note") : (isAr ? "تعديل" : "Edit Note")}</span>
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={isAr ? "عنوان الملاحظة..." : "Note title..."} className={inputCls} style={{ padding: "12px 16px", fontSize: "15px" }} />
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder={isAr ? "اكتب ملاحظتك هنا..." : "Write your note here... (paste AI insights, ideas, etc.)"} rows={12} className={`${inputCls} resize-none`} style={{ padding: "12px 16px", fontSize: "14px", lineHeight: "1.7" }} />
        <div className="flex justify-end gap-3">
          <button onClick={() => { setEditing(null); }} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">{isAr ? "إلغاء" : "Cancel"}</button>
          <button onClick={saveNote} disabled={!title.trim()} className="px-5 py-2 rounded-lg text-sm font-semibold text-[#0a1628] disabled:opacity-40 transition-all hover:scale-[1.02]" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` }}>{isAr ? "حفظ" : "Save Note"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]" style={{ background: `${GOLD}22`, border: `1px solid ${GOLD}33`, color: GOLD }}>+ {isAr ? "ملاحظة جديدة" : "New Note"}</button>
        <div className="flex-1" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={isAr ? "بحث..." : "Search notes..."} className={inputCls} style={{ padding: "8px 14px", fontSize: "13px", maxWidth: "240px" }} />
        <span className="text-gray-600 text-xs">{notes.length} {isAr ? "ملاحظة" : "notes"}</span>
      </div>
      {notes.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">📝</div>
          <div className="text-gray-500 text-sm mb-2">{isAr ? "لا توجد ملاحظات بعد." : "No notes yet."}</div>
          <div className="text-gray-600 text-xs">{isAr ? "احفظ الأفكار من محادثات الذكاء الاصطناعي أو اكتب ملاحظاتك." : "Save insights from AI chats, or write your own notes."}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {[...pinned, ...unpinned].map(n => (
            <div key={n.id} className="group p-4 rounded-xl transition-all hover:scale-[1.005]" style={{ ...glass(0.5), borderColor: n.pinned ? `${GOLD}40` : undefined }}>
              <div className="flex items-start gap-3">
                <span className="text-base shrink-0 mt-0.5">{sourceIcon(n.source)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {n.pinned && <span className="text-amber-400 text-xs">📌</span>}
                    <span className="text-white font-medium text-sm truncate">{n.title}</span>
                  </div>
                  <div className="text-gray-500 text-xs mt-1 line-clamp-2">{n.content.slice(0, 150)}{n.content.length > 150 ? "..." : ""}</div>
                  <div className="text-gray-700 text-[10px] mt-2">{new Date(n.updated_at).toLocaleString()} · {n.source.replace("_", " ")}</div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                  <button onClick={() => togglePin(n)} className="p-1.5 rounded-lg text-xs hover:bg-white/5 transition" title="Pin">{n.pinned ? "📌" : "📍"}</button>
                  <button onClick={() => startEdit(n)} className="p-1.5 rounded-lg text-xs text-gray-500 hover:text-white hover:bg-white/5 transition" title="Edit">✎</button>
                  <button onClick={() => copyNote(n)} className="p-1.5 rounded-lg text-xs text-gray-500 hover:text-white hover:bg-white/5 transition" title="Copy">📋</button>
                  <button onClick={() => exportNote(n)} className="p-1.5 rounded-lg text-xs text-gray-500 hover:text-white hover:bg-white/5 transition" title="Export">↗</button>
                  <button onClick={() => confirmDel === n.id ? deleteNote(n.id) : setConfirmDel(n.id)} className={`p-1.5 rounded-lg text-xs transition ${confirmDel === n.id ? "bg-red-500/20 text-red-300" : "text-gray-600 hover:text-red-400 hover:bg-red-500/10"}`} title="Delete">{confirmDel === n.id ? "?" : "✕"}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
