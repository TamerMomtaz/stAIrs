// ═══ SHARED EXPORT UTILITIES ═══
// Standard Stairs export helpers with consistent branding

// The logo is a file in public/, not an inlined data URI. As base64 it was
// 1.9 MB of string parsed on every page load — including for the majority of
// sessions that never export anything — because this module is imported
// eagerly from StairsApp.
//
// Print windows are about:blank documents whose base URL is inherited rather
// than set, so they get an origin-absolute URL instead of a root-relative one.
export const DEVONEERS_LOGO_PATH = "/devoneers-logo.png";
export const logoUrl = () =>
  (typeof window !== "undefined" ? window.location.origin : "") + DEVONEERS_LOGO_PATH;

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
.stairs-logo-img { height: 32px; vertical-align: middle; margin-right: 8px }
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
    <img src="${logoUrl()}" class="stairs-logo-img" alt="DEVONEERS" />
    <div>
      <div class="stairs-logo">Stairs <span style="color:#64748b;font-weight:400;font-size:12px;letter-spacing:1px">&nbsp;|&nbsp; ${strategyContext?.name || "Strategy"} &nbsp;|&nbsp; ${new Date().toLocaleDateString()}</span></div>
      <h1>${strategyContext?.name || "Strategy"}</h1>
      <div style="font-size: 12px; color: #64748b">${strategyContext?.company || ""} ${strategyContext?.company ? "·" : ""} ${exportType} · ${new Date().toLocaleDateString()}</div>
    </div>
  </div>`;

export const buildFooter = () => `
  <div class="stairs-footer">
    <div class="motto">BY DEVONEERS &bull; Stairs &bull; HUMAN IS THE LOOP &bull; ${new Date().getFullYear()}</div>
  </div>`;

// Write a document into an export window and print it once its images have
// settled. The logo used to be an inline data URI, which was decoded before
// print() was reached; as a fetched file it may not have arrived yet, and
// printing early puts a broken image where the letterhead should be.
//
// Every export path goes through here so they all get that wait. If an image
// never resolves the print dialog still opens — a missing logo beats no PDF.
export const printDocument = (w, html) => {
  if (!w) return;
  w.document.write(html);
  w.document.close();
  const images = Array.from(w.document.images || []);
  let pending = images.filter(img => !img.complete).length;
  let printed = false;
  const go = () => {
    if (printed) return;
    printed = true;
    try { w.focus(); w.print(); } catch { /* window closed before we got here */ }
  };
  if (!pending) return go();
  const settle = () => { if (--pending <= 0) go(); };
  images.forEach(img => {
    if (img.complete) return;
    img.addEventListener("load", settle, { once: true });
    img.addEventListener("error", settle, { once: true });
  });
  w.setTimeout(go, 3000);
};

export const openExportWindow = (title, bodyContent) => {
  const w = window.open("", "_blank");
  if (!w) return;
  printDocument(w, `<!DOCTYPE html><html><head><title>Stairs — ${title}</title><style>${EXPORT_STYLES}</style></head><body>${bodyContent}${buildFooter()}</body></html>`);
};
