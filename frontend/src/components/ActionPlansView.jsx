import { useState, useEffect } from "react";
import { ActionPlansAPI } from "../api";
import { GOLD, GOLD_L, DEEP, BORDER, glass, typeColors, typeIcons } from "../constants";
import { Markdown } from "./Markdown";

// ═══ PDF EXPORT HELPERS ═══
const pdfStyles = `@page{margin:20mm 15mm}*{box-sizing:border-box;margin:0;padding:0}body{background:#fff;color:#1e293b;font-family:'Segoe UI',system-ui,sans-serif;line-height:1.5}table{width:100%;border-collapse:collapse}thead th{text-align:left;padding:10px 8px;border-bottom:2px solid #B8904A;color:#B8904A;font-size:11px;text-transform:uppercase;font-weight:600}.section{margin-top:24px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;color:#B8904A;font-size:16px;font-weight:700}.footer{text-align:center;margin-top:30px;padding-top:16px;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:10px}.header{padding-bottom:16px;border-bottom:2px solid #B8904A;margin-bottom:20px}`;

const priorityColor = p => ({ High: "#dc2626", Medium: "#d97706", Low: "#059669" }[p] || "#64748b");
const typeColor = t => ({ vision: "#7c3aed", objective: "#2563eb", key_result: "#059669", initiative: "#d97706", task: "#64748b" }[t] || "#64748b");

const buildTaskRows = (taskList) => taskList.map(t => `
  <tr style="border-bottom:1px solid #e5e7eb">
    <td style="padding:10px 8px;text-align:center;vertical-align:middle;font-size:16px">${t.done ? "&#9745;" : "&#9744;"}</td>
    <td style="padding:10px 8px;vertical-align:top">
      <div style="font-weight:600;color:#1e293b;font-size:13px">${t.name || "Untitled"}</div>
      ${t.details ? `<div style="color:#64748b;font-size:11px;margin-top:2px">${t.details}</div>` : ""}
    </td>
    <td style="padding:10px 8px;text-align:center;vertical-align:middle;font-size:12px;color:#475569">${t.owner || "—"}</td>
    <td style="padding:10px 8px;text-align:center;vertical-align:middle;font-size:12px;color:#475569">${t.timeline || "—"}</td>
    <td style="padding:10px 8px;text-align:center;vertical-align:middle">
      <span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;color:white;background:${priorityColor(t.priority)}">${t.priority || "Medium"}</span>
    </td>
  </tr>`).join("");

const buildTaskTable = (taskList) => `<table><thead><tr><th style="width:40px;text-align:center">Done</th><th>Task</th><th style="text-align:center">Owner</th><th style="text-align:center">Timeline</th><th style="text-align:center">Priority</th></tr></thead><tbody>${buildTaskRows(taskList)}</tbody></table>`;

const buildProgress = (taskList) => {
  const done = taskList.filter(t => t.done).length;
  const total = taskList.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<div style="margin-top:12px;display:flex;align-items:center;gap:10px"><div style="flex:1;height:8px;border-radius:4px;background:#e5e7eb;overflow:hidden"><div style="height:100%;border-radius:4px;background:#B8904A;width:${pct}%"></div></div><span style="font-size:12px;color:#64748b">${done}/${total} completed (${pct}%)</span></div>`;
};

const buildStairHeader = (group, plan, isAr) => {
  const tColor = typeColor(group.element_type);
  const planLabel = plan.plan_type === "customized"
    ? (isAr ? "خطة مخصصة" : "Customized Plan")
    : (isAr ? "خطة موصى بها" : "Recommended Plan");
  const planIcon = plan.plan_type === "customized" ? "&#10024;" : "&#128203;";
  const created = plan.created_at ? new Date(plan.created_at).toLocaleDateString() : "";
  return `
    <div style="margin-top:12px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="color:${tColor};font-size:14px">${typeIcons[group.element_type] || "•"}</span>
        <span style="font-size:10px;color:${tColor};font-weight:600;text-transform:uppercase">${group.element_type?.replace("_", " ") || ""}</span>
      </div>
      <div style="font-size:16px;font-weight:700;color:#1e293b">${group.stair_code ? `<span style="color:#94a3b8;font-family:monospace;font-size:12px">${group.stair_code}</span> ` : ""}${isAr && group.stair_title_ar ? group.stair_title_ar : group.stair_title}</div>
      <div style="margin-top:8px;font-size:12px;color:#64748b">${planIcon} ${planLabel} &middot; ${created}</div>
    </div>`;
};

const openPrintWindow = (title, bodyContent) => {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>${pdfStyles}</style></head><body>${bodyContent}<div class="footer">ST.AIRS v3.6.0 &middot; Action Plans Export &middot; By DEVONEERS &middot; "Human IS the Loop"</div></body></html>`);
  w.document.close();
  w.print();
};

