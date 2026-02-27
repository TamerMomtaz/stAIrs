import { useState, useEffect, useCallback } from "react";
import { ActionPlansAPI, ManifestStore, SourcesAPI } from "../api";
import { GOLD, GOLD_L, DEEP, BORDER, glass, typeColors, typeIcons } from "../constants";
import { Markdown } from "./Markdown";

// ═══ PDF HELPERS ═══
const pdfStyles = `@page{margin:20mm 15mm}*{box-sizing:border-box;margin:0;padding:0}body{background:#fff;color:#1e293b;font-family:'Segoe UI',system-ui,sans-serif;line-height:1.5}.section{margin-top:24px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;color:#B8904A;font-size:16px;font-weight:700}.footer{text-align:center;margin-top:30px;padding-top:16px;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:10px}.header{padding-bottom:16px;border-bottom:2px solid #B8904A;margin-bottom:20px}.manifest-card{margin-top:16px;padding:16px;border:1px solid #e2e8f0;border-radius:8px;page-break-inside:avoid}.toc-item{padding:4px 0;font-size:13px;color:#475569}.toc-num{color:#B8904A;font-weight:600;margin-right:8px}`;

const typeColor = t => ({ vision: "#7c3aed", objective: "#2563eb", key_result: "#059669", initiative: "#d97706", task: "#64748b" }[t] || "#64748b");

