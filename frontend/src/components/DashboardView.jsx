import { useState, useEffect } from "react";
import { API, BAD, GOLD, GOLD_INK, INFO, INK_3, OK, WARN, glass, tint } from "../constants";
import { HealthBadge, ProgressRing } from "./SharedUI";
import { MATRIX_FRAMEWORKS } from "./StrategyMatrixToolkit";
import { buildHeader, openExportWindow } from "../exportUtils";
import { AdminAPI, DataQaAPI, canSeeAgentTelemetry } from "../api";
import LoadFailed from "./LoadFailed";
import { ViewHeader } from "./ViewHeader";

const AGENT_ICONS = {
  strategy_advisor: "\uD83D\uDCCA",
  strategy_analyst: "\uD83D\uDCC8",
  document_analyst: "\uD83D\uDCC4",
  execution_planner: "\uD83D\uDE80",
  validation: "\u26A0\uFE0F",
};

const AgentActivityLog = ({ isAr }) => {
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    AdminAPI.getAgentStats()
      .then(data => { setActivity(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  if (loading) return <div className="text-xs text-ink-muted py-4 text-center">{isAr ? "\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0645\u064A\u0644..." : "Loading agent activity..."}</div>;
  if (!activity || !activity.recent_activity || activity.recent_activity.length === 0) return null;
  const confColor = (s) => !s ? "text-ink-muted" : s >= 85 ? "text-emerald-400" : s >= 60 ? "text-amber-400" : "text-red-400";
  // Failure rate is the number that shows an outage before a client reports one,
  // so it gets its own row rather than living only in the API payload.
  const agents = Object.entries(activity.agents || {}).filter(([, a]) => a.total_calls > 0);
  const degraded = agents.filter(([, a]) => a.failure_rate > 0);
  const rateColor = (r) => r >= 10 ? "text-red-400" : r > 0 ? "text-amber-400" : "text-emerald-400";
  return (
    <div data-testid="agent-activity-log">
      <h3 className="text-ink-3 text-xs uppercase tracking-wider mb-3">{isAr ? "\u0633\u062C\u0644 \u0646\u0634\u0627\u0637 \u0627\u0644\u0648\u0643\u0644\u0627\u0621" : "Agent Activity"}</h3>
      {agents.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3" data-testid="agent-health">
          <span className={`text-[11px] px-2 py-1 rounded-md border ${activity.failure_rate > 0 ? "border-amber-500/25 bg-amber-500/5" : "border-emerald-500/20 bg-emerald-500/5"}`}>
            <span className="text-ink-muted">{isAr ? "معدل الإخفاق" : "Failure rate"}</span>{" "}
            <span className={`font-medium ${rateColor(activity.failure_rate || 0)}`}>{activity.failure_rate ?? 0}%</span>
            <span className="text-ink-faint"> · {activity.failed_calls ?? 0}/{activity.total_calls ?? 0}</span>
          </span>
          {degraded.map(([name, a]) => (
            <span key={name} className="text-[11px] px-2 py-1 rounded-md border border-amber-500/25 bg-amber-500/5" title={`${a.failed_calls} of ${a.total_calls} calls returned no answer`}>
              <span className="text-ink-3">{AGENT_ICONS[name] || "\uD83E\uDD16"} {name}</span>{" "}
              <span className={`font-medium ${rateColor(a.failure_rate)}`}>{a.failure_rate}%</span>
            </span>
          ))}
        </div>
      )}
      <div className="rounded-xl overflow-hidden" style={glass(0.4)}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-ink-muted border-b border-hairline">
                <th className="text-left px-3 py-2 font-medium">{isAr ? "\u0627\u0644\u0648\u0642\u062A" : "Time"}</th>
                <th className="text-left px-3 py-2 font-medium">{isAr ? "\u0627\u0644\u0648\u0643\u064A\u0644" : "Agent"}</th>
                <th className="text-left px-3 py-2 font-medium">{isAr ? "\u0627\u0644\u0645\u0647\u0645\u0629" : "Task"}</th>
                <th className="text-center px-3 py-2 font-medium">{isAr ? "\u0627\u0644\u062B\u0642\u0629" : "Confidence"}</th>
                <th className="text-left px-3 py-2 font-medium">{isAr ? "\u0627\u0644\u0646\u0645\u0648\u0630\u062C" : "Model"}</th>
              </tr>
            </thead>
            <tbody>
              {activity.recent_activity.slice(0, 20).map((entry, i) => (
                <tr key={i} className={`border-b border-hairline hover:bg-lift/[0.02] transition ${entry.ok === false ? "bg-amber-500/[0.04]" : ""}`}>
                  <td className="px-3 py-1.5 text-ink-muted whitespace-nowrap">{entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "\u2014"}</td>
                  <td className="px-3 py-1.5 text-ink whitespace-nowrap">{AGENT_ICONS[entry.agent_name] || "\uD83E\uDD16"} {entry.agent_name}</td>
                  <td className="px-3 py-1.5 text-ink-3 truncate max-w-[160px]">{entry.task_type}</td>
                  <td className={`px-3 py-1.5 text-center font-medium ${confColor(entry.confidence_score)}`}>{entry.confidence_score != null ? `${entry.confidence_score}%` : "\u2014"}</td>
                  <td className="px-3 py-1.5 text-ink-muted">{entry.ok === false ? <span className="text-amber-400/80">{isAr ? "غير متاح" : "unavailable"}</span> : (entry.model_used || "\u2014")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const DataHealthSummary = ({ strategyContext, isAr }) => {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    if (!strategyContext?.id) return;
    DataQaAPI.getDataHealth(strategyContext.id).then(d => setHealth(d)).catch(() => {});
  }, [strategyContext?.id]);
  if (!health) return null;
  const healthColor = health.health_score >= 80 ? OK : health.health_score >= 60 ? WARN : BAD;
  const items = [
    { label: isAr ? "إجمالي المصادر" : "Total", value: health.total_sources, color: INFO },
    { label: isAr ? "موثقة" : "Verified", value: health.verified_sources, color: OK },
    { label: isAr ? "متنازع" : "Disputed", value: health.disputed_sources, color: BAD },
    { label: isAr ? "محجورة" : "Quarantined", value: health.quarantined_sources, color: INK_3 },
  ];
  return (
    <div data-testid="data-health-summary">
      <h3 className="text-ink-3 text-xs uppercase tracking-wider mb-3">{isAr ? "صحة البيانات" : "Data Health"}</h3>
      <div className="rounded-xl p-4" style={glass(0.4)}>
        {health.health_score < 70 && (
          <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg" style={{ background: tint(WARN, 8), border: `1px solid ${tint(WARN, 25)}` }}>
            <span className="text-sm">⚠️</span>
            <span className="text-[11px] text-amber-400">{isAr ? "بيانات استراتيجيتك بها تعارضات غير محلولة قد تؤثر على دقة AI." : "Your strategy data has unresolved conflicts that may affect AI accuracy."}</span>
          </div>
        )}
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: healthColor }}>{health.health_score}%</div>
            <div className="text-[10px] text-ink-muted mt-0.5">{isAr ? "صحة البيانات" : "Data Health"}</div>
          </div>
          <div className="flex-1 h-2 rounded-full bg-sunken overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${health.health_score}%`, background: healthColor }} />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-3">
          {items.map((it, i) => (
            <div key={i} className="text-center p-2 rounded-lg" style={glass(0.3)}>
              <div className="text-lg font-bold" style={{ color: it.color }}>{it.value}</div>
              <div className="text-[9px] text-ink-muted uppercase tracking-wider">{it.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const DashboardView = ({ data, lang, matrixResults, onMatrixClick, strategyContext, failed, retrying, onRetry }) => {
  const s = data?.stats || {}; const isAr = lang === "ar";
  const stats = [{ label: isAr?"إجمالي":"Total Elements", value: s.total_elements||0, color: INFO },{ label: isAr?"على المسار":"On Track", value: s.on_track||0, color: OK },{ label: isAr?"في خطر":"At Risk", value: s.at_risk||0, color: WARN },{ label: isAr?"خارج المسار":"Off Track", value: s.off_track||0, color: BAD }];
  const exportDashboard = () => {
    // The export document has no tokens.css, so the on-screen colours cannot
    // travel with it — the same four states, in the print palette.
    const printStat = ["#2563eb", "#059669", "#d97706", "#dc2626"];
    const statBoxes = stats.map((st, i) => `<div class="stat-box"><div class="num" style="color:${printStat[i]}">${st.value}</div><div class="lbl">${st.label}</div></div>`).join("");
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
  // A dashboard that reports 0% across 0 elements looks deliberate, so a
  // client reads it as "my strategy is gone" rather than "the request failed".
  // With no data to show, say what actually happened instead.
  if (failed && !data) return (
    <div>
      <ViewHeader title={isAr ? "لوحة القيادة" : "Dashboard"} />
      <div className="py-8"><LoadFailed what={isAr ? "لوحة القيادة" : "your dashboard"} lang={lang} onRetry={onRetry} retrying={retrying} /></div>
    </div>
  );
  return (
    <div className="space-y-6">
      <ViewHeader title={isAr ? "لوحة القيادة" : "Dashboard"} />
      {failed && <LoadFailed compact what={isAr ? "أحدث الأرقام" : "the latest numbers"} lang={lang} onRetry={onRetry} retrying={retrying} />}
      <div className="flex items-center gap-6 p-6 rounded-2xl" style={glass()}>
        <ProgressRing percent={s.overall_progress||0} size={120} stroke={8} />
        <div className="flex-1"><div className="text-ink-3 text-sm">{isAr?"التقدم الإجمالي":"Overall Progress"}</div><div className="text-3xl font-bold text-ink">{Math.round(s.overall_progress||0)}%</div></div>
        <button onClick={exportDashboard} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:scale-[1.02]" style={{ borderColor: `${tint(GOLD, 38)}`, color: GOLD_INK, background: "transparent" }}>↓ {isAr ? "تصدير" : "Export"}</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{stats.map((st,i) => <div key={i} className="p-4 rounded-xl text-center" style={{...glass(0.5), borderColor:`${tint(st.color, 13)}`}}><div className="text-3xl font-bold" style={{color:st.color}}>{st.value}</div><div className="text-gray-400 text-xs mt-1">{st.label}</div></div>)}</div>
      {data?.top_risks?.length > 0 && <div><h3 className="text-ink-3 text-xs uppercase tracking-wider mb-3">{isAr?"أعلى المخاطر":"Top Risks"}</h3><div className="space-y-2">{data.top_risks.map((r,i) => <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={glass(0.4)}><div className="text-xs font-mono text-amber-400/80 w-16 shrink-0">{r.code}</div><div className="flex-1 text-ink text-sm truncate">{isAr&&r.title_ar?r.title_ar:r.title}</div><HealthBadge health={r.health}/><div className="text-ink text-sm w-12 text-right">{r.progress_percent}%</div></div>)}</div></div>}
      {onMatrixClick && <div>
        <h3 className="text-ink-3 text-xs uppercase tracking-wider mb-3">{isAr ? "أدوات الاستراتيجية" : "Strategy Tools"}</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Object.values(MATRIX_FRAMEWORKS).map(fw => {
            const result = matrixResults?.[fw.key];
            return (
              <div key={fw.key} className="p-3 rounded-xl text-center cursor-pointer hover:scale-[1.02] transition-all" style={glass(0.4)} onClick={() => onMatrixClick(fw.key)}>
                <div className="text-lg mb-1">{fw.icon}</div>
                <div className="text-ink text-[11px] font-medium mb-1">{fw.name}</div>
                {result
                  ? <div className="text-amber-300 text-[10px] leading-snug">{result.summary}</div>
                  : <div><div className="text-ink-faint text-[10px]">{isAr ? "لم يتم التحليل" : "Not yet analyzed"}</div><div className="text-[10px] mt-1" style={{ color: `${tint(GOLD, 60)}` }}>{isAr ? "ابدأ ←" : "Start →"}</div></div>}
              </div>
            );
          })}
        </div>
      </div>}
      <DataHealthSummary strategyContext={strategyContext} isAr={isAr} />
      {canSeeAgentTelemetry() && <AgentActivityLog isAr={isAr} />}
    </div>
  );
};
