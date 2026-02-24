import { useState, useEffect, useMemo } from "react";
import { GOLD, GOLD_L, BORDER, typeLabels, typeLabelsAr, typeColors, typeIcons, inputCls, labelCls } from "../constants";
import { Modal } from "./SharedUI";

export const StairEditor = ({ open, onClose, stair, allStairs, onSave, onDelete, lang }) => {
  const isNew = !stair?.id; const isAr = lang === "ar";
  const [form, setForm] = useState({ title: "", title_ar: "", description: "", element_type: "objective", health: "on_track", progress_percent: 0, parent_id: null, code: "" });
  const [saving, setSaving] = useState(false); const [confirmDel, setConfirmDel] = useState(false);
  const labels = isAr ? typeLabelsAr : typeLabels;
  useEffect(() => { if (stair) setForm({ title: stair.title||"", title_ar: stair.title_ar||"", description: stair.description||"", element_type: stair.element_type||"objective", health: stair.health||"on_track", progress_percent: stair.progress_percent||0, parent_id: stair.parent_id||null, code: stair.code||"" }); else setForm({ title: "", title_ar: "", description: "", element_type: "objective", health: "on_track", progress_percent: 0, parent_id: null, code: "" }); setConfirmDel(false); }, [stair, open]);
  const parentOpts = useMemo(() => { const flat = []; const walk = (nodes, d=0) => { nodes.forEach(n => { if (!stair||n.stair.id!==stair.id) flat.push({ id: n.stair.id, label: `${"  ".repeat(d)}${n.stair.code||""} ${n.stair.title}` }); if (n.children) walk(n.children, d+1); }); }; walk(allStairs||[]); return flat; }, [allStairs, stair]);
  const doSave = async () => { if (!form.title.trim()) return; setSaving(true); try { await onSave(form, stair?.id); onClose(); } catch(e) { alert(e.message); } setSaving(false); };
  const doDel = async () => { if (!confirmDel) { setConfirmDel(true); return; } setSaving(true); try { await onDelete(stair.id); onClose(); } catch(e) { alert(e.message); } setSaving(false); };
  return (
    <Modal open={open} onClose={onClose} title={isNew ? (isAr ? "إضافة عنصر" : "Add Element") : (isAr ? "تعديل العنصر" : "Edit Element")}>
      <div className="space-y-4">
        <div><label className={labelCls}>{isAr ? "النوع" : "Type"}</label><div className="flex gap-2 flex-wrap">{Object.keys(typeLabels).map(tp => <button key={tp} onClick={() => setForm(f => ({...f, element_type:tp}))} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${form.element_type===tp?"border-amber-500/40 bg-amber-500/15 text-amber-300":"border-[#1e3a5f] text-gray-500"}`}><span style={{color:typeColors[tp]}}>{typeIcons[tp]}</span> {labels[tp]}</button>)}</div></div>
        <div><label className={labelCls}>Code</label><input value={form.code} onChange={e => setForm(f => ({...f, code:e.target.value}))} placeholder="OBJ-001" className={inputCls} /></div>
        <div><label className={labelCls}>{isAr ? "العنوان" : "Title"}</label><input value={form.title} onChange={e => setForm(f => ({...f, title:e.target.value}))} className={inputCls} /></div>
        <div><label className={labelCls}>{isAr ? "العنوان بالعربي" : "Title (Arabic)"}</label><input value={form.title_ar} onChange={e => setForm(f => ({...f, title_ar:e.target.value}))} className={inputCls} dir="rtl" /></div>
        <div><label className={labelCls}>{isAr ? "الوصف" : "Description"}</label><textarea value={form.description} onChange={e => setForm(f => ({...f, description:e.target.value}))} rows={2} className={`${inputCls} resize-none`} /></div>
        <div><label className={labelCls}>{isAr ? "الأصل" : "Parent"}</label><select value={form.parent_id||""} onChange={e => setForm(f => ({...f, parent_id:e.target.value||null}))} className={inputCls}><option value="">{isAr ? "بدون" : "None (top level)"}</option>{parentOpts.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
        <div><label className={labelCls}>{isAr ? "الحالة" : "Health"}</label><div className="flex gap-2 flex-wrap">{["on_track","at_risk","off_track","achieved"].map(h => <button key={h} onClick={() => setForm(f => ({...f, health:h}))} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${form.health===h?(h==="on_track"?"bg-emerald-500/20 text-emerald-300 border-emerald-500/30":h==="at_risk"?"bg-amber-500/20 text-amber-300 border-amber-500/30":h==="off_track"?"bg-red-500/20 text-red-300 border-red-500/30":"bg-blue-500/20 text-blue-300 border-blue-500/30"):"border-[#1e3a5f] text-gray-500"}`}>{h.replace("_"," ").toUpperCase()}</button>)}</div></div>
        <div><label className={labelCls}>{isAr ? "التقدم" : "Progress"}: {form.progress_percent}%</label><input type="range" min={0} max={100} value={form.progress_percent} onChange={e => setForm(f => ({...f, progress_percent:+e.target.value}))} className="w-full accent-amber-500" /></div>
        <div className="flex items-center gap-3 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
          {!isNew && <button onClick={doDel} className={`px-4 py-2 rounded-lg text-sm transition ${confirmDel?"bg-red-500/30 text-red-200 border border-red-500/50":"text-red-400/60 hover:text-red-300"}`}>{confirmDel ? "Confirm?" : (isAr ? "حذف" : "Delete")}</button>}
          <div className="flex-1" /><button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">{isAr ? "إلغاء" : "Cancel"}</button>
          <button onClick={doSave} disabled={saving||!form.title.trim()} className="px-5 py-2 rounded-lg text-sm font-semibold text-[#0a1628] disabled:opacity-40 transition-all hover:scale-[1.02]" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` }}>{saving ? "..." : (isAr ? "حفظ" : "Save")}</button>
        </div>
      </div>
    </Modal>
  );
};
