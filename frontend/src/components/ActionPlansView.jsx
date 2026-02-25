import { useState, useEffect } from "react";
import { ActionPlansAPI } from "../api";
import { GOLD, GOLD_L, DEEP, BORDER, glass, typeColors, typeIcons } from "../constants";
import { Markdown } from "./Markdown";

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

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-white">{isAr ? "خطط العمل" : "Action Plans"}</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {planGroups.length} {isAr ? "خطوة" : planGroups.length === 1 ? "stair" : "stairs"}
          </span>
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
                              <span className={`text-gray-600 text-xs transition-transform ${isPlanExpanded ? "rotate-180" : ""}`}>▾</span>
                            </button>

                            {isPlanExpanded && (
                              <div className="border-t px-4 py-3" style={{ borderColor: BORDER }}>
                                {planTasks.length > 0 ? (
                                  <div className="space-y-2">
                                    {planTasks.map((t, ti) => (
                                      <div key={ti} className={`flex items-start gap-2.5 py-2 ${t.done ? "opacity-50" : ""}`}>
                                        <span className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 text-[10px] ${t.done ? "bg-emerald-500/30 border-emerald-500/50 text-emerald-300" : "border-gray-600"}`}>
                                          {t.done && "✓"}
                                        </span>
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
