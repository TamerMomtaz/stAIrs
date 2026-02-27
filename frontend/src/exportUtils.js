// ═══ SHARED EXPORT UTILITIES ═══
// Standard ST.AIRS export helpers with consistent branding

export const DEVONEERS_LOGO_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZAAAAB4CAYAAADc36SXAAAQFklEQVR4nO3defzcRX3H8VcSolxpJAqoKJQWvAA5hEJJg1zqMIKGVq4SxdLyoFVbBupJFRAQIdpmqhUprdhwCZYGUnAYrj5KKNFCLHIWFAxSkEsIZ+SS9I/5BnL8dmd29/v97W72/Xw8fg8eyc53vhN+uzvfmfnMZ0BERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERkHE3odwNkNEVvJwPvBaYDOwC/DWwCrAe8BngOeAq4H7gHWARcCywyLizrQ5NF2orevgUwwI6k9/SGwOuAKcALpPf0s8BDwC+B/wPuAu4E7jAuPDD+re7NwHcg0dszgCMLii4DfsOrv6hngCeAx0i/rHtJv6ybgNvr+hLqoH3dut648Aer3PNbwCcy1x1nXDip15tHbw8ELswUu8a4sHdhfe8CjgIOAqZ20aQHgO8CpxsXHuzi+uXtKP29/adxYY8O6/4RsHObIqv9TntoX7fW9Da8RPqyfgZYQvrs/y/w38BVxoXnu6izVRunA58FPghM6qGqX5LaN9+4MLeOtjVtrX43oEYTSP+etYB1gWnApi3KPha9vRg4x7iwYJzaV6e55DuQWUDPHUhVT072zR693Rg4FTiM3h5cNgG+CPx19PbrwCnGhed6qC9n9+jtB4wLVzR4D6nfWqQHlKmk98zWK7z2dPR2HnC8ceEX3d4bers28FXSA1EdD+NvBvYHNqLgMzUIJva7AX3yeuDPgGujtz+M3u7Z7wZ1wrhwA+mpqp23RW936uU+0dvXk4bk7TwDzMvU8z7gFuDj1DfqXQf4EnBD9PYdNdXZyinR24EfrUuxKaQHmTujt66bCqop2HmAYwhmcpoyqh3IinYBronenhm9Xa/fjenA2QVlSkYP7RwITM6Uuci48GyrF6O3HwMC6amqCdsA10dvd2mofkjz2Qc2WL/0x9rAnOjt33Rx7RnAPjW3Z+ioA3nVEcCC6O2b+t2QQucAL2fKHBy97WWasqfpq+jtH5LWK5qeKp0GxOjtVg3e46Qe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";

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
    <img src="${DEVONEERS_LOGO_URI}" class="stairs-logo-img" alt="DEVONEERS" />
    <div>
      <div class="stairs-logo">ST.AIRS</div>
      <h1>${strategyContext?.name || "Strategy"}</h1>
      <div style="font-size: 12px; color: #64748b">${strategyContext?.company || ""} ${strategyContext?.company ? "·" : ""} ${exportType} · ${new Date().toLocaleDateString()}</div>
    </div>
  </div>`;

export const buildFooter = () => `
  <div class="stairs-footer">
    <div class="motto">BY DEVONEERS &bull; 'HUMAN IS THE LOOP' &bull; ${new Date().getFullYear()}</div>
    <div class="meta">ST.AIRS — Strategy AI Interactive Real-time System</div>
  </div>`;

export const openExportWindow = (title, bodyContent) => {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>ST.AIRS — ${title}</title><style>${EXPORT_STYLES}</style></head><body>${bodyContent}${buildFooter()}</body></html>`);
  w.document.close();
  w.print();
};
