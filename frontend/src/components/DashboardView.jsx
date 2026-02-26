import { glass, GOLD, GOLD_L } from "../constants";
import { HealthBadge, ProgressRing } from "./SharedUI";
import { MATRIX_FRAMEWORKS } from "./StrategyMatrixToolkit";
import { buildHeader, openExportWindow } from "../exportUtils";

export const DashboardView = ({ data, lang, matrixResults, onMatrixClick, strategyContext }) => {
  const s = data?.stats || {}; const isAr = lang === "ar";
  const stats = [{ label: isAr?"إجمالي":"Total Elements", value: s.total_elements||0, color: "#60a5fa" },{ label: isAr?"على المسار":"On Track", value: s.on_track||0, color: "#34d399" },{ label: isAr?"في خطر":"At Risk", value: s.at_risk||0, color: "#fbbf24" },{ label: isAr?"خارج المسار":"Off Track", value: s.off_track||0, color: "#f87171" }];
  const exportDashboard = () => {
    const statBoxes = stats.map(st => `<div class="stat-box"><div class="num" style="color:${st.color}">${st.value}</div><div class="lbl">${st.label}</div></div>`).join("");
    const riskRows = (data?.top_risks || []).map(r => `<tr style="border-bottom:1px solid #e5e7eb"><td style="padding:8px;font-size:11px;font-family:monospace;color:#94a3b8">${r.code}</td><td style="padding:8px;font-size:13px;color:#1e293b;font-weight:500">${isAr && r.title_ar ? r.title_ar : r.title}</td><td style="padding:8px;text-align:center;font-size:12px">${r.health === "on_track" ? "✅" : r.health === "at_risk" ? "⚠️" : r.health === "off_track" ? "🔴" : "—"} ${r.health?.replace("_", " ") || "—"}</td><td style="padding:8px;text-align:center;font-size:12px;font-weight:600">${r.progress_percent}%</td></tr>`).join("");
    const matrixCards = Object.values(MATRIX_FRAMEWORKS).map(fw => { const r = matrixResults?.[fw.key]; return r ? `<div style="padding:10px;border:1px solid #e5e7eb;border-radius:8px;display:inline-block;margin:4px"><span style="font-size:14px">${fw.icon}</span> <strong style="font-size:12px">${fw.name}:</strong> <span style="font-size:12px;color:#B8904A">${r.summary}</span></div>` : ""; }).filter(Boolean).join("");
    const body = `${buildHeader(strategyContext, "Dashboard Export")}
      <div class="section">📊 ${isAr ? "لوحة القيادة" : "Executive Dashboard"}</div>
      <div style="text-align:center;margin:20px 0"><div style="font-size:48px;font-weight:700;color:${(s.overall_progress||0)>=70?"#059669":(s.overall_progress||0)>=40?"#d97706":"#dc2626"}">${Math.round(s.overall_progress||0)}%</div><div style="font-size:12px;color:#64748b">${isAr ? "التقدم الإجمالي" : "Overall Progress"}</div></div>
      <div style="display:flex;gap:12px;margin-bottom:24px">${statBoxes}</div>
      ${riskRows ? `<div class="section">${isAr ? "أعلى المخاطر" : "Top Risks"}</div><table><thead><tr><th style="width:60px">Code</th><th>Title</th><th style="text-align:center">Health</th><th style="text-align:center;width:80px">Progress</th></tr></thead><tbody>${riskRows}</tbody></table>` : ""}
      ${matrixCards ? `<div class="section">🔧 ${isAr ? "أدوات الاستراتيجية" : "Strategy Tools Results"}</div>${matrixCards}` : ""}`;
    openExportWindow("Dashboard", body);
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6 p-6 rounded-2xl" style={glass()}>
        <ProgressRing percent={s.overall_progress||0} size={120} stroke={8} />
        <div className="flex-1"><div className="text-gray-400 text-sm">{isAr?"التقدم الإجمالي":"Overall Progress"}</div><div className="text-3xl font-bold text-white">{Math.round(s.overall_progress||0)}%</div></div>
        <button onClick={exportDashboard} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:scale-[1.02]" style={{ borderColor: `${GOLD}60`, color: GOLD, background: `${GOLD}15` }}>↓ {isAr ? "تصدير" : "Export"}</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{stats.map((st,i) => <div key={i} className="p-4 rounded-xl text-center" style={{...glass(0.5), borderColor:`${st.color}22`}}><div className="text-3xl font-bold" style={{color:st.color}}>{st.value}</div><div className="text-gray-400 text-xs mt-1">{st.label}</div></div>)}</div>
      {data?.top_risks?.length > 0 && <div><h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">{isAr?"أعلى المخاطر":"Top Risks"}</h3><div className="space-y-2">{data.top_risks.map((r,i) => <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={glass(0.4)}><div className="text-xs font-mono text-amber-400/80 w-16 shrink-0">{r.code}</div><div className="flex-1 text-white text-sm truncate">{isAr&&r.title_ar?r.title_ar:r.title}</div><HealthBadge health={r.health}/><div className="text-white text-sm w-12 text-right">{r.progress_percent}%</div></div>)}</div></div>}
      {onMatrixClick && <div>
        <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">{isAr ? "أدوات الاستراتيجية" : "Strategy Tools"}</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Object.values(MATRIX_FRAMEWORKS).map(fw => {
            const result = matrixResults?.[fw.key];
            return (
              <div key={fw.key} className="p-3 rounded-xl text-center cursor-pointer hover:scale-[1.02] transition-all" style={glass(0.4)} onClick={() => onMatrixClick(fw.key)}>
                <div className="text-lg mb-1">{fw.icon}</div>
                <div className="text-white text-[11px] font-medium mb-1">{fw.name}</div>
                {result
                  ? <div className="text-amber-300 text-[10px] leading-snug">{result.summary}</div>
                  : <div><div className="text-gray-600 text-[10px]">{isAr ? "لم يتم التحليل" : "Not yet analyzed"}</div><div className="text-[10px] mt-1" style={{ color: `${GOLD}99` }}>{isAr ? "ابدأ ←" : "Start →"}</div></div>}
              </div>
            );
          })}
        </div>
      </div>}
    </div>
  );
};
