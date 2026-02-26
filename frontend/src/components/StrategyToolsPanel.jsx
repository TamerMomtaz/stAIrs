import { GOLD, GOLD_L, BORDER, glass } from "../constants";
import { MATRIX_FRAMEWORKS } from "./StrategyMatrixToolkit";
import { buildHeader, openExportWindow } from "../exportUtils";

const TOOL_DESCRIPTIONS = {
  ife: "Evaluate internal strengths and weaknesses with weighted scoring to assess your organization's internal strategic position.",
  efe: "Assess how well your organization responds to external opportunities and threats in the competitive environment.",
  space: "Determine appropriate strategic posture (Aggressive, Conservative, Defensive, or Competitive) across four dimensions.",
  bcg: "Classify business units or products by market growth rate and relative market share into Stars, Cash Cows, Question Marks, and Dogs.",
  porter: "Analyze the five competitive forces that shape industry attractiveness and long-term profitability.",
};

const exportMatrixSummary = (results, strategyContext) => {
  const cards = Object.values(MATRIX_FRAMEWORKS).map(fw => {
    const r = results?.[fw.key];
    if (!r) return "";
    return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:12px;page-break-inside:avoid">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:20px">${fw.icon}</span><span style="font-weight:600;font-size:14px;color:#1e293b">${fw.name}</span></div>
      <div style="font-size:11px;color:#64748b;margin-bottom:8px">${fw.description}</div>
      <div style="padding:10px;background:#fffbeb;border:1px solid #fcd34d40;border-radius:6px"><div style="font-size:13px;font-weight:600;color:#B8904A">${r.summary}</div><div style="font-size:10px;color:#94a3b8;margin-top:4px">Saved ${new Date(r.saved_at).toLocaleDateString()}</div></div>
    </div>`;
  }).filter(Boolean).join("");
  if (!cards) return;
  const body = `${buildHeader(strategyContext, "Strategy Tools Summary")}
    <div class="section">🔧 Strategy Analysis Summary</div>
    <p style="font-size:12px;color:#64748b;margin-bottom:16px">Completed strategy matrix results overview.</p>
    ${cards}`;
  openExportWindow("Strategy Tools Summary", body);
};

export const StrategyToolsPanel = ({ lang, onMatrixClick, matrixResults, strategyContext }) => {
  const isAr = lang === "ar";
  const tools = Object.values(MATRIX_FRAMEWORKS);
  const hasAnyResult = tools.some(t => matrixResults?.[t.key]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white text-lg font-semibold mb-1">{isAr ? "أدوات الاستراتيجية" : "Strategy Tools"}</h2>
          <p className="text-gray-500 text-xs">{isAr ? "أدوات تحليل استراتيجي تفاعلية" : "Interactive strategy analysis matrices and frameworks"}</p>
        </div>
        {hasAnyResult && <button onClick={() => exportMatrixSummary(matrixResults, strategyContext)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:scale-[1.02]" style={{ borderColor: `${GOLD}60`, color: GOLD, background: `${GOLD}15` }}>↓ {isAr ? "تصدير الملخص" : "Export Summary"}</button>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map(t => {
          const result = matrixResults?.[t.key];
          return (
            <div key={t.key} className="p-5 rounded-xl flex flex-col" style={glass(0.5)}>
              <div className="text-2xl mb-3">{t.icon}</div>
              <h3 className="text-white font-semibold text-sm mb-1">{t.name}</h3>
              <p className="text-gray-400 text-xs leading-relaxed mb-4 flex-1">{TOOL_DESCRIPTIONS[t.key]}</p>
              {result && (
                <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={glass(0.3)}>
                  <span className="text-gray-500 text-[10px] uppercase tracking-wider">{isAr ? "آخر نتيجة" : "Last result"}</span>
                  <div className="text-amber-300 mt-0.5">{result.summary}</div>
                  <div className="text-gray-600 text-[10px] mt-1">{isAr ? "حُفظ" : "Saved"} {new Date(result.saved_at).toLocaleDateString()}</div>
                </div>
              )}
              <button
                onClick={() => onMatrixClick(t.key)}
                className="w-full px-4 py-2.5 rounded-lg text-xs font-medium transition-all hover:scale-[1.01]"
                style={{ background: `linear-gradient(135deg, ${GOLD}22, ${GOLD}11)`, border: `1px solid ${GOLD}33`, color: GOLD_L }}
              >
                {result ? (isAr ? "فتح مجددًا" : "Open Again") : (isAr ? "فتح" : "Open")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