const exportSinglePlan = (group, plan, strategyContext, isAr) => {
  const planTasks = plan.tasks || [];
  const isCustom = plan.plan_type === "customized";
  const planLabel = isCustom ? (isAr ? "خطة مخصصة" : "Customized Plan") : (isAr ? "خطة موصى بها" : "Recommended Plan");
  const title = `${planLabel} - ${isAr && group.stair_title_ar ? group.stair_title_ar : group.stair_title}`;

  let body = `
    <div class="header">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <span style="font-size:28px">${strategyContext?.icon || "🎯"}</span>
        <div>
          <h1 style="font-size:24px;font-weight:700;margin:0">${strategyContext?.name || "Strategy"}</h1>
          <div style="font-size:12px;color:#64748b">${strategyContext?.company || ""} &middot; Exported ${new Date().toLocaleDateString()}</div>
        </div>
      </div>
      ${buildStairHeader(group, plan, isAr)}
    </div>
    <div class="section" ${isCustom ? 'style="color:#B8904A"' : ""}>${isCustom ? "&#10024; " : ""}${planLabel}</div>`;

  if (planTasks.length > 0) {
    body += buildTaskTable(planTasks);
    body += buildProgress(planTasks);
  } else if (plan.raw_text) {
    body += `<div style="font-size:13px;color:#334155;white-space:pre-wrap">${plan.raw_text.replace(/\*\*/g, "").replace(/##\s/g, "").replace(/\n/g, "<br>")}</div>`;
  }

  openPrintWindow(title, body);
};

const exportAllPlans = (planGroups, strategyContext, isAr) => {
  const title = `${isAr ? "جميع خطط العمل" : "All Action Plans"} - ${strategyContext?.name || "Strategy"}`;

  let body = `
    <div class="header">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <span style="font-size:28px">${strategyContext?.icon || "🎯"}</span>
        <div>
          <h1 style="font-size:24px;font-weight:700;margin:0">${strategyContext?.name || "Strategy"}</h1>
          <div style="font-size:12px;color:#64748b">${strategyContext?.company || ""} &middot; Exported ${new Date().toLocaleDateString()}</div>
        </div>
      </div>
      <div style="margin-top:12px;padding:10px 14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;font-size:13px;color:#475569">
        ${planGroups.length} ${isAr ? "خطوة" : planGroups.length === 1 ? "stair step" : "stair steps"} &middot;
        ${planGroups.reduce((acc, g) => acc + g.plans.length, 0)} ${isAr ? "خطة عمل" : "action plans"}
      </div>
    </div>`;

  for (const group of planGroups) {
    const tColor = typeColor(group.element_type);
    body += `
      <div style="margin-top:28px;padding-bottom:8px;border-bottom:2px solid ${tColor}">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="color:${tColor};font-size:16px">${typeIcons[group.element_type] || "•"}</span>
          <span style="font-size:10px;color:${tColor};font-weight:600;text-transform:uppercase">${group.element_type?.replace("_", " ") || ""}</span>
        </div>
        <div style="font-size:18px;font-weight:700;color:#1e293b;margin-top:4px">${group.stair_code ? `<span style="color:#94a3b8;font-family:monospace;font-size:12px">${group.stair_code}</span> ` : ""}${isAr && group.stair_title_ar ? group.stair_title_ar : group.stair_title}</div>
      </div>`;

    for (const plan of group.plans) {
      const planTasks = plan.tasks || [];
      const isCustom = plan.plan_type === "customized";
      const planLabel = isCustom ? (isAr ? "خطة مخصصة" : "Customized Plan") : (isAr ? "خطة موصى بها" : "Recommended Plan");
      const created = plan.created_at ? new Date(plan.created_at).toLocaleDateString() : "";

      body += `<div style="margin-top:16px;margin-bottom:8px;font-size:14px;font-weight:600;${isCustom ? "color:#B8904A" : "color:#1e293b"}">${isCustom ? "&#10024; " : "&#128203; "}${planLabel} <span style="font-size:11px;font-weight:400;color:#94a3b8;margin-left:8px">${created}</span></div>`;

      if (planTasks.length > 0) {
        body += buildTaskTable(planTasks);
        body += buildProgress(planTasks);
      } else if (plan.raw_text) {
        body += `<div style="font-size:13px;color:#334155;white-space:pre-wrap;margin-top:8px">${plan.raw_text.replace(/\*\*/g, "").replace(/##\s/g, "").replace(/\n/g, "<br>")}</div>`;
      }
    }
  }

  openPrintWindow(title, body);
};


