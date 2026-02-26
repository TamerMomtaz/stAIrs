import { GOLD, BORDER } from "../constants";
import { buildHeader, openExportWindow } from "../exportUtils";

export const AlertsView = ({ alerts, lang, strategyContext }) => {
  const isAr = lang === "ar";
  const sc = { critical: { bg:"rgba(248,113,113,0.1)", border:"#f8717130", icon:"🔴", text:"text-red-300", printBg:"#fef2f2", printBorder:"#fecaca", printColor:"#991b1b" }, high: { bg:"rgba(251,191,36,0.1)", border:"#fbbf2430", icon:"🟡", text:"text-amber-300", printBg:"#fffbeb", printBorder:"#fde68a", printColor:"#92400e" }, medium: { bg:"rgba(96,165,250,0.1)", border:"#60a5fa30", icon:"🔵", text:"text-blue-300", printBg:"#eff6ff", printBorder:"#bfdbfe", printColor:"#1e40af" }, info: { bg:"rgba(96,165,250,0.08)", border:"#60a5fa20", icon:"ℹ️", text:"text-blue-300", printBg:"#f0f9ff", printBorder:"#bae6fd", printColor:"#0369a1" } };
  const exportAlerts = () => {
    if (!alerts?.length) return;
    const alertHtml = alerts.map(a => {
      const s = sc[a.severity] || sc.info;
      return `<div class="alert-card" style="background:${s.printBg};border-color:${s.printBorder}"><div style="display:flex;align-items:flex-start;gap:10px"><span style="font-size:16px">${s.icon}</span><div><div style="font-weight:600;font-size:13px;color:${s.printColor}">${isAr && a.title_ar ? a.title_ar : a.title}</div><div style="font-size:12px;color:#475569;margin-top:4px">${isAr && a.description_ar ? a.description_ar : a.description}</div><div style="font-size:10px;color:#94a3b8;margin-top:6px;text-transform:uppercase">${a.severity}</div></div></div></div>`;
    }).join("");
    const counts = { critical: 0, high: 0, medium: 0, info: 0 };
    alerts.forEach(a => { counts[a.severity] = (counts[a.severity] || 0) + 1; });
    const body = `${buildHeader(strategyContext, "Alerts Export")}
      <div class="section">🔔 ${isAr ? "التنبيهات" : "Active Alerts"} (${alerts.length})</div>
      <div style="display:flex;gap:12px;margin-bottom:20px">${counts.critical ? `<div class="stat-box"><div class="num" style="color:#dc2626">${counts.critical}</div><div class="lbl">Critical</div></div>` : ""}${counts.high ? `<div class="stat-box"><div class="num" style="color:#d97706">${counts.high}</div><div class="lbl">High</div></div>` : ""}${counts.medium ? `<div class="stat-box"><div class="num" style="color:#2563eb">${counts.medium}</div><div class="lbl">Medium</div></div>` : ""}${counts.info ? `<div class="stat-box"><div class="num" style="color:#0284c7">${counts.info}</div><div class="lbl">Info</div></div>` : ""}</div>
      ${alertHtml}`;
    openExportWindow("Alerts", body);
  };
  if (!alerts?.length) return <div className="text-gray-500 text-center py-12">{isAr?"لا توجد تنبيهات":"No active alerts"}</div>;
  return <div className="space-y-3">
    <div className="flex justify-end mb-2"><button onClick={exportAlerts} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:scale-[1.02]" style={{ borderColor: `${GOLD}60`, color: GOLD, background: `${GOLD}15` }}>↓ {isAr ? "تصدير" : "Export"}</button></div>
    {alerts.map((a,i) => { const s = sc[a.severity]||sc.info; return <div key={i} className="p-4 rounded-xl" style={{background:s.bg,border:`1px solid ${s.border}`}}><div className="flex items-start gap-3"><span className="text-lg">{s.icon}</span><div className="flex-1"><div className={`font-medium text-sm ${s.text}`}>{isAr&&a.title_ar?a.title_ar:a.title}</div><div className="text-gray-400 text-xs mt-1">{isAr&&a.description_ar?a.description_ar:a.description}</div></div></div></div>; })}
  </div>;
};
