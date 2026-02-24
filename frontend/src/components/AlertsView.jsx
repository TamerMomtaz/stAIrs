export const AlertsView = ({ alerts, lang }) => {
  const isAr = lang === "ar";
  const sc = { critical: { bg:"rgba(248,113,113,0.1)", border:"#f8717130", icon:"🔴", text:"text-red-300" }, high: { bg:"rgba(251,191,36,0.1)", border:"#fbbf2430", icon:"🟡", text:"text-amber-300" }, medium: { bg:"rgba(96,165,250,0.1)", border:"#60a5fa30", icon:"🔵", text:"text-blue-300" }, info: { bg:"rgba(96,165,250,0.08)", border:"#60a5fa20", icon:"ℹ️", text:"text-blue-300" } };
  if (!alerts?.length) return <div className="text-gray-500 text-center py-12">{isAr?"لا توجد تنبيهات":"No active alerts"}</div>;
  return <div className="space-y-3">{alerts.map((a,i) => { const s = sc[a.severity]||sc.info; return <div key={i} className="p-4 rounded-xl" style={{background:s.bg,border:`1px solid ${s.border}`}}><div className="flex items-start gap-3"><span className="text-lg">{s.icon}</span><div className="flex-1"><div className={`font-medium text-sm ${s.text}`}>{isAr&&a.title_ar?a.title_ar:a.title}</div><div className="text-gray-400 text-xs mt-1">{isAr&&a.description_ar?a.description_ar:a.description}</div></div></div></div>; })}</div>;
};
