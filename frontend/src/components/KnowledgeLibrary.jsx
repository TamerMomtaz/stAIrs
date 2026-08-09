import { useState, useEffect } from "react";
import { api } from "../api";
import { BAD, GOLD, HUE, INFO, INK_3, OK, WARN, glass, tint } from "../constants";
import { buildHeader, openExportWindow } from "../exportUtils";
import LoadFailed from "./LoadFailed";
import { ViewHeader } from "./ViewHeader";

export const KnowledgeLibrary = ({ lang, strategyContext }) => {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState({ stats: null, frameworks: [], books: [], failurePatterns: [], measurementTools: [] });
  const [loading, setLoading] = useState(true); const [failed, setFailed] = useState(false); const isAr = lang === "ar";
  // Each of these used to swallow its own failure into an empty array, so a
  // backend outage rendered as a library with nothing in it. Let them reject
  // and treat the whole load as one thing that either arrived or didn't.
  const load = async () => {
    setLoading(true); setFailed(false);
    try {
      const [stats, fw, bk, fp, mt] = await Promise.all([
        api.get("/api/v1/knowledge/stats").catch(() => null),
        api.get("/api/v1/knowledge/frameworks"),
        api.get("/api/v1/knowledge/books"),
        api.get("/api/v1/knowledge/failure-patterns"),
        api.get("/api/v1/knowledge/measurement-tools"),
      ]);
      setData({ stats, frameworks: fw || [], books: bk || [], failurePatterns: fp || [], measurementTools: mt || [] });
    } catch (e) {
      console.error("[stairs] load knowledge:", e);
      setFailed(true);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const tabs = [{key:"overview",icon:"📊",label:isAr?"نظرة عامة":"Overview"},{key:"frameworks",icon:"🧩",label:isAr?"الأطر":"Frameworks"},{key:"books",icon:"📚",label:isAr?"الكتب":"Books"},{key:"patterns",icon:"⚠️",label:isAr?"أنماط الفشل":"Failure Patterns"},{key:"tools",icon:"🔧",label:isAr?"أدوات القياس":"Measurement Tools"}];
  const header = <ViewHeader title={isAr ? "المعرفة" : "Knowledge"} subtitle={isAr ? "الأطر والكتب وأنماط الإخفاق وأدوات القياس" : "Frameworks, books, failure patterns and measurement tools"} />;
  if (loading) return <div>{header}<div className="flex items-center gap-2 py-16 justify-center"><div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin"/><span className="text-ink-muted text-xs">{isAr ? "جارٍ تحميل المكتبة..." : "Loading the library..."}</span></div></div>;
  if (failed) return <div>{header}<div className="py-8"><LoadFailed what={isAr ? "المكتبة" : "the knowledge library"} lang={lang} onRetry={load} /></div></div>;
  // On screen these read tokens; the export below builds a document that
  // never loads tokens.css, so it takes literals. Same four decisions, twice,
  // because the two documents genuinely have different palettes.
  const phaseColors = { analysis:INFO, formulation:HUE.violet, design:HUE.pink, execution:OK };
  const tierColors = { tier_1:WARN, tier_2:INFO, tier_3:INK_3 };
  const sevColors = { critical:BAD, high:WARN, medium:INFO, low:INK_3 };
  const printPhase = { analysis:"#2563eb", formulation:"#7c3aed", design:"#be185d", execution:"#059669" };
  const printTier = { tier_1:"#d97706", tier_2:"#2563eb", tier_3:"#64748b" };
  const printSev = { critical:"#dc2626", high:"#d97706", medium:"#2563eb", low:"#64748b" };
  const exportKnowledge = () => {
    let content = "";
    if (data.frameworks.length) {
      content += `<div class="section">🧩 ${isAr ? "الأطر" : "Frameworks"} (${data.frameworks.length})</div>`;
      content += data.frameworks.map(fw => `<div class="knowledge-card"><h4>${fw.name}${fw.phase ? ` <span class="badge" style="background:${printPhase[fw.phase] || "#94a3b8"}20;color:${printPhase[fw.phase] || "#94a3b8"}">${fw.phase?.toUpperCase()}</span>` : ""}</h4><div class="meta">${fw.originator || ""}${fw.year ? ` (${fw.year})` : ""}</div>${fw.description ? `<div class="desc">${fw.description}</div>` : ""}${fw.strengths ? `<div style="margin-top:6px"><span style="color:#059669;font-size:10px;font-weight:600">STRENGTHS:</span> <span style="font-size:11px;color:#475569">${fw.strengths}</span></div>` : ""}${fw.limitations ? `<div style="margin-top:4px"><span style="color:#dc2626;font-size:10px;font-weight:600">LIMITATIONS:</span> <span style="font-size:11px;color:#475569">${fw.limitations}</span></div>` : ""}</div>`).join("");
    }
    if (data.books.length) {
      content += `<div class="section">📚 ${isAr ? "الكتب" : "Books"} (${data.books.length})</div>`;
      content += data.books.map(bk => `<div class="knowledge-card"><h4>${bk.title}${bk.tier ? ` <span class="badge" style="background:${printTier[bk.tier] || "#94a3b8"}20;color:${printTier[bk.tier] || "#94a3b8"}">${bk.tier?.replace("_", " ").toUpperCase()}</span>` : ""}</h4><div class="meta">${bk.authors || ""}${bk.year ? ` (${bk.year})` : ""}</div>${bk.key_concepts ? `<div class="desc">${bk.key_concepts}</div>` : ""}${bk.relevance ? `<div style="margin-top:4px"><span style="color:#B8904A;font-size:10px;font-weight:600">RELEVANCE:</span> <span style="font-size:11px;color:#475569">${bk.relevance}</span></div>` : ""}</div>`).join("");
    }
    if (data.failurePatterns.length) {
      content += `<div class="section">⚠️ ${isAr ? "أنماط الفشل" : "Failure Patterns"} (${data.failurePatterns.length})</div>`;
      content += data.failurePatterns.map(fp => `<div class="knowledge-card"><h4>${fp.name || fp.pattern_name}${fp.severity ? ` <span class="badge" style="background:${printSev[fp.severity] || "#94a3b8"}20;color:${printSev[fp.severity] || "#94a3b8"}">${fp.severity?.toUpperCase()}</span>` : ""}</h4>${fp.description ? `<div class="desc">${fp.description}</div>` : ""}${fp.detection_signals ? `<div style="margin-top:6px"><span style="color:#06b6d4;font-size:10px;font-weight:600">DETECTION:</span> <span style="font-size:11px;color:#475569">${fp.detection_signals}</span></div>` : ""}${fp.prevention ? `<div style="margin-top:4px"><span style="color:#059669;font-size:10px;font-weight:600">PREVENTION:</span> <span style="font-size:11px;color:#475569">${fp.prevention}</span></div>` : ""}${fp.research_stat ? `<div style="margin-top:4px;font-size:10px;color:#B8904A;font-style:italic">${fp.research_stat}</div>` : ""}</div>`).join("");
    }
    if (data.measurementTools.length) {
      content += `<div class="section">🔧 ${isAr ? "أدوات القياس" : "Measurement Tools"} (${data.measurementTools.length})</div>`;
      content += data.measurementTools.map(mt => `<div class="knowledge-card"><h4>${mt.name || mt.tool_name}${mt.stage ? ` <span class="badge" style="background:#2dd4bf20;color:#2dd4bf">${mt.stage}</span>` : ""}</h4>${mt.description ? `<div class="desc">${mt.description}</div>` : ""}${mt.how_it_works ? `<div style="margin-top:6px"><span style="color:#3b82f6;font-size:10px;font-weight:600">HOW IT WORKS:</span> <span style="font-size:11px;color:#475569">${mt.how_it_works}</span></div>` : ""}${mt.interpretation ? `<div style="margin-top:4px"><span style="color:#B8904A;font-size:10px;font-weight:600">INTERPRETATION:</span> <span style="font-size:11px;color:#475569">${mt.interpretation}</span></div>` : ""}</div>`).join("");
    }
    const body = `${buildHeader(strategyContext, "Knowledge Library Export")}
      <div class="section">📖 ${isAr ? "مكتبة المعرفة" : "Knowledge Library"}</div>
      ${data.stats ? `<div style="display:flex;gap:12px;margin-bottom:24px"><div class="stat-box"><div class="num" style="color:#60a5fa">${data.stats.frameworks||0}</div><div class="lbl">Frameworks</div></div><div class="stat-box"><div class="num" style="color:#a78bfa">${data.stats.books||0}</div><div class="lbl">Books</div></div><div class="stat-box"><div class="num" style="color:#f87171">${data.stats.failure_patterns||0}</div><div class="lbl">Failure Patterns</div></div><div class="stat-box"><div class="num" style="color:#34d399">${data.stats.measurement_tools||0}</div><div class="lbl">Measurement Tools</div></div></div>` : ""}
      ${content}`;
    openExportWindow("Knowledge Library", body);
  };
  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap items-center">{tabs.map(t => <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${tab===t.key?"bg-amber-500/15 text-amber-300 border border-amber-500/20":"text-ink-muted hover:text-ink-2 border border-transparent"}`}>{t.icon} {t.label}</button>)}<div className="flex-1" /><button onClick={exportKnowledge} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:scale-[1.02]" style={{ borderColor: `${tint(GOLD, 38)}`, color: GOLD, background: `${tint(GOLD, 8)}` }}>↓ {isAr ? "تصدير" : "Export"}</button></div>

      {tab==="overview" && data.stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[{l:"Frameworks",v:data.stats.frameworks||0,c:INFO},{l:"Books",v:data.stats.books||0,c:HUE.violet},{l:"Failure Patterns",v:data.stats.failure_patterns||0,c:BAD},{l:"Measurement Tools",v:data.stats.measurement_tools||0,c:OK}].map((s,i) => <div key={i} className="p-4 rounded-xl text-center" style={{...glass(0.5),borderColor:`${tint(s.c, 13)}`}}><div className="text-2xl font-bold" style={{color:s.c}}>{s.v}</div><div className="text-ink-3 text-xs mt-1">{s.l}</div></div>)}
          </div>
          {data.stats.key_facts && <div><h3 className="text-ink-3 text-xs uppercase tracking-wider mb-3">Key Research Facts</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-3">{data.stats.key_facts.map((f,i) => <div key={i} className="p-4 rounded-xl" style={glass(0.4)}><div className="text-xl font-bold text-amber-300">{f.value}</div><div className="text-ink text-sm mt-1">{f.label}</div><div className="text-ink-faint text-[10px] mt-1">{f.source}</div></div>)}</div></div>}
        </div>
      )}

      {tab==="frameworks" && (
        <div className="space-y-3">
          {data.frameworks.length===0 && <div className="text-ink-muted text-center py-8">No frameworks loaded. Run migration first.</div>}
          {data.frameworks.map((fw,i) => (
            <div key={i} className="p-4 rounded-xl" style={glass(0.4)}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-ink font-semibold text-sm">{fw.name}</span>
                {fw.phase && <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium" style={{color:phaseColors[fw.phase]||INK_3,borderColor:`${tint(phaseColors[fw.phase]||INK_3, 25)}`,background:`${tint(phaseColors[fw.phase]||INK_3, 8)}`}}>{fw.phase?.toUpperCase()}</span>}
              </div>
              {fw.originator && <div className="text-gray-500 text-xs mb-1">{fw.originator}{fw.year?` (${fw.year})`:""}</div>}
              {fw.description && <div className="text-ink-3 text-xs leading-relaxed">{fw.description}</div>}
              {(fw.strengths||fw.limitations) && <div className="flex gap-4 mt-2">{fw.strengths && <div className="flex-1"><div className="text-emerald-400 text-[10px] uppercase mb-0.5">Strengths</div><div className="text-ink-3 text-xs">{fw.strengths}</div></div>}{fw.limitations && <div className="flex-1"><div className="text-red-400 text-[10px] uppercase mb-0.5">Limitations</div><div className="text-ink-3 text-xs">{fw.limitations}</div></div>}</div>}
            </div>
          ))}
        </div>
      )}

      {tab==="books" && (
        <div className="space-y-3">
          {data.books.length===0 && <div className="text-ink-muted text-center py-8">No books loaded.</div>}
          {data.books.map((bk,i) => (
            <div key={i} className="p-4 rounded-xl" style={glass(0.4)}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-ink font-semibold text-sm">{bk.title}</span>
                {bk.tier && <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium" style={{color:tierColors[bk.tier]||INK_3,borderColor:tint(tierColors[bk.tier]||INK_3, 25),background:tint(tierColors[bk.tier]||INK_3, 8)}}>{bk.tier?.replace("_", " ").toUpperCase()}</span>}
              </div>
              {bk.authors && <div className="text-gray-500 text-xs mb-1">{bk.authors}{bk.year?` (${bk.year})`:""}</div>}
              {bk.key_concepts && <div className="text-ink-3 text-xs leading-relaxed">{bk.key_concepts}</div>}
              {bk.relevance && <div className="mt-1"><span className="text-amber-400 text-[10px] uppercase">Relevance: </span><span className="text-ink-3 text-xs">{bk.relevance}</span></div>}
            </div>
          ))}
        </div>
      )}

      {tab==="patterns" && (
        <div className="space-y-3">
          {data.failurePatterns.length===0 && <div className="text-ink-muted text-center py-8">No failure patterns loaded.</div>}
          {data.failurePatterns.map((fp,i) => (
            <div key={i} className="p-4 rounded-xl" style={glass(0.4)}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-ink font-semibold text-sm">{fp.name || fp.pattern_name}</span>
                {fp.severity && <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium" style={{color:sevColors[fp.severity]||INK_3,borderColor:`${tint(sevColors[fp.severity]||INK_3, 25)}`,background:`${tint(sevColors[fp.severity]||INK_3, 8)}`}}>{fp.severity?.toUpperCase()}</span>}
              </div>
              {fp.description && <div className="text-ink-3 text-xs leading-relaxed mb-2">{fp.description}</div>}
              {fp.detection_signals && <div className="mb-1"><span className="text-cyan-400 text-[10px] uppercase">Detection: </span><span className="text-ink-3 text-xs">{fp.detection_signals}</span></div>}
              {fp.prevention && <div><span className="text-emerald-400 text-[10px] uppercase">Prevention: </span><span className="text-ink-3 text-xs">{fp.prevention}</span></div>}
              {fp.research_stat && <div className="mt-1 text-amber-300/60 text-[10px] italic">{fp.research_stat}</div>}
            </div>
          ))}
        </div>
      )}

      {tab==="tools" && (
        <div className="space-y-3">
          {data.measurementTools.length===0 && <div className="text-ink-muted text-center py-8">No measurement tools loaded.</div>}
          {data.measurementTools.map((mt,i) => (
            <div key={i} className="p-4 rounded-xl" style={glass(0.4)}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-ink font-semibold text-sm">{mt.name || mt.tool_name}</span>
                {mt.stage && <span className="text-[10px] px-2 py-0.5 rounded-full border border-teal-500/30 text-teal-300 bg-teal-500/10">{mt.stage}</span>}
              </div>
              {mt.description && <div className="text-ink-3 text-xs leading-relaxed mb-2">{mt.description}</div>}
              {mt.how_it_works && <div className="mb-1"><span className="text-blue-400 text-[10px] uppercase">How it works: </span><span className="text-ink-3 text-xs">{mt.how_it_works}</span></div>}
              {mt.interpretation && <div><span className="text-amber-400 text-[10px] uppercase">Interpretation: </span><span className="text-ink-3 text-xs">{mt.interpretation}</span></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