// ═══ ACTION PLANS VIEW ═══
export const ActionPlansView = ({ strategyContext, lang }) => {
  const [planGroups, setPlanGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedStair, setExpandedStair] = useState(null);
  const [expandedPlan, setExpandedPlan] = useState(null);
  const isAr = lang === "ar";

  useEffect(() => {
    if (strategyContext?.id) loadPlans();
  }, [strategyContext?.id]);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const data = await ActionPlansAPI.getForStrategy(strategyContext.id);
      setPlanGroups(data || []);
    } catch (e) {
      console.error("Load action plans:", e);
      setPlanGroups([]);
    }
    setLoading(false);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString(isAr ? "ar-SA" : "en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const getProgress = (taskCount, completedCount) => {
    if (!taskCount) return 0;
    return Math.round((completedCount / taskCount) * 100);
  };

  const toggleTask = async (groupIndex, planId, taskIndex) => {
    setPlanGroups(prev => {
      const updated = structuredClone(prev);
      for (const group of updated) {
        const plan = group.plans.find(p => p.id === planId);
        if (plan && plan.tasks[taskIndex] !== undefined) {
          plan.tasks[taskIndex].done = !plan.tasks[taskIndex].done;
          break;
        }
      }
      return updated;
    });
    try {
      const group = planGroups[groupIndex];
      const plan = group?.plans.find(p => p.id === planId);
      const task = plan?.tasks[taskIndex];
      if (task) await ActionPlansAPI.updateTaskDone(planId, taskIndex, !task.done);
    } catch (err) {
      console.warn("Failed to persist task toggle:", err.message);
    }
  };

  const PriorityBadge = ({ priority }) => {
    const c = { High: "bg-red-500/20 text-red-300 border-red-500/30", Medium: "bg-amber-500/20 text-amber-300 border-amber-500/30", Low: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" };
    return <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${c[priority] || c.Medium}`}>{priority}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center">
        <div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-amber-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
        <span className="text-gray-500 text-xs">{isAr ? "جاري تحميل خطط العمل..." : "Loading action plans..."}</span>
      </div>
    );
  }

  if (planGroups.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">📋</div>
        <h3 className="text-white text-lg font-semibold mb-2">{isAr ? "لا توجد خطط عمل بعد" : "No Action Plans Yet"}</h3>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          {isAr
            ? "عندما تنشئ خطط عمل في غرفة التنفيذ لأي خطوة، ستظهر هنا تلقائياً."
            : "When you generate action plans in the Execution Room for any stair step, they will appear here automatically."}
        </p>
      </div>
    );
  }

  const totalPlans = planGroups.reduce((acc, g) => acc + g.plans.length, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-white">{isAr ? "خطط العمل" : "Action Plans"}</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {planGroups.length} {isAr ? "خطوة" : planGroups.length === 1 ? "stair" : "stairs"}
          </span>
          <button
            onClick={() => exportAllPlans(planGroups, strategyContext, isAr)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:scale-[1.02]"
            style={{ borderColor: `${GOLD}60`, color: GOLD, background: `${GOLD}15` }}
            title={isAr ? `تصدير ${totalPlans} خطة عمل` : `Export all ${totalPlans} plans`}
          >
            ↓ {isAr ? "تصدير جميع الخطط" : "Export All Plans"}
          </button>
          <button onClick={loadPlans} className="text-xs text-amber-400/70 hover:text-amber-400 transition px-2 py-1 rounded hover:bg-amber-500/10">
            {isAr ? "↻ تحديث" : "↻ Refresh"}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {planGroups.map((group, gi) => {
          const isExpanded = expandedStair === group.stair_id;
          const color = typeColors[group.element_type] || "#94a3b8";
          const recProgress = getProgress(group.recommended_task_count, group.recommended_completed);
          const custProgress = getProgress(group.customized_task_count, group.customized_completed);

          return (
            <div key={group.stair_id} className="rounded-xl overflow-hidden" style={glass(0.4)}>
              {/* Stair header — always visible */}
              <button
                onClick={() => setExpandedStair(isExpanded ? null : group.stair_id)}
                className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition"
              >
                <div className="flex items-center gap-2 shrink-0">
                  <span style={{ color, fontSize: 14 }}>{typeIcons[group.element_type] || "•"}</span>
                  <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color }}>{group.element_type?.replace("_", " ")}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">
                    {group.stair_code && <span className="text-gray-500 font-mono text-xs mr-1.5">{group.stair_code}</span>}
                    {isAr && group.stair_title_ar ? group.stair_title_ar : group.stair_title}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {group.has_recommended && (
                      <span className="text-[10px] text-gray-500">
                        📋 {isAr ? "موصى بها" : "Recommended"} · {formatDate(group.latest_recommended_at)}
                      </span>
                    )}
                    {group.has_customized && (
                      <span className="text-[10px] text-amber-400/70">
                        ✨ {isAr ? "مخصصة" : "Customized"} · {formatDate(group.latest_customized_at)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {group.has_recommended && group.recommended_task_count > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-[#1e3a5f] overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${recProgress}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-500 w-8">{recProgress}%</span>
                    </div>
                  )}
                  {group.has_customized && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium bg-amber-500/15 text-amber-300 border-amber-500/25">
                      ✨
                    </span>
                  )}
                  <span className={`text-gray-500 text-sm transition-transform ${isExpanded ? "rotate-180" : ""}`}>▾</span>
                </div>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t px-5 py-4" style={{ borderColor: BORDER }}>
                  {group.plans.length === 0 ? (
                    <p className="text-gray-600 text-xs">{isAr ? "لا توجد خطط" : "No plans found"}</p>
                  ) : (
                    <div className="space-y-3">
                      {group.plans.map((plan) => {
                        const isPlanExpanded = expandedPlan === plan.id;
                        const planTasks = plan.tasks || [];
                        const doneCount = planTasks.filter(t => t.done).length;
                        const progress = planTasks.length ? Math.round((doneCount / planTasks.length) * 100) : 0;
                        const isCustom = plan.plan_type === "customized";

                        return (
                          <div key={plan.id} className="rounded-lg overflow-hidden" style={{ ...glass(0.3), borderLeft: isCustom ? `3px solid ${GOLD}60` : undefined }}>
                            <button
                              onClick={() => setExpandedPlan(isPlanExpanded ? null : plan.id)}
                              className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition"
                            >
                              <span className="text-sm">{isCustom ? "✨" : "📋"}</span>
                              <div className="flex-1 min-w-0">
                                <span className={`text-xs font-medium ${isCustom ? "text-amber-300" : "text-white"}`}>
                                  {isCustom ? (isAr ? "خطة مخصصة" : "Customized Plan") : (isAr ? "خطة موصى بها" : "Recommended Plan")}
                                </span>
                                <span className="text-[10px] text-gray-600 ml-2">{formatDate(plan.created_at)}</span>
                              </div>
                              {planTasks.length > 0 && (
                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="w-12 h-1.5 rounded-full bg-[#1e3a5f] overflow-hidden">
                                    <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: isCustom ? GOLD : "#10b981" }} />
                                  </div>
                                  <span className="text-[10px] text-gray-500">{doneCount}/{planTasks.length}</span>
                                </div>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); exportSinglePlan(group, plan, strategyContext, isAr); }}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition hover:scale-[1.02] shrink-0"
                                style={{ borderColor: `${GOLD}40`, color: GOLD, background: `${GOLD}10` }}
                                title={isAr ? "تصدير هذه الخطة" : "Export this plan as PDF"}
                              >
                                ↓ PDF
                              </button>
                              <span className={`text-gray-600 text-xs transition-transform ${isPlanExpanded ? "rotate-180" : ""}`}>▾</span>
                            </button>

                            {isPlanExpanded && (
                              <div className="border-t px-4 py-3" style={{ borderColor: BORDER }}>
                                {planTasks.length > 0 ? (
                                  <div className="space-y-2">
                                    {planTasks.map((t, ti) => (
                                      <div key={ti} className={`flex items-start gap-2.5 py-2 ${t.done ? "opacity-50" : ""}`}>
                                        <button
                                          onClick={() => toggleTask(gi, plan.id, ti)}
                                          className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 text-[10px] cursor-pointer transition hover:border-amber-500/50 ${t.done ? "bg-emerald-500/30 border-emerald-500/50 text-emerald-300" : "border-gray-600"}`}
                                        >
                                          {t.done && "✓"}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-xs font-medium ${t.done ? "line-through text-gray-500" : "text-white"}`}>{t.name}</span>
                                            {t.priority && <PriorityBadge priority={t.priority} />}
                                          </div>
                                          {t.details && <div className="text-gray-500 text-[11px] mt-0.5">{t.details}</div>}
                                          <div className="flex items-center gap-3 mt-1">
                                            {t.owner && <span className="text-[10px] text-gray-600">👤 {t.owner}</span>}
                                            {t.timeline && <span className="text-[10px] text-gray-600">⏱ {t.timeline}</span>}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="rounded-lg p-3" style={glass(0.2)}>
                                    <Markdown text={plan.raw_text} />
                                  </div>
                                )}

                                {planTasks.length > 0 && (
                                  <div className="mt-3 flex items-center gap-2">
                                    <div className="flex-1 h-1.5 rounded-full bg-[#1e3a5f] overflow-hidden">
                                      <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: isCustom ? `linear-gradient(90deg, ${GOLD}, ${GOLD_L})` : "#10b981" }} />
                                    </div>
                                    <span className="text-[10px] text-gray-500">{progress}% {isAr ? "مكتمل" : "complete"}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
