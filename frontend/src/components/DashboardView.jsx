import { glass } from "../constants";
import { HealthBadge, ProgressRing } from "./SharedUI";

export const DashboardView = ({ data, lang }) => {
  const s = data?.stats || {}; const isAr = lang === "ar";
  const stats = [{ label: isAr?"إجمالي":"Total Elements", value: s.total_elements||0, color: "#60a5fa" },{ label: isAr?"على المسار":"On Track", value: s.on_track||0, color: "#34d399" },{ label: isAr?"في خطر":"At Risk", value: s.at_risk||0, color: "#fbbf24" },{ label: isAr?"خارج المسار":"Off Track", value: s.off_track||0, color: "#f87171" }];
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6 p-6 rounded-2xl" style={glass()}><ProgressRing percent={s.overall_progress||0} size={120} stroke={8} /><div><div className="text-gray-400 text-sm">{isAr?"التقدم الإجمالي":"Overall Progress"}</div><div className="text-3xl font-bold text-white">{Math.round(s.overall_progress||0)}%</div></div></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{stats.map((st,i) => <div key={i} className="p-4 rounded-xl text-center" style={{...glass(0.5), borderColor:`${st.color}22`}}><div className="text-3xl font-bold" style={{color:st.color}}>{st.value}</div><div className="text-gray-400 text-xs mt-1">{st.label}</div></div>)}</div>
      {data?.top_risks?.length > 0 && <div><h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">{isAr?"أعلى المخاطر":"Top Risks"}</h3><div className="space-y-2">{data.top_risks.map((r,i) => <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={glass(0.4)}><div className="text-xs font-mono text-amber-400/80 w-16 shrink-0">{r.code}</div><div className="flex-1 text-white text-sm truncate">{isAr&&r.title_ar?r.title_ar:r.title}</div><HealthBadge health={r.health}/><div className="text-white text-sm w-12 text-right">{r.progress_percent}%</div></div>)}</div></div>}
    </div>
  );
};
