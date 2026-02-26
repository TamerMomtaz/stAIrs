// ═══ SHARED EXPORT UTILITIES ═══
// Standard ST.AIRS export helpers with consistent branding

export const EXPORT_STYLES = `
@page { margin: 20mm 15mm }
* { box-sizing: border-box; margin: 0; padding: 0 }
body { background: #fff; color: #1e293b; font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.5 }
table { width: 100%; border-collapse: collapse }
thead th { text-align: left; padding: 10px 8px; border-bottom: 2px solid #B8904A; color: #B8904A; font-size: 11px; text-transform: uppercase; font-weight: 600 }
.section { margin-top: 24px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; color: #B8904A; font-size: 16px; font-weight: 700 }
.stairs-header { display: flex; align-items: center; gap: 16px; padding-bottom: 16px; border-bottom: 2px solid #B8904A; margin-bottom: 24px }
.stairs-header h1 { font-size: 28px; font-weight: 700 }
.stairs-logo { font-size: 14px; font-weight: 700; color: #B8904A; letter-spacing: 2px; margin-bottom: 4px }
.stairs-footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 2px solid #B8904A }
.stairs-footer .motto { font-size: 14px; font-weight: 700; color: #B8904A; letter-spacing: 3px; margin-bottom: 4px }
.stairs-footer .meta { font-size: 10px; color: #94a3b8 }
.stat-box { flex: 1; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid #e5e7eb }
.stat-box .num { font-size: 22px; font-weight: 700 }
.stat-box .lbl { font-size: 10px; color: #64748b; text-transform: uppercase }
.score-card { padding: 16px; border-radius: 8px; text-align: center; border: 1px solid #e5e7eb; margin: 12px 0 }
.score-card .score-value { font-size: 32px; font-weight: 700 }
.score-card .score-label { font-size: 10px; color: #64748b; text-transform: uppercase }
.score-card .score-interp { font-size: 14px; margin-top: 4px }
.factor-table td { padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #334155 }
.factor-table .cat-header { background: #f8fafc; font-weight: 600; color: #1e293b; font-size: 13px }
.interpretation-box { background: #fffbeb; border: 1px solid #fcd34d40; border-radius: 8px; padding: 14px; margin-top: 16px; font-size: 12px; color: #92400e; line-height: 1.6 }
.interpretation-box strong { color: #B8904A }
.knowledge-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; margin-bottom: 10px; page-break-inside: avoid }
.knowledge-card h4 { font-size: 14px; color: #1e293b; margin-bottom: 4px }
.knowledge-card .meta { font-size: 11px; color: #64748b }
.knowledge-card .desc { font-size: 12px; color: #475569; margin-top: 6px; line-height: 1.5 }
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600 }
.chat-msg { padding: 12px; border-radius: 8px; margin-bottom: 8px; page-break-inside: avoid }
.chat-msg.user { background: #fffbeb; border: 1px solid #fcd34d40 }
.chat-msg.ai { background: #f0f9ff; border: 1px solid #bae6fd40 }
.chat-msg .role { font-size: 10px; font-weight: 600; text-transform: uppercase; margin-bottom: 4px }
.chat-msg .text { font-size: 12px; color: #334155; white-space: pre-wrap; line-height: 1.6 }
.alert-card { padding: 12px; border-radius: 8px; margin-bottom: 8px; border: 1px solid; page-break-inside: avoid }
`;

export const buildHeader = (strategyContext, exportType) => `
  <div class="stairs-header">
    <span style="font-size: 36px">${strategyContext?.icon || "🎯"}</span>
    <div>
      <div class="stairs-logo">ST.AIRS</div>
      <h1>${strategyContext?.name || "Strategy"}</h1>
      <div style="font-size: 12px; color: #64748b">${strategyContext?.company || ""} ${strategyContext?.company ? "·" : ""} ${exportType} · ${new Date().toLocaleDateString()}</div>
    </div>
  </div>`;

export const buildFooter = () => `
  <div class="stairs-footer">
    <div class="motto">HUMAN IS THE LOOP</div>
    <div class="meta">ST.AIRS — Strategy AI Interactive Real-time System · By DEVONEERS · ${new Date().getFullYear()}</div>
  </div>`;

export const openExportWindow = (title, bodyContent) => {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>ST.AIRS — ${title}</title><style>${EXPORT_STYLES}</style></head><body>${bodyContent}${buildFooter()}</body></html>`);
  w.document.close();
  w.print();
};