const buildManifestHtml = (manifest, taskInfo, index) => {
  const stepsHtml = (manifest.impl_steps || []).map((s, i) => {
    const checked = s.done ? "&#9745;" : "&#9744;";
    return `<div style="padding:4px 0;font-size:12px;color:${s.done ? '#94a3b8' : '#334155'};${s.done ? 'text-decoration:line-through' : ''}">${checked} <span style="color:#8b5cf6;font-weight:600">${i + 1}.</span> ${s.label}</div>`;
  }).join("");
  const doneSteps = (manifest.impl_steps || []).filter(s => s.done).length;
  const totalSteps = (manifest.impl_steps || []).length;
  const stepPct = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;

  const sourcesHtml = (manifest.sources_used || []).map(s =>
    `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;margin:2px">${s}</span>`
  ).join(" ");

  return `
    <div class="manifest-card" id="manifest-${index}">
      <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:12px">${index + 1}. ${taskInfo?.name || manifest.task_name || "Action"}</div>
      ${manifest.explanation ? `
        <div style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:600;color:#3b82f6;text-transform:uppercase;margin-bottom:4px">Explanation</div>
          <div style="font-size:12px;color:#334155;white-space:pre-wrap">${(manifest.explanation || "").replace(/\*\*/g, "").replace(/##\s/g, "").replace(/\n/g, "<br>")}</div>
        </div>` : ""}
      ${manifest.ability_assessment ? `
        <div style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:600;color:#0d9488;text-transform:uppercase;margin-bottom:4px">Ability Assessment</div>
          <div style="font-size:12px;color:#334155;white-space:pre-wrap">${(manifest.ability_assessment || "").replace(/\*\*/g, "").replace(/##\s/g, "").replace(/\n/g, "<br>")}</div>
        </div>` : ""}
      ${manifest.customized_plan ? `
        <div style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:600;color:#B8904A;text-transform:uppercase;margin-bottom:4px">Customized Plan</div>
          <div style="font-size:12px;color:#334155;white-space:pre-wrap">${(manifest.customized_plan || "").replace(/\*\*/g, "").replace(/##\s/g, "").replace(/\n/g, "<br>")}</div>
        </div>` : ""}
      ${manifest.impl_guide ? `
        <div style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:600;color:#8b5cf6;text-transform:uppercase;margin-bottom:4px">Implementation Guide</div>
          <div style="font-size:12px;color:#334155;white-space:pre-wrap">${(manifest.impl_guide || "").replace(/\*\*/g, "").replace(/##\s/g, "").replace(/\n/g, "<br>")}</div>
        </div>` : ""}
      ${totalSteps > 0 ? `
        <div style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:600;color:#8b5cf6;text-transform:uppercase;margin-bottom:4px">Step Progress &mdash; ${doneSteps}/${totalSteps} complete (${stepPct}%)</div>
          <div style="margin-bottom:8px;height:6px;border-radius:4px;background:#e5e7eb;overflow:hidden"><div style="height:100%;border-radius:4px;background:#8b5cf6;width:${stepPct}%"></div></div>
          ${stepsHtml}
        </div>` : ""}
      ${sourcesHtml ? `
        <div>
          <div style="font-size:11px;font-weight:600;color:#2563eb;text-transform:uppercase;margin-bottom:4px">Source of Truth References</div>
          ${sourcesHtml}
        </div>` : ""}
    </div>`;
};

const openPrintWindow = (title, bodyContent) => {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>${pdfStyles}</style></head><body>${bodyContent}<div class="footer" style="text-align:center;margin-top:40px;padding-top:20px;border-top:2px solid #B8904A"><div style="font-size:14px;font-weight:700;color:#B8904A;letter-spacing:3px;margin-bottom:4px">HUMAN IS THE LOOP</div><div style="font-size:10px;color:#94a3b8">ST.AIRS &mdash; Strategy AI Interactive Real-time System &middot; By DEVONEERS &middot; ${new Date().getFullYear()}</div></div></body></html>`);
  w.document.close();
  w.print();
};


// ═══ MANIFEST ROOM VIEW ═══
export const ManifestRoom = ({ strategyContext, lang, onImplStepToggle }) => {
  const [planGroups, setPlanGroups] = useState([]);
  const [manifestData, setManifestData] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedStair, setExpandedStair] = useState(null);
  const [expandedManifest, setExpandedManifest] = useState(null);
  const isAr = lang === "ar";

  // Fix 2: Migrate/reconcile orphaned manifest entries by matching task name + stair_id
  const reconcileManifests = useCallback((allManifests, groups) => {
    if (!groups || groups.length === 0) return allManifests;
    const store = new ManifestStore(strategyContext.id);

    // Build lookup of valid keys and name-based index from plan groups
    const validKeys = new Set();
    const keysByStairAndName = {};
    for (const group of groups) {
      for (const plan of group.plans) {
        (plan.tasks || []).forEach((t, i) => {
          const key = `${group.stair_id}_${t.id || `task_${i}_${plan.id}`}`;
          validKeys.add(key);
          const nameKey = `${group.stair_id}_${(t.name || "").toLowerCase().trim()}`;
          if (!keysByStairAndName[nameKey]) {
            keysByStairAndName[nameKey] = { key, taskId: t.id || `task_${i}_${plan.id}`, taskName: t.name };
          }
        });
      }
    }

    // Check for orphaned manifests (keys that don't match any plan task) and migrate them
    let updated = false;
    const result = { ...allManifests };
    for (const [mk, manifest] of Object.entries(allManifests)) {
      if (validKeys.has(mk)) continue; // Already matches — skip
      if (!(manifest.explanation || manifest.ability_assessment || manifest.customized_plan || manifest.impl_guide)) continue;

      // Try to match by task_name + stair_id
      const nameKey = `${manifest.stair_id}_${(manifest.task_name || "").toLowerCase().trim()}`;
      const match = keysByStairAndName[nameKey];
      if (match && !result[match.key]) {
        // Migrate: copy manifest data to the correct key
        const migrated = { ...manifest, task_id: match.taskId };
        store.set(manifest.stair_id, match.taskId, migrated);
        result[match.key] = migrated;
        updated = true;
      }
    }

    return result;
  }, [strategyContext?.id]);

  const loadData = useCallback(async () => {
    if (!strategyContext?.id) return;
    setLoading(true);
    try {
      const store = new ManifestStore(strategyContext.id);
      const allManifests = store.getAll();

      const data = await ActionPlansAPI.getForStrategy(strategyContext.id);
      const groups = data || [];
      setPlanGroups(groups);

      // Fix 2: Reconcile/migrate orphaned manifest entries to correct keys
      const reconciledManifests = reconcileManifests(allManifests, groups);
      setManifestData(reconciledManifests);
    } catch (e) {
      console.error("Load manifest data:", e);
      setPlanGroups([]);
    }
    setLoading(false);
  }, [strategyContext?.id, reconcileManifests]);

  useEffect(() => { loadData(); }, [loadData]);

  // Fix 3: Listen for manifest updates from ExecutionRoom via storage events (cross-tab)
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === `stairs_manifest_${strategyContext?.id}`) {
        try { setManifestData(JSON.parse(e.newValue || "{}")); } catch {}
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [strategyContext?.id]);

  // Fix 3: Listen for same-tab manifest updates via custom event
  useEffect(() => {
    const handleManifestUpdate = (e) => {
      if (e.detail?.strategyId === strategyContext?.id) {
        const store = new ManifestStore(strategyContext.id);
        setManifestData(store.getAll());
      }
    };
    window.addEventListener("manifest-updated", handleManifestUpdate);
    return () => window.removeEventListener("manifest-updated", handleManifestUpdate);
  }, [strategyContext?.id]);

  // Fix 1: Build manifest-enriched groups — show ALL tasks that have ANY manifest data
  const manifestGroups = planGroups.map(group => {
    const allTasks = group.plans.flatMap(p => (p.tasks || []).map((t, i) => ({
      ...t,
      _planId: p.id,
      _planType: p.plan_type,
      _taskIndex: i,
      _manifestKey: `${group.stair_id}_${t.id || `task_${i}_${p.id}`}`,
    })));
    // Deduplicate tasks by _manifestKey (prefer tasks with manifest data)
    const seen = new Set();
    const uniqueTasks = allTasks.filter(t => {
      if (seen.has(t._manifestKey)) return false;
      seen.add(t._manifestKey);
      return true;
    });
    const tasksWithManifest = uniqueTasks.filter(t => {
      const mk = t._manifestKey;
      const m = manifestData[mk];
      return m && (m.explanation || m.ability_assessment || m.customized_plan || m.impl_guide);
    });
    return { ...group, manifestTasks: tasksWithManifest };
  }).filter(g => g.manifestTasks.length > 0);

  const totalActions = planGroups.reduce((acc, g) => acc + g.plans.flatMap(p => p.tasks || []).length, 0);
  const actionsWithManifest = manifestGroups.reduce((acc, g) => acc + g.manifestTasks.length, 0);

  // Calculate overall implementation progress from impl_steps across all manifests
  let totalSteps = 0;
  let doneSteps = 0;
  Object.values(manifestData).forEach(m => {
    if (m.impl_steps) {
      totalSteps += m.impl_steps.length;
      doneSteps += m.impl_steps.filter(s => s.done).length;
    }
  });
  const overallProgress = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;

  const toggleImplStep = (manifestKey, stepId) => {
    const store = new ManifestStore(strategyContext.id);
    const m = manifestData[manifestKey];
    if (!m || !m.impl_steps) return;
    const updatedSteps = m.impl_steps.map(s => s.id === stepId ? { ...s, done: !s.done } : s);
    store.set(m.stair_id, m.task_id, { impl_steps: updatedSteps });
    setManifestData(prev => ({
      ...prev,
      [manifestKey]: { ...prev[manifestKey], impl_steps: updatedSteps },
    }));
    // Notify parent so ExecutionRoom can sync if open
    if (onImplStepToggle) onImplStepToggle(m.stair_id, m.task_id, stepId);
  };

  const exportSingleManifest = (manifest, taskInfo, group) => {
    const title = `Implementation Manifest - ${taskInfo?.name || manifest.task_name || "Action"}`;
    const header = `
      <div class="header">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
          <span style="font-size:28px">${strategyContext?.icon || "🎯"}</span>
          <div>
            <div style="font-size:14px;font-weight:700;color:#B8904A;letter-spacing:2px;margin-bottom:4px">ST.AIRS</div>
            <h1 style="font-size:24px;font-weight:700;margin:0">${strategyContext?.name || "Strategy"}</h1>
            <div style="font-size:12px;color:#64748b">${strategyContext?.company || ""} &middot; Implementation Manifest &middot; ${new Date().toLocaleDateString()}</div>
          </div>
        </div>
        <div style="margin-top:12px;padding:10px 14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:10px;color:${typeColor(group.element_type)};text-transform:uppercase;font-weight:600;margin-bottom:2px">${group.element_type?.replace("_", " ") || ""}</div>
          <div style="font-size:14px;font-weight:700;color:#1e293b">${group.stair_code ? `<span style="color:#94a3b8;font-family:monospace;font-size:11px">${group.stair_code}</span> ` : ""}${isAr && group.stair_title_ar ? group.stair_title_ar : group.stair_title}</div>
        </div>
      </div>`;
    const body = header + buildManifestHtml(manifest, taskInfo, 0);
    openPrintWindow(title, body);
  };

  const exportAllManifests = () => {
    const title = `${isAr ? "سجل التنفيذ" : "Implementation Manifests"} - ${strategyContext?.name || "Strategy"}`;
    let tocItems = [];
    let manifestSections = "";
    let idx = 0;

    for (const group of manifestGroups) {
      const tColor = typeColor(group.element_type);
      manifestSections += `
        <div style="margin-top:28px;padding-bottom:8px;border-bottom:2px solid ${tColor}">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="color:${tColor};font-size:16px">${typeIcons[group.element_type] || "&#8226;"}</span>
            <span style="font-size:10px;color:${tColor};font-weight:600;text-transform:uppercase">${group.element_type?.replace("_", " ") || ""}</span>
          </div>
          <div style="font-size:18px;font-weight:700;color:#1e293b;margin-top:4px">${group.stair_code ? `<span style="color:#94a3b8;font-family:monospace;font-size:12px">${group.stair_code}</span> ` : ""}${isAr && group.stair_title_ar ? group.stair_title_ar : group.stair_title}</div>
        </div>`;

      for (const task of group.manifestTasks) {
        const m = manifestData[task._manifestKey];
        if (!m) continue;
        tocItems.push({ idx: idx + 1, name: task.name || m.task_name || `Action ${idx + 1}`, stair: isAr && group.stair_title_ar ? group.stair_title_ar : group.stair_title });
        manifestSections += buildManifestHtml(m, task, idx);
        idx++;
      }
    }

    const toc = tocItems.length > 0 ? `
      <div class="section">Table of Contents</div>
      ${tocItems.map(t => `<div class="toc-item"><span class="toc-num">${t.idx}.</span> ${t.name} <span style="font-size:11px;color:#94a3b8">&mdash; ${t.stair}</span></div>`).join("")}` : "";

    const header = `
      <div class="header">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
          <span style="font-size:28px">${strategyContext?.icon || "🎯"}</span>
          <div>
            <div style="font-size:14px;font-weight:700;color:#B8904A;letter-spacing:2px;margin-bottom:4px">ST.AIRS</div>
            <h1 style="font-size:24px;font-weight:700;margin:0">${strategyContext?.name || "Strategy"}</h1>
            <div style="font-size:12px;color:#64748b">${strategyContext?.company || ""} &middot; Implementation Manifests Export &middot; ${new Date().toLocaleDateString()}</div>
          </div>
        </div>
        <div style="margin-top:12px;padding:10px 14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;font-size:13px;color:#475569">
          ${actionsWithManifest} ${isAr ? "سجل تنفيذ" : actionsWithManifest === 1 ? "manifest" : "manifests"} &middot;
          ${overallProgress}% ${isAr ? "تقدم عام" : "overall progress"} &middot;
          ${doneSteps}/${totalSteps} ${isAr ? "خطوات مكتملة" : "steps complete"}
        </div>
      </div>`;

    openPrintWindow(title, header + toc + manifestSections);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center">
        <div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-amber-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
        <span className="text-gray-500 text-xs">{isAr ? "جاري تحميل سجل التنفيذ..." : "Loading manifests..."}</span>
      </div>
    );
  }

  if (manifestGroups.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">📦</div>
        <h3 className="text-white text-lg font-semibold mb-2">{isAr ? "لا توجد سجلات تنفيذ بعد" : "No Implementation Manifests Yet"}</h3>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          {isAr
            ? "عندما تعمل على الإجراءات في غرفة التنفيذ (شرح، تقييم القدرة، خطة مخصصة، دليل التنفيذ)، ستظهر السجلات هنا تلقائياً."
            : "When you work through actions in the Execution Room (explain, assess ability, customize plan, generate implementation guide), manifests will appear here automatically."}
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-white">{isAr ? "سجل التنفيذ" : "Manifest Room"}</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={exportAllManifests}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:scale-[1.02]"
            style={{ borderColor: `${GOLD}60`, color: GOLD, background: `${GOLD}15` }}
            title={isAr ? "تصدير جميع السجلات كملف PDF" : "Export All as PDF"}
          >
            ↓ {isAr ? "تصدير الكل PDF" : "Export All as PDF"}
          </button>
          <button onClick={loadData} className="text-xs text-amber-400/70 hover:text-amber-400 transition px-2 py-1 rounded hover:bg-amber-500/10">
            {isAr ? "↻ تحديث" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="px-4 py-3 rounded-xl text-center" style={glass(0.4)}>
          <div className="text-lg font-bold text-white">{totalActions}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">{isAr ? "إجمالي الإجراءات" : "Total Actions"}</div>
        </div>
        <div className="px-4 py-3 rounded-xl text-center" style={glass(0.4)}>
          <div className="text-lg font-bold text-amber-400">{actionsWithManifest}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">{isAr ? "سجلات مكتملة" : "With Manifests"}</div>
        </div>
        <div className="px-4 py-3 rounded-xl text-center" style={glass(0.4)}>
          <div className="text-lg font-bold" style={{ color: overallProgress >= 70 ? "#10b981" : overallProgress >= 40 ? GOLD : "#94a3b8" }}>{overallProgress}%</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">{isAr ? "تقدم التنفيذ" : "Implementation Progress"}</div>
        </div>
      </div>

      {/* Overall progress bar */}
      {totalSteps > 0 && (
        <div className="flex items-center gap-3 mb-5 px-4 py-2.5 rounded-xl" style={glass(0.3)}>
          <span className="text-xs text-gray-400 shrink-0">{doneSteps}/{totalSteps} {isAr ? "خطوات" : "steps"}</span>
          <div className="flex-1 h-2 rounded-full bg-[#1e3a5f] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${overallProgress}%`, background: `linear-gradient(90deg, ${GOLD}, ${GOLD_L})` }} />
          </div>
          <span className="text-xs font-medium" style={{ color: GOLD }}>{overallProgress}%</span>
        </div>
      )}

      {/* Manifest Groups */}
      <div className="space-y-3">
        {manifestGroups.map((group) => {
          const isExpanded = expandedStair === group.stair_id;
          const color = typeColors[group.element_type] || "#94a3b8";
          const groupSteps = group.manifestTasks.reduce((acc, t) => {
            const m = manifestData[t._manifestKey];
            return acc + (m?.impl_steps?.length || 0);
          }, 0);
          const groupDone = group.manifestTasks.reduce((acc, t) => {
            const m = manifestData[t._manifestKey];
            return acc + (m?.impl_steps?.filter(s => s.done).length || 0);
          }, 0);
          const groupPct = groupSteps ? Math.round((groupDone / groupSteps) * 100) : 0;

          return (
            <div key={group.stair_id} className="rounded-xl overflow-hidden" style={glass(0.4)}>
              {/* Group header */}
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
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {group.manifestTasks.length} {isAr ? "سجل" : group.manifestTasks.length === 1 ? "manifest" : "manifests"}
                    {groupSteps > 0 && <> · {groupDone}/{groupSteps} {isAr ? "خطوات" : "steps"}</>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {groupSteps > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-[#1e3a5f] overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${groupPct}%`, background: `linear-gradient(90deg, ${GOLD}, ${GOLD_L})` }} />
                      </div>
                      <span className="text-[10px] text-gray-500 w-8">{groupPct}%</span>
                    </div>
                  )}
                  <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium bg-amber-500/15 text-amber-300 border-amber-500/25">
                    📦 {group.manifestTasks.length}
                  </span>
                  <span className={`text-gray-500 text-sm transition-transform ${isExpanded ? "rotate-180" : ""}`}>▾</span>
                </div>
              </button>

              {/* Expanded manifests */}
              {isExpanded && (
                <div className="border-t px-5 py-4 space-y-3" style={{ borderColor: BORDER }}>
                  {group.manifestTasks.map((task) => {
                    const mk = task._manifestKey;
                    const m = manifestData[mk];
                    if (!m) return null;
                    const isManifestExpanded = expandedManifest === mk;
                    const mSteps = m.impl_steps || [];
                    const mDone = mSteps.filter(s => s.done).length;
                    const mPct = mSteps.length ? Math.round((mDone / mSteps.length) * 100) : 0;

                    // Count how many sections are completed vs total
                    const completedSections = [m.explanation, m.ability_assessment, m.customized_plan, m.impl_guide].filter(Boolean).length;
                    const sections = completedSections;

                    return (
                      <div key={mk} className="rounded-lg overflow-hidden" style={{ ...glass(0.3), borderLeft: `3px solid ${GOLD}60` }}>
                        {/* Manifest card header (collapsed view) */}
                        <button
                          onClick={() => setExpandedManifest(isManifestExpanded ? null : mk)}
                          className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition"
                        >
                          <span className="text-sm">📦</span>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-semibold text-white">{task.name || m.task_name || "Action"}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-gray-600">{completedSections}/4 {isAr ? "أقسام" : "sections"}</span>
                              {mSteps.length > 0 && <span className="text-[10px] text-purple-400/70">{mDone}/{mSteps.length} {isAr ? "خطوات" : "steps"}</span>}
                            </div>
                          </div>
                          {mSteps.length > 0 && (
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="w-16 h-1.5 rounded-full bg-[#1e3a5f] overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${mPct}%`, background: "linear-gradient(90deg, #8b5cf6, #a78bfa)" }} />
                              </div>
                              <span className="text-[10px] text-gray-500">{mPct}%</span>
                            </div>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); exportSingleManifest(m, task, group); }}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition hover:scale-[1.02] shrink-0"
                            style={{ borderColor: `${GOLD}40`, color: GOLD, background: `${GOLD}10` }}
                            title={isAr ? "تصدير هذا السجل" : "Export this manifest as PDF"}
                          >
                            ↓ PDF
                          </button>
                          <span className={`text-gray-600 text-xs transition-transform ${isManifestExpanded ? "rotate-180" : ""}`}>▾</span>
                        </button>

                        {/* Expanded manifest content */}
                        {isManifestExpanded && (
                          <div className="border-t px-4 py-4 space-y-4" style={{ borderColor: BORDER }}>
                            {/* Explanation */}
                            {m.explanation ? (
                              <div className="rounded-lg p-3 border border-blue-500/15" style={{ background: "rgba(59,130,246,0.03)" }}>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-blue-400 text-xs font-semibold">{isAr ? "الشرح" : "Explanation"}</span>
                                  {m.sources_used?.length > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400/70 border border-blue-500/15">
                                      {isAr ? "مدعوم بمصدر الحقيقة" : "Source of Truth"}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs leading-relaxed text-gray-300">
                                  <Markdown text={m.explanation} />
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-lg p-3 border border-blue-500/10 opacity-50">
                                <span className="text-blue-400/60 text-xs font-semibold">{isAr ? "الشرح" : "Explanation"}</span>
                                <span className="text-[10px] text-gray-600 ml-2">{isAr ? "لم يبدأ بعد" : "Not yet started"}</span>
                              </div>
                            )}

                            {/* Ability Assessment */}
                            {m.ability_assessment ? (
                              <div className="rounded-lg p-3 border border-teal-500/15" style={{ background: "rgba(13,148,136,0.03)" }}>
                                <div className="text-teal-400 text-xs font-semibold mb-2">{isAr ? "تقييم القدرة" : "Ability Assessment"}</div>
                                <div className="text-xs leading-relaxed text-gray-300">
                                  <Markdown text={m.ability_assessment} />
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-lg p-3 border border-teal-500/10 opacity-50">
                                <span className="text-teal-400/60 text-xs font-semibold">{isAr ? "تقييم القدرة" : "Ability Assessment"}</span>
                                <span className="text-[10px] text-gray-600 ml-2">{isAr ? "لم يبدأ بعد" : "Not yet started"}</span>
                              </div>
                            )}

                            {/* Customized Plan */}
                            {m.customized_plan ? (
                              <div className="rounded-lg p-3 border border-amber-500/15" style={{ background: "rgba(184,144,74,0.03)" }}>
                                <div className="text-amber-400 text-xs font-semibold mb-2">{isAr ? "الخطة المخصصة" : "Customized Plan"}</div>
                                <div className="text-xs leading-relaxed text-gray-300">
                                  <Markdown text={m.customized_plan} />
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-lg p-3 border border-amber-500/10 opacity-50">
                                <span className="text-amber-400/60 text-xs font-semibold">{isAr ? "الخطة المخصصة" : "Customized Plan"}</span>
                                <span className="text-[10px] text-gray-600 ml-2">{isAr ? "لم يبدأ بعد" : "Not yet started"}</span>
                              </div>
                            )}

                            {/* Implementation Guide */}
                            {m.impl_guide ? (
                              <div className="rounded-lg p-3 border border-purple-500/15" style={{ background: "rgba(139,92,246,0.03)" }}>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-purple-400 text-xs font-semibold">{isAr ? "دليل التنفيذ" : "Implementation Guide"}</span>
                                  {m.impl_sources_used?.length > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400/70 border border-blue-500/15">
                                      {isAr ? "مصدر الحقيقة" : "Source of Truth"}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs leading-relaxed text-gray-300">
                                  <Markdown text={m.impl_guide} />
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-lg p-3 border border-purple-500/10 opacity-50">
                                <span className="text-purple-400/60 text-xs font-semibold">{isAr ? "دليل التنفيذ" : "Implementation Guide"}</span>
                                <span className="text-[10px] text-gray-600 ml-2">{isAr ? "لم يبدأ بعد" : "Not yet started"}</span>
                              </div>
                            )}

                            {/* Step Progress */}
                            {mSteps.length > 0 && (
                              <div className="rounded-lg p-3 border border-purple-500/15" style={{ background: "rgba(139,92,246,0.05)" }}>
                                <div className="text-[11px] text-purple-300 font-medium mb-2">
                                  {isAr ? "تقدم الخطوات" : "Step Progress"} — {mDone}/{mSteps.length} {isAr ? "مكتمل" : "complete"}
                                </div>
                                <div className="h-1.5 rounded-full bg-[#1e3a5f] overflow-hidden mb-3">
                                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${mPct}%`, background: "linear-gradient(90deg, #8b5cf6, #a78bfa)" }} />
                                </div>
                                <div className="space-y-1.5">
                                  {mSteps.map((step, si) => (
                                    <label key={step.id} className="flex items-start gap-2 cursor-pointer group">
                                      <button
                                        onClick={() => toggleImplStep(mk, step.id)}
                                        className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition text-[9px] ${
                                          step.done ? "bg-purple-500/30 border-purple-500/50 text-purple-300" : "border-purple-500/30 hover:border-purple-500/60 group-hover:border-purple-400/50"
                                        }`}
                                      >
                                        {step.done && "✓"}
                                      </button>
                                      <span className={`text-[11px] leading-relaxed ${step.done ? "line-through text-gray-600" : "text-gray-300"}`}>
                                        <span className="text-purple-400/70 font-medium">{si + 1}.</span> {step.label}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Source of Truth References */}
                            {(m.sources_used?.length > 0 || m.impl_sources_used?.length > 0) && (
                              <div className="rounded-lg p-3 border border-blue-500/15" style={{ background: "rgba(59,130,246,0.02)" }}>
                                <div className="text-blue-400 text-xs font-semibold mb-2">{isAr ? "مراجع مصدر الحقيقة" : "Source of Truth References"}</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {[...new Set([...(m.sources_used || []), ...(m.impl_sources_used || [])])].map((src, i) => (
                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400/80 border border-blue-500/20">
                                      {src}
                                    </span>
                                  ))}
                                </div>
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
          );
        })}
      </div>
    </div>
  );
};
