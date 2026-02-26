import { useState, useMemo } from "react";
import { GOLD, GOLD_L, DEEP, BORDER, glass, inputCls, labelCls } from "../constants";
import { Modal } from "./SharedUI";
import { buildHeader, buildFooter, openExportWindow, EXPORT_STYLES } from "../exportUtils";

// ═══ AI RESPONSE PARSER — Extract framework data from AI text ═══
const isSeparatorRow = (line) => {
  const cells = line.split("|").slice(1, -1);
  return cells.length > 0 && cells.every(c => /^[\s\-:]+$/.test(c));
};

const stripMarkers = (s) => s.replace(/\*\*/g, "").replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, "$1").replace(/(?<!\w)_([^_]+)_(?!\w)/g, "$1").replace(/~~/g, "").trim();

const extractTables = (text) => {
  const lines = text.split("\n");
  const tables = [];
  let current = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("|") && t.endsWith("|") && t.length > 2) {
      current.push(t);
    } else {
      if (current.length >= 3) tables.push([...current]);
      current = [];
    }
  }
  if (current.length >= 3) tables.push(current);
  return tables.map(tbl => {
    const rows = tbl
      .filter(l => !isSeparatorRow(l))
      .map(l => l.split("|").slice(1, -1).map(c => stripMarkers(c)));
    if (rows.length < 2) return null;
    return { headers: rows[0].map(h => h.toLowerCase()), data: rows.slice(1) };
  }).filter(Boolean);
};

const splitSections = (text) => {
  const lines = text.split("\n");
  const sections = [];
  let heading = "";
  let content = [];
  for (const line of lines) {
    const hMatch = line.match(/^#{1,6}\s+(.+)/) || line.match(/^\*\*([^*]+)\*\*\s*:?\s*$/);
    if (hMatch) {
      if (heading || content.length) sections.push({ heading, content: content.join("\n") });
      heading = hMatch[1].replace(/[*#]/g, "").trim();
      content = [];
    } else {
      content.push(line);
    }
  }
  if (heading || content.length) sections.push({ heading, content: content.join("\n") });
  return sections;
};

const findCol = (headers, patterns) => {
  const escaped = p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Try each pattern in priority order; for each pattern, find first matching header
  // This ensures "rating" is found before "score" can match "weighted score"
  for (const p of patterns) {
    const wb = new RegExp(`\\b${escaped(p)}s?\\b`, "i");
    const idx = headers.findIndex(h => wb.test(h));
    if (idx >= 0) return idx;
  }
  // Fallback: substring match for broader compatibility
  for (const p of patterns) {
    const idx = headers.findIndex(h => h.includes(p));
    if (idx >= 0) return idx;
  }
  return -1;
};

const parseNum = (s) => {
  if (!s) return NaN;
  const cleaned = s.replace(/[*_~%x×+$#]/g, "").replace(/,(?=\d{3})/g, "").trim();
  return parseFloat(cleaned);
};

const parseFactorTable = (text, sectionPatterns, dataExtractor) => {
  const sections = splitSections(text);
  const results = {};
  for (const section of sections) {
    const h = section.heading.toLowerCase();
    for (const [key, patterns] of Object.entries(sectionPatterns)) {
      if (patterns.some(p => h.includes(p))) {
        const tables = extractTables(section.content);
        for (const table of tables) {
          const extracted = dataExtractor(table, key);
          if (extracted && extracted.length > 0) {
            results[key] = (results[key] || []).concat(extracted);
          }
        }
        // Fallback: also try tables from the full section text including heading
        if (!results[key] || results[key].length === 0) {
          const fullTables = extractTables(section.heading + "\n" + section.content);
          for (const table of fullTables) {
            const extracted = dataExtractor(table, key);
            if (extracted && extracted.length > 0) {
              results[key] = (results[key] || []).concat(extracted);
            }
          }
        }
      }
    }
  }
  return results;
};

const isSummaryRow = (factor) => /^(total|sum|average|subtotal|overall|grand total)\b/i.test(factor.trim());

const parseIFEData = (text) => {
  const sectionPatterns = {
    strengths: ["strength"],
    weaknesses: ["weakness"],
  };
  const extract = (table, key) => {
    const fi = findCol(table.headers, ["factor", "key factor", "internal factor", "critical", "strength", "weakness", "description", "item", "element"]);
    const wi = findCol(table.headers, ["weight"]);
    const ri = findCol(table.headers, ["rating", "rate", "score"]);
    const isStr = key === "strengths";
    if (fi === -1) return null;
    return table.data.map(row => {
      const factor = row[fi >= 0 ? fi : 0]?.trim();
      if (!factor || isSummaryRow(factor)) return null;
      const weight = wi >= 0 ? parseNum(row[wi]) : 0.1;
      const rating = ri >= 0 ? parseInt(row[ri]) : (isStr ? 3 : 2);
      return {
        factor,
        weight: isNaN(weight) ? 0.1 : weight,
        rating: isNaN(rating) ? (isStr ? 3 : 2) : (isStr ? Math.max(3, Math.min(4, rating)) : Math.max(1, Math.min(2, rating))),
      };
    }).filter(Boolean);
  };
  const results = parseFactorTable(text, sectionPatterns, extract);
  // Fallback: try a combined table with type/category column (only when IFE is named in the text)
  if (!results.strengths?.length && !results.weaknesses?.length) {
    if (/\bIFE\b/i.test(text) || /\bInternal\s+Factor\s+Evaluation\b/i.test(text)) {
      const otherSectionPats = ["opportunit", "threat", "financial", "competitive", "environmental", "industry", "rivalr", "entrant", "substitut", "buyer", "supplier"];
      const sections = splitSections(text);
      for (const section of sections) {
        const h = section.heading.toLowerCase();
        if (otherSectionPats.some(p => h.includes(p))) continue;
        const tables = extractTables(section.content);
        for (const table of tables) {
          const fi = findCol(table.headers, ["factor", "key factor", "internal factor", "critical", "strength", "weakness", "description", "item", "element"]);
          const wi = findCol(table.headers, ["weight"]);
          const ri = findCol(table.headers, ["rating", "rate", "score"]);
          if (fi === -1 || wi === -1 || ri === -1) continue;
          for (const row of table.data) {
            const factor = row[fi]?.trim();
            const weight = parseNum(row[wi]);
            const rating = parseInt(row[ri]);
            if (!factor || isSummaryRow(factor) || isNaN(weight) || isNaN(rating)) continue;
            const isStr = rating >= 3;
            (isStr ? (results.strengths = results.strengths || []) : (results.weaknesses = results.weaknesses || [])).push({
              factor, weight, rating: isStr ? Math.max(3, Math.min(4, rating)) : Math.max(1, Math.min(2, rating)),
            });
          }
        }
      }
    }
  }
  if (!results.strengths?.length && !results.weaknesses?.length) return null;
  return {
    strengths: results.strengths?.length ? results.strengths : [{ factor: "", weight: 0.1, rating: 3 }],
    weaknesses: results.weaknesses?.length ? results.weaknesses : [{ factor: "", weight: 0.1, rating: 2 }],
  };
};

const parseEFEData = (text) => {
  const sectionPatterns = {
    opportunities: ["opportunit"],
    threats: ["threat"],
  };
  const extract = (table, key) => {
    const fi = findCol(table.headers, ["factor", "key factor", "external factor", "critical", "opportunit", "threat", "description", "item", "element"]);
    const wi = findCol(table.headers, ["weight"]);
    const ri = findCol(table.headers, ["rating", "rate", "response", "score"]);
    const isOpp = key === "opportunities";
    if (fi === -1) return null;
    return table.data.map(row => {
      const factor = row[fi >= 0 ? fi : 0]?.trim();
      if (!factor || isSummaryRow(factor)) return null;
      const weight = wi >= 0 ? parseNum(row[wi]) : 0.1;
      const rating = ri >= 0 ? parseInt(row[ri]) : (isOpp ? 3 : 2);
      return {
        factor,
        weight: isNaN(weight) ? 0.1 : weight,
        rating: isNaN(rating) ? (isOpp ? 3 : 2) : Math.max(1, Math.min(4, rating)),
      };
    }).filter(Boolean);
  };
  const results = parseFactorTable(text, sectionPatterns, extract);
  if (!results.opportunities?.length && !results.threats?.length) {
    if (/\bEFE\b/i.test(text) || /\bExternal\s+Factor\s+Evaluation\b/i.test(text)) {
      const otherSectionPats = ["strength", "weakness", "financial", "competitive", "environmental", "industry", "rivalr", "entrant", "substitut", "buyer", "supplier"];
      const sections = splitSections(text);
      for (const section of sections) {
        const h = section.heading.toLowerCase();
        if (otherSectionPats.some(p => h.includes(p))) continue;
        const tables = extractTables(section.content);
        for (const table of tables) {
          const fi = findCol(table.headers, ["factor", "key factor", "external factor", "critical", "opportunit", "threat", "description", "item", "element"]);
          const wi = findCol(table.headers, ["weight"]);
          const ri = findCol(table.headers, ["rating", "rate", "score"]);
          if (fi === -1 || wi === -1 || ri === -1) continue;
          for (const row of table.data) {
            const factor = row[fi]?.trim();
            const weight = parseNum(row[wi]);
            const rating = parseInt(row[ri]);
            if (!factor || isSummaryRow(factor) || isNaN(weight) || isNaN(rating)) continue;
            const isOpp = rating >= 3;
            (isOpp ? (results.opportunities = results.opportunities || []) : (results.threats = results.threats || [])).push({
              factor, weight, rating: Math.max(1, Math.min(4, rating)),
            });
          }
        }
      }
    }
  }
  if (!results.opportunities?.length && !results.threats?.length) return null;
  return {
    opportunities: results.opportunities?.length ? results.opportunities : [{ factor: "", weight: 0.1, rating: 3 }],
    threats: results.threats?.length ? results.threats : [{ factor: "", weight: 0.1, rating: 2 }],
  };
};

const SPACE_DIM_MAP = {
  "financial strength": "fs", "financial": "fs", "fs": "fs",
  "competitive advantage": "ca", "competitive": "ca", "ca": "ca",
  "environmental stability": "es", "environmental": "es", "es": "es",
  "industry strength": "is", "industry": "is", "is": "is",
};

const matchSpaceDim = (val) => {
  const v = val.toLowerCase().trim();
  for (const [pattern, key] of Object.entries(SPACE_DIM_MAP)) {
    if (v.includes(pattern)) return key;
  }
  return null;
};

const parseSPACEData = (text) => {
  const sectionPatterns = {
    fs: ["financial strength", "financial", " fs"],
    ca: ["competitive advantage", "competitive", " ca"],
    es: ["environmental stability", "environmental", " es"],
    is: ["industry strength", "industry", " is"],
  };
  const extract = (table, key) => {
    const fi = findCol(table.headers, ["factor", "dimension", "variable", "criterion"]);
    const si = findCol(table.headers, ["score", "rating", "value"]);
    if (fi === -1 && si === -1) return null;
    return table.data.map(row => {
      const factor = row[fi >= 0 ? fi : 0]?.trim();
      if (!factor) return null;
      const score = parseNum(row[si >= 0 ? si : (row.length - 1)]);
      if (isNaN(score)) return null;
      const isNeg = key === "ca" || key === "es";
      return { factor, score: isNeg ? -Math.abs(score) : Math.abs(score) };
    }).filter(Boolean);
  };
  const results = parseFactorTable(text, sectionPatterns, extract);
  let hasData = Object.values(results).some(arr => arr?.length > 0);

  // Fallback: flat table with Dimension | Factor | Score columns
  if (!hasData) {
    const tables = extractTables(text);
    for (const table of tables) {
      const di = findCol(table.headers, ["dimension", "category", "component", "aspect"]);
      const fi = findCol(table.headers, ["factor", "variable", "criterion", "element"]);
      const si = findCol(table.headers, ["score", "rating", "value"]);
      if (di === -1 || si === -1) continue;
      for (const row of table.data) {
        const dimVal = row[di]?.trim();
        if (!dimVal) continue;
        const key = matchSpaceDim(dimVal);
        if (!key) continue;
        const factor = fi >= 0 ? row[fi]?.trim() : dimVal;
        if (!factor) continue;
        const score = parseNum(row[si]);
        if (isNaN(score)) continue;
        const isNeg = key === "ca" || key === "es";
        const clamped = isNeg ? -Math.abs(score) : Math.abs(score);
        (results[key] = results[key] || []).push({ factor, score: clamped });
      }
      hasData = Object.values(results).some(arr => arr?.length > 0);
      if (hasData) break;
    }
  }

  if (!hasData) return null;
  return {
    fs: results.fs?.length ? results.fs : [{ factor: "Factor 1", score: 3 }],
    ca: results.ca?.length ? results.ca : [{ factor: "Factor 1", score: -3 }],
    es: results.es?.length ? results.es : [{ factor: "Factor 1", score: -3 }],
    is: results.is?.length ? results.is : [{ factor: "Factor 1", score: 3 }],
  };
};

const BCG_QUADRANT_DEFAULTS = {
  star: { growth: 15, share: 2.0 },
  "question mark": { growth: 15, share: 0.4 },
  "cash cow": { growth: 5, share: 2.0 },
  dog: { growth: 5, share: 0.4 },
};

const parseBCGData = (text) => {
  const tables = extractTables(text);
  for (const table of tables) {
    const ni = findCol(table.headers, ["name", "unit", "product", "business", "brand", "division", "segment"]);
    const gi = findCol(table.headers, ["growth", "market growth", "growth rate"]);
    const si = findCol(table.headers, ["share", "market share", "relative"]);
    const qi = findCol(table.headers, ["quadrant", "category", "classification"]);
    if (gi === -1 && si === -1 && qi === -1) continue;
    const units = table.data.map(row => {
      const name = row[ni >= 0 ? ni : 0]?.trim();
      if (!name) return null;
      let growth = gi >= 0 ? parseNum(row[gi]) : NaN;
      let share = si >= 0 ? parseNum(row[si]) : NaN;
      // If growth/share missing but quadrant present, infer defaults
      if ((isNaN(growth) || isNaN(share)) && qi >= 0) {
        const qVal = (row[qi] || "").toLowerCase().trim();
        for (const [qName, defaults] of Object.entries(BCG_QUADRANT_DEFAULTS)) {
          if (qVal.includes(qName)) {
            if (isNaN(growth)) growth = defaults.growth;
            if (isNaN(share)) share = defaults.share;
            break;
          }
        }
      }
      if (isNaN(growth) && isNaN(share)) return null;
      return { name, growth: isNaN(growth) ? 10 : growth, share: isNaN(share) ? 1.0 : share };
    }).filter(Boolean);
    if (units.length > 0) return { units };
  }
  return null;
};

const PORTER_FORCE_MAP = {
  rivalry: ["rivalr", "competitive rivalry", "competition among"],
  newEntrants: ["new entrant", "entry", "threat of new", "barrier"],
  substitutes: ["substitut", "threat of substitut", "alternative"],
  buyers: ["buyer", "bargaining power of buyer", "customer power"],
  suppliers: ["supplier", "bargaining power of supplier", "vendor"],
};

const matchPorterForce = (val) => {
  const v = val.toLowerCase().trim();
  for (const [key, patterns] of Object.entries(PORTER_FORCE_MAP)) {
    if (patterns.some(p => v.includes(p))) return key;
  }
  return null;
};

const parsePorterData = (text) => {
  const sections = splitSections(text);
  const results = {};
  for (const section of sections) {
    const h = section.heading.toLowerCase();
    for (const [key, patterns] of Object.entries(PORTER_FORCE_MAP)) {
      if (patterns.some(p => h.includes(p))) {
        const tables = extractTables(section.content);
        for (const table of tables) {
          const fi = findCol(table.headers, ["factor", "variable", "criterion", "element", "driver"]);
          const ri = findCol(table.headers, ["rating", "score", "level", "intensity"]);
          if (fi === -1 && ri === -1) continue;
          const factors = table.data.map(row => {
            const factor = row[fi >= 0 ? fi : 0]?.trim();
            if (!factor) return null;
            const rating = parseInt(row[ri >= 0 ? ri : (row.length - 1)]);
            return { factor, rating: isNaN(rating) ? 3 : Math.max(1, Math.min(5, rating)) };
          }).filter(Boolean);
          if (factors.length > 0) results[key] = factors;
        }
      }
    }
  }
  let hasData = Object.values(results).some(arr => arr?.length > 0);

  // Fallback: flat table with Force | Intensity | Key Factors columns
  if (!hasData) {
    const tables = extractTables(text);
    for (const table of tables) {
      const forceI = findCol(table.headers, ["force", "competitive force", "porter"]);
      const ri = findCol(table.headers, ["intensity", "rating", "score", "level", "power"]);
      const kfi = findCol(table.headers, ["key factor", "factor", "driver", "detail", "description"]);
      if (forceI === -1 || ri === -1) continue;
      for (const row of table.data) {
        const forceVal = row[forceI]?.trim();
        if (!forceVal) continue;
        const key = matchPorterForce(forceVal);
        if (!key) continue;
        const rating = parseInt(row[ri]);
        if (isNaN(rating)) continue;
        const clamped = Math.max(1, Math.min(5, rating));
        const factorText = kfi >= 0 ? (row[kfi]?.trim() || forceVal) : forceVal;
        (results[key] = results[key] || []).push({ factor: factorText, rating: clamped });
      }
      hasData = Object.values(results).some(arr => arr?.length > 0);
      if (hasData) break;
    }
  }

  if (!hasData) return null;
  // Fill in defaults for missing forces
  const defaultFactors = {
    rivalry: [{ factor: "Competition", rating: 3 }],
    newEntrants: [{ factor: "Entry barriers", rating: 3 }],
    substitutes: [{ factor: "Substitutes", rating: 3 }],
    buyers: [{ factor: "Buyer power", rating: 3 }],
    suppliers: [{ factor: "Supplier power", rating: 3 }],
  };
  const final = {};
  for (const key of Object.keys(PORTER_FORCE_MAP)) {
    final[key] = results[key]?.length ? results[key] : defaultFactors[key];
  }
  return final;
};

export const parseFrameworkData = (text, key) => {
  if (!text) return null;
  switch (key) {
    case "ife": return parseIFEData(text);
    case "efe": return parseEFEData(text);
    case "space": return parseSPACEData(text);
    case "bcg": return parseBCGData(text);
    case "porter": return parsePorterData(text);
    default: return null;
  }
};

// ═══ LOAD INTO MATRIX BUTTONS ═══
export const LoadMatrixButtons = ({ text, onLoadMatrix }) => {
  const frameworksWithData = useMemo(() => {
    if (!text) return [];
    const results = [];
    for (const key of Object.keys(MATRIX_FRAMEWORKS)) {
      const data = parseFrameworkData(text, key);
      if (data) results.push({ key, data });
    }
    return results;
  }, [text]);

  if (frameworksWithData.length === 0 || !onLoadMatrix) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
      {frameworksWithData.map(({ key, data }) => {
        const fw = MATRIX_FRAMEWORKS[key];
        return (
          <button
            key={key}
            onClick={() => onLoadMatrix(key, data)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all hover:scale-[1.02] hover:shadow-lg"
            style={{
              borderColor: `${GOLD}50`,
              background: `linear-gradient(135deg, ${GOLD}18, ${GOLD}08)`,
              color: GOLD_L,
            }}
          >
            <span className="text-sm">📊</span> Load into {fw.name} Calculator
          </button>
        );
      })}
    </div>
  );
};

// ═══ FRAMEWORK DEFINITIONS ═══
export const MATRIX_FRAMEWORKS = {
  ife: { key: "ife", name: "IFE Matrix", icon: "🏗️", description: "Internal Factor Evaluation" },
  efe: { key: "efe", name: "EFE Matrix", icon: "🌍", description: "External Factor Evaluation" },
  space: { key: "space", name: "SPACE Matrix", icon: "📐", description: "Strategic Position & Action Evaluation" },
  bcg: { key: "bcg", name: "BCG Matrix", icon: "📊", description: "Boston Consulting Group Growth-Share" },
  porter: { key: "porter", name: "Porter's Five Forces", icon: "⚔️", description: "Industry Competitive Analysis" },
};

// Pattern to detect framework names in text
export const FRAMEWORK_PATTERNS = [
  { regex: /\bIFE\s+Matrix\b/gi, key: "ife" },
  { regex: /\bInternal\s+Factor\s+Evaluation\b/gi, key: "ife" },
  { regex: /\bEFE\s+Matrix\b/gi, key: "efe" },
  { regex: /\bExternal\s+Factor\s+Evaluation\b/gi, key: "efe" },
  { regex: /\bSPACE\s+Matrix\b/gi, key: "space" },
  { regex: /\bStrategic\s+Position\s+and\s+Action\s+Evaluation\b/gi, key: "space" },
  { regex: /\bBCG\s+Matrix\b/gi, key: "bcg" },
  { regex: /\bBoston\s+Consulting\s+Group\s+Matrix\b/gi, key: "bcg" },
  { regex: /\bGrowth[\s-]+Share\s+Matrix\b/gi, key: "bcg" },
  { regex: /\bPorter'?s?\s+Five\s+Forces\b/gi, key: "porter" },
  { regex: /\bFive\s+Forces\s+(?:Analysis|Model|Framework)\b/gi, key: "porter" },
];

// Detect which frameworks are mentioned in a text string
export const detectFrameworks = (text) => {
  if (!text) return [];
  const found = new Set();
  for (const { regex, key } of FRAMEWORK_PATTERNS) {
    regex.lastIndex = 0;
    if (regex.test(text)) found.add(key);
  }
  return [...found];
};

// ═══ SMALL SHARED HELPERS ═══
const SectionTitle = ({ children }) => (
  <h3 className="text-amber-200 font-semibold text-sm mt-4 mb-2 uppercase tracking-wider">{children}</h3>
);

const AddRowBtn = ({ onClick, label }) => (
  <button onClick={onClick} className="text-xs px-3 py-1.5 rounded-lg border border-amber-500/20 text-amber-400/70 hover:bg-amber-500/10 transition mt-2">+ {label}</button>
);

const RemoveBtn = ({ onClick }) => (
  <button onClick={onClick} className="text-red-400/60 hover:text-red-400 text-xs transition shrink-0 px-1" title="Remove">✕</button>
);

const SaveBtn = ({ onClick }) => {
  const [saved, setSaved] = useState(false);
  const handleClick = () => { onClick(); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  return (
    <button onClick={handleClick}
      className="w-full mt-4 px-4 py-2.5 rounded-lg text-xs font-medium transition-all hover:scale-[1.01]"
      style={{ background: saved ? "rgba(52,211,153,0.15)" : `linear-gradient(135deg, ${GOLD}25, ${GOLD}12)`, border: `1px solid ${saved ? "rgba(52,211,153,0.4)" : `${GOLD}40`}`, color: saved ? "#34d399" : GOLD_L }}>
      {saved ? "✓ Saved to Strategy!" : "💾 Save Results to Strategy"}
    </button>
  );
};

const ExportBtn = ({ onClick }) => (
  <button onClick={onClick}
    className="w-full mt-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all hover:scale-[1.01]"
    style={{ background: `linear-gradient(135deg, ${GOLD}15, ${GOLD}08)`, border: `1px solid ${BORDER}`, color: "#94a3b8" }}>
    ↓ Export PDF
  </button>
);

const ScoreDisplay = ({ label, value, max, interpretation, color }) => (
  <div className="p-4 rounded-xl text-center" style={glass(0.5)}>
    <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">{label}</div>
    <div className="text-3xl font-bold" style={{ color: color || GOLD }}>{value}</div>
    {max && <div className="text-gray-600 text-[10px]">out of {max}</div>}
    {interpretation && <div className="text-sm mt-2" style={{ color: color || GOLD }}>{interpretation}</div>}
  </div>
);

const weightInputCls = "w-20 px-2 py-1.5 rounded-lg bg-[#0a1628]/80 border border-[#1e3a5f] text-white text-center text-xs focus:border-amber-500/40 focus:outline-none transition";
const narrowInputCls = "w-16 px-2 py-1.5 rounded-lg bg-[#0a1628]/80 border border-[#1e3a5f] text-white text-center text-xs focus:border-amber-500/40 focus:outline-none transition";

// ═══ IFE MATRIX ═══
const IFEMatrix = ({ onSave, strategyContext, initialData }) => {
  const [strengths, setStrengths] = useState(
    initialData?.strengths?.length ? initialData.strengths : [{ factor: "", weight: 0.1, rating: 3 }]
  );
  const [weaknesses, setWeaknesses] = useState(
    initialData?.weaknesses?.length ? initialData.weaknesses : [{ factor: "", weight: 0.1, rating: 2 }]
  );

  const updateRow = (list, setList, idx, field, val) => {
    setList(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };
  const addRow = (setList, defaults) => setList(prev => [...prev, defaults]);
  const removeRow = (list, setList, idx) => { if (list.length > 1) setList(prev => prev.filter((_, i) => i !== idx)); };

  const allFactors = [...strengths, ...weaknesses];
  const totalWeight = allFactors.reduce((s, f) => s + (parseFloat(f.weight) || 0), 0);
  const totalScore = allFactors.reduce((s, f) => s + (parseFloat(f.weight) || 0) * (parseInt(f.rating) || 0), 0);
  const weightWarning = Math.abs(totalWeight - 1.0) > 0.01;

  const interpretation = totalScore >= 3.0 ? "Major Strength" : totalScore >= 2.5 ? "Above Average" : totalScore >= 2.0 ? "Below Average" : "Major Weakness";
  const scoreColor = totalScore >= 3.0 ? "#34d399" : totalScore >= 2.5 ? "#fbbf24" : totalScore >= 2.0 ? "#fb923c" : "#f87171";

  const FactorTable = ({ title, items, setItems, isStrength }) => (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_80px_80px_80px_24px] gap-2 text-[10px] text-gray-500 uppercase tracking-wider px-1">
          <span>Factor</span><span className="text-center">Weight</span><span className="text-center">Rating</span><span className="text-center">Score</span><span/>
        </div>
        {items.map((r, i) => {
          const score = (parseFloat(r.weight) || 0) * (parseInt(r.rating) || 0);
          return (
            <div key={i} className="grid grid-cols-[1fr_80px_80px_80px_24px] gap-2 items-center">
              <input value={r.factor} onChange={e => updateRow(items, setItems, i, "factor", e.target.value)} placeholder={isStrength ? "e.g., Strong brand" : "e.g., Limited R&D"} className={inputCls + " !py-1.5 !text-xs"} />
              <input type="number" step="0.01" min="0" max="1" value={r.weight} onChange={e => updateRow(items, setItems, i, "weight", e.target.value)} className={weightInputCls} />
              <select value={r.rating} onChange={e => updateRow(items, setItems, i, "rating", e.target.value)} className={weightInputCls + " appearance-none"}>
                {isStrength
                  ? <>{[4,3].map(v => <option key={v} value={v}>{v} — {v===4?"Major Strength":"Minor Strength"}</option>)}</>
                  : <>{[2,1].map(v => <option key={v} value={v}>{v} — {v===2?"Minor Weakness":"Major Weakness"}</option>)}</>}
              </select>
              <div className="text-center text-xs font-mono text-amber-300">{score.toFixed(2)}</div>
              <RemoveBtn onClick={() => removeRow(items, setItems, i)} />
            </div>
          );
        })}
      </div>
      <AddRowBtn onClick={() => addRow(setItems, { factor: "", weight: 0.1, rating: isStrength ? 3 : 2 })} label={isStrength ? "Add Strength" : "Add Weakness"} />
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-gray-400 text-xs leading-relaxed">The IFE Matrix evaluates internal strengths and weaknesses. Assign weights (must total 1.0) and ratings (1-4) to each factor. Strengths are rated 3-4, weaknesses 1-2.</p>
      <FactorTable title="Strengths" items={strengths} setItems={setStrengths} isStrength={true} />
      <FactorTable title="Weaknesses" items={weaknesses} setItems={setWeaknesses} isStrength={false} />

      <div className="border-t pt-4 mt-4" style={{ borderColor: BORDER }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-400 text-xs">Total Weight: <span className={weightWarning ? "text-red-400 font-semibold" : "text-emerald-400 font-semibold"}>{totalWeight.toFixed(2)}</span></span>
          {weightWarning && <span className="text-red-400 text-[10px]">Weights should total 1.00</span>}
        </div>
        <ScoreDisplay label="Total Weighted Score" value={totalScore.toFixed(2)} max="4.00" interpretation={interpretation} color={scoreColor} />
        <div className="mt-3 p-3 rounded-lg text-xs text-gray-400 leading-relaxed" style={glass(0.3)}>
          <strong className="text-amber-200">Interpretation:</strong> Scores above 2.5 indicate a strong internal position. Scores below 2.5 suggest internal weaknesses that need attention. The maximum possible score is 4.0 (all major strengths) and the minimum is 1.0 (all major weaknesses).
        </div>
        {onSave && <SaveBtn onClick={() => onSave("ife", { summary: `${interpretation} (${totalScore.toFixed(2)}/4.00)` })} />}
        <ExportBtn onClick={() => {
          const buildRows = (items, cat) => items.map(r => {
            const s = (parseFloat(r.weight) || 0) * (parseInt(r.rating) || 0);
            return `<tr><td class="factor-table cat-header" colspan="4" style="display:none"></td></tr><tr style="border-bottom:1px solid #e5e7eb"><td style="padding:8px;font-size:12px;color:#334155">${r.factor || "—"}</td><td style="padding:8px;text-align:center;font-size:12px">${parseFloat(r.weight).toFixed(2)}</td><td style="padding:8px;text-align:center;font-size:12px">${r.rating}</td><td style="padding:8px;text-align:center;font-size:12px;font-weight:600">${s.toFixed(2)}</td></tr>`;
          }).join("");
          const body = `${buildHeader(strategyContext, "IFE Matrix Export")}
            <div class="section">🏗️ IFE Matrix — Internal Factor Evaluation</div>
            <p style="font-size:12px;color:#64748b;margin-bottom:16px">Evaluates internal strengths and weaknesses with weighted scoring (1-4 scale).</p>
            <h4 style="color:#059669;font-size:13px;font-weight:600;margin:16px 0 8px">Strengths</h4>
            <table class="factor-table"><thead><tr><th>Factor</th><th style="text-align:center;width:80px">Weight</th><th style="text-align:center;width:80px">Rating</th><th style="text-align:center;width:80px">Score</th></tr></thead><tbody>${buildRows(strengths, "strength")}</tbody></table>
            <h4 style="color:#dc2626;font-size:13px;font-weight:600;margin:16px 0 8px">Weaknesses</h4>
            <table class="factor-table"><thead><tr><th>Factor</th><th style="text-align:center;width:80px">Weight</th><th style="text-align:center;width:80px">Rating</th><th style="text-align:center;width:80px">Score</th></tr></thead><tbody>${buildRows(weaknesses, "weakness")}</tbody></table>
            <div style="margin-top:16px;display:flex;gap:12px;align-items:center"><span style="font-size:12px;color:#64748b">Total Weight: <strong style="color:${weightWarning ? "#dc2626" : "#059669"}">${totalWeight.toFixed(2)}</strong></span></div>
            <div class="score-card"><div class="score-label">Total Weighted Score</div><div class="score-value" style="color:${scoreColor}">${totalScore.toFixed(2)}</div><div style="font-size:10px;color:#64748b">out of 4.00</div><div class="score-interp" style="color:${scoreColor}">${interpretation}</div></div>
            <div class="interpretation-box"><strong>Interpretation:</strong> Scores above 2.5 indicate a strong internal position. Scores below 2.5 suggest internal weaknesses that need attention. The maximum possible score is 4.0 (all major strengths) and the minimum is 1.0 (all major weaknesses).</div>`;
          openExportWindow("IFE Matrix", body);
        }} />
      </div>
    </div>
  );
};

// ═══ EFE MATRIX ═══
const EFEMatrix = ({ onSave, strategyContext, initialData }) => {
  const [opportunities, setOpportunities] = useState(
    initialData?.opportunities?.length ? initialData.opportunities : [{ factor: "", weight: 0.1, rating: 3 }]
  );
  const [threats, setThreats] = useState(
    initialData?.threats?.length ? initialData.threats : [{ factor: "", weight: 0.1, rating: 2 }]
  );

  const updateRow = (list, setList, idx, field, val) => {
    setList(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };
  const addRow = (setList, defaults) => setList(prev => [...prev, defaults]);
  const removeRow = (list, setList, idx) => { if (list.length > 1) setList(prev => prev.filter((_, i) => i !== idx)); };

  const allFactors = [...opportunities, ...threats];
  const totalWeight = allFactors.reduce((s, f) => s + (parseFloat(f.weight) || 0), 0);
  const totalScore = allFactors.reduce((s, f) => s + (parseFloat(f.weight) || 0) * (parseInt(f.rating) || 0), 0);
  const weightWarning = Math.abs(totalWeight - 1.0) > 0.01;

  const interpretation = totalScore >= 3.0 ? "Superior Response" : totalScore >= 2.5 ? "Above Average" : totalScore >= 2.0 ? "Below Average" : "Poor Response";
  const scoreColor = totalScore >= 3.0 ? "#34d399" : totalScore >= 2.5 ? "#fbbf24" : totalScore >= 2.0 ? "#fb923c" : "#f87171";

  const FactorTable = ({ title, items, setItems, isOpportunity }) => (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_80px_80px_80px_24px] gap-2 text-[10px] text-gray-500 uppercase tracking-wider px-1">
          <span>Factor</span><span className="text-center">Weight</span><span className="text-center">Rating</span><span className="text-center">Score</span><span/>
        </div>
        {items.map((r, i) => {
          const score = (parseFloat(r.weight) || 0) * (parseInt(r.rating) || 0);
          return (
            <div key={i} className="grid grid-cols-[1fr_80px_80px_80px_24px] gap-2 items-center">
              <input value={r.factor} onChange={e => updateRow(items, setItems, i, "factor", e.target.value)} placeholder={isOpportunity ? "e.g., Market expansion" : "e.g., New competitor"} className={inputCls + " !py-1.5 !text-xs"} />
              <input type="number" step="0.01" min="0" max="1" value={r.weight} onChange={e => updateRow(items, setItems, i, "weight", e.target.value)} className={weightInputCls} />
              <select value={r.rating} onChange={e => updateRow(items, setItems, i, "rating", e.target.value)} className={weightInputCls + " appearance-none"}>
                <option value={4}>4 — Superior</option>
                <option value={3}>3 — Above Avg</option>
                <option value={2}>2 — Average</option>
                <option value={1}>1 — Poor</option>
              </select>
              <div className="text-center text-xs font-mono text-amber-300">{score.toFixed(2)}</div>
              <RemoveBtn onClick={() => removeRow(items, setItems, i)} />
            </div>
          );
        })}
      </div>
      <AddRowBtn onClick={() => addRow(setItems, { factor: "", weight: 0.1, rating: isOpportunity ? 3 : 2 })} label={isOpportunity ? "Add Opportunity" : "Add Threat"} />
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-gray-400 text-xs leading-relaxed">The EFE Matrix evaluates how well a firm responds to external opportunities and threats. Assign weights (must total 1.0) and rate the firm's response (1=poor to 4=superior).</p>
      <FactorTable title="Opportunities" items={opportunities} setItems={setOpportunities} isOpportunity={true} />
      <FactorTable title="Threats" items={threats} setItems={setThreats} isOpportunity={false} />

      <div className="border-t pt-4 mt-4" style={{ borderColor: BORDER }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-400 text-xs">Total Weight: <span className={weightWarning ? "text-red-400 font-semibold" : "text-emerald-400 font-semibold"}>{totalWeight.toFixed(2)}</span></span>
          {weightWarning && <span className="text-red-400 text-[10px]">Weights should total 1.00</span>}
        </div>
        <ScoreDisplay label="Total Weighted Score" value={totalScore.toFixed(2)} max="4.00" interpretation={interpretation} color={scoreColor} />
        <div className="mt-3 p-3 rounded-lg text-xs text-gray-400 leading-relaxed" style={glass(0.3)}>
          <strong className="text-amber-200">Interpretation:</strong> A total weighted score of 4.0 means the organization responds outstandingly to external factors. A score of 2.5 is average. Scores below 2.5 indicate the firm is not capitalizing on opportunities or avoiding threats effectively.
        </div>
        {onSave && <SaveBtn onClick={() => onSave("efe", { summary: `${interpretation} (${totalScore.toFixed(2)}/4.00)` })} />}
        <ExportBtn onClick={() => {
          const buildRows = (items) => items.map(r => {
            const s = (parseFloat(r.weight) || 0) * (parseInt(r.rating) || 0);
            return `<tr style="border-bottom:1px solid #e5e7eb"><td style="padding:8px;font-size:12px;color:#334155">${r.factor || "—"}</td><td style="padding:8px;text-align:center;font-size:12px">${parseFloat(r.weight).toFixed(2)}</td><td style="padding:8px;text-align:center;font-size:12px">${r.rating}</td><td style="padding:8px;text-align:center;font-size:12px;font-weight:600">${s.toFixed(2)}</td></tr>`;
          }).join("");
          const body = `${buildHeader(strategyContext, "EFE Matrix Export")}
            <div class="section">🌍 EFE Matrix — External Factor Evaluation</div>
            <p style="font-size:12px;color:#64748b;margin-bottom:16px">Evaluates how well the firm responds to external opportunities and threats (1=poor to 4=superior).</p>
            <h4 style="color:#059669;font-size:13px;font-weight:600;margin:16px 0 8px">Opportunities</h4>
            <table class="factor-table"><thead><tr><th>Factor</th><th style="text-align:center;width:80px">Weight</th><th style="text-align:center;width:80px">Rating</th><th style="text-align:center;width:80px">Score</th></tr></thead><tbody>${buildRows(opportunities)}</tbody></table>
            <h4 style="color:#dc2626;font-size:13px;font-weight:600;margin:16px 0 8px">Threats</h4>
            <table class="factor-table"><thead><tr><th>Factor</th><th style="text-align:center;width:80px">Weight</th><th style="text-align:center;width:80px">Rating</th><th style="text-align:center;width:80px">Score</th></tr></thead><tbody>${buildRows(threats)}</tbody></table>
            <div style="margin-top:16px;display:flex;gap:12px;align-items:center"><span style="font-size:12px;color:#64748b">Total Weight: <strong style="color:${weightWarning ? "#dc2626" : "#059669"}">${totalWeight.toFixed(2)}</strong></span></div>
            <div class="score-card"><div class="score-label">Total Weighted Score</div><div class="score-value" style="color:${scoreColor}">${totalScore.toFixed(2)}</div><div style="font-size:10px;color:#64748b">out of 4.00</div><div class="score-interp" style="color:${scoreColor}">${interpretation}</div></div>
            <div class="interpretation-box"><strong>Interpretation:</strong> A total weighted score of 4.0 means the organization responds outstandingly to external factors. A score of 2.5 is average. Scores below 2.5 indicate the firm is not capitalizing on opportunities or avoiding threats effectively.</div>`;
          openExportWindow("EFE Matrix", body);
        }} />
      </div>
    </div>
  );
};

// ═══ SPACE MATRIX ═══
const SPACEMatrix = ({ onSave, strategyContext, initialData }) => {
  const [fs, setFs] = useState(initialData?.fs?.length ? initialData.fs : [{ factor: "Return on Investment", score: 4 }, { factor: "Leverage", score: 3 }]);
  const [ca, setCa] = useState(initialData?.ca?.length ? initialData.ca : [{ factor: "Market Share", score: -3 }, { factor: "Product Quality", score: -2 }]);
  const [es, setEs] = useState(initialData?.es?.length ? initialData.es : [{ factor: "Technological Changes", score: -3 }, { factor: "Inflation Rate", score: -4 }]);
  const [is_, setIs] = useState(initialData?.is?.length ? initialData.is : [{ factor: "Growth Potential", score: 4 }, { factor: "Profit Potential", score: 5 }]);

  const updateDim = (list, setList, idx, field, val) => {
    setList(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };
  const addDim = (setList, defaults) => setList(prev => [...prev, defaults]);
  const removeDim = (list, setList, idx) => { if (list.length > 1) setList(prev => prev.filter((_, i) => i !== idx)); };

  const avg = (arr) => arr.length ? arr.reduce((s, f) => s + (parseFloat(f.score) || 0), 0) / arr.length : 0;
  const fsAvg = avg(fs);
  const caAvg = avg(ca);
  const esAvg = avg(es);
  const isAvg = avg(is_);

  const xAxis = caAvg + isAvg;
  const yAxis = fsAvg + esAvg;

  const quadrant = xAxis >= 0 && yAxis >= 0 ? "Aggressive" : xAxis < 0 && yAxis >= 0 ? "Conservative" : xAxis < 0 && yAxis < 0 ? "Defensive" : "Competitive";
  const quadrantColor = { Aggressive: "#34d399", Conservative: "#60a5fa", Defensive: "#f87171", Competitive: "#fbbf24" }[quadrant];
  const quadrantDesc = {
    Aggressive: "The firm is in an excellent position to use internal strengths to take advantage of opportunities, overcome weaknesses, and avoid threats.",
    Conservative: "The firm should stay close to basic competencies and avoid excessive risk. Focus on market penetration and product development.",
    Defensive: "The firm should focus on rectifying internal weaknesses and avoiding external threats. Consider retrenchment or divestiture.",
    Competitive: "The firm operates in an attractive industry but with competitive disadvantage. Consider backward/forward integration and market penetration."
  }[quadrant];

  const DimensionInputs = ({ title, items, setItems, min, max, color }) => (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-3 h-3 rounded-full" style={{ background: color }} />
        <span className="text-xs font-semibold text-white">{title}</span>
        <span className="text-[10px] text-gray-500">({min} to {max})</span>
        <span className="text-xs font-mono ml-auto" style={{ color }}>Avg: {avg(items).toFixed(1)}</span>
      </div>
      {items.map((r, i) => (
        <div key={i} className="flex gap-2 items-center mb-1.5">
          <input value={r.factor} onChange={e => updateDim(items, setItems, i, "factor", e.target.value)} className={inputCls + " !py-1.5 !text-xs flex-1"} placeholder="Factor name" />
          <input type="number" min={min} max={max} value={r.score} onChange={e => updateDim(items, setItems, i, "score", e.target.value)} className={narrowInputCls} />
          <RemoveBtn onClick={() => removeDim(items, setItems, i)} />
        </div>
      ))}
      <AddRowBtn onClick={() => addDim(setItems, { factor: "", score: min > 0 ? 3 : -3 })} label="Add Factor" />
    </div>
  );

  // SVG plot
  const plotSize = 240;
  const mid = plotSize / 2;
  const scale = 20;
  const px = mid + xAxis * scale;
  const py = mid - yAxis * scale;

  return (
    <div className="space-y-4">
      <p className="text-gray-400 text-xs leading-relaxed">The SPACE Matrix determines the appropriate strategic posture. Rate factors across four dimensions: Financial Strength (+1 to +6), Competitive Advantage (-1 to -6), Environmental Stability (-1 to -6), and Industry Strength (+1 to +6).</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DimensionInputs title="Financial Strength (FS)" items={fs} setItems={setFs} min={1} max={6} color="#34d399" />
        <DimensionInputs title="Industry Strength (IS)" items={is_} setItems={setIs} min={1} max={6} color="#60a5fa" />
        <DimensionInputs title="Competitive Advantage (CA)" items={ca} setItems={setCa} min={-6} max={-1} color="#fbbf24" />
        <DimensionInputs title="Environmental Stability (ES)" items={es} setItems={setEs} min={-6} max={-1} color="#f87171" />
      </div>

      <div className="border-t pt-4 mt-4" style={{ borderColor: BORDER }}>
        <SectionTitle>Results</SectionTitle>
        <div className="flex flex-col md:flex-row gap-6 items-center">
          {/* SPACE Plot */}
          <div className="shrink-0">
            <svg width={plotSize} height={plotSize} className="rounded-xl" style={{ background: "rgba(10,22,40,0.8)" }}>
              {/* Grid */}
              <line x1={mid} y1={0} x2={mid} y2={plotSize} stroke="#1e3a5f" strokeWidth={1} />
              <line x1={0} y1={mid} x2={plotSize} y2={mid} stroke="#1e3a5f" strokeWidth={1} />
              {/* Labels */}
              <text x={plotSize - 4} y={mid - 6} fill="#60a5fa" fontSize={9} textAnchor="end">IS +</text>
              <text x={4} y={mid - 6} fill="#fbbf24" fontSize={9}>CA -</text>
              <text x={mid + 4} y={12} fill="#34d399" fontSize={9}>FS +</text>
              <text x={mid + 4} y={plotSize - 4} fill="#f87171" fontSize={9}>ES -</text>
              {/* Quadrant labels */}
              <text x={plotSize * 0.75} y={plotSize * 0.25} fill="#34d39940" fontSize={10} textAnchor="middle">Aggressive</text>
              <text x={plotSize * 0.25} y={plotSize * 0.25} fill="#60a5fa40" fontSize={10} textAnchor="middle">Conservative</text>
              <text x={plotSize * 0.25} y={plotSize * 0.75} fill="#f8717140" fontSize={10} textAnchor="middle">Defensive</text>
              <text x={plotSize * 0.75} y={plotSize * 0.75} fill="#fbbf2440" fontSize={10} textAnchor="middle">Competitive</text>
              {/* Vector */}
              <line x1={mid} y1={mid} x2={Math.max(4, Math.min(plotSize - 4, px))} y2={Math.max(4, Math.min(plotSize - 4, py))} stroke={quadrantColor} strokeWidth={2.5} markerEnd="url(#arrow)" />
              <defs><marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d={`M0,0 L8,3 L0,6 Z`} fill={quadrantColor} /></marker></defs>
              <circle cx={Math.max(4, Math.min(plotSize - 4, px))} cy={Math.max(4, Math.min(plotSize - 4, py))} r={5} fill={quadrantColor} />
            </svg>
          </div>
          <div className="flex-1 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-lg" style={glass(0.3)}><span className="text-gray-500">X-Axis (CA + IS):</span> <span className="text-white font-mono">{xAxis.toFixed(1)}</span></div>
              <div className="p-2 rounded-lg" style={glass(0.3)}><span className="text-gray-500">Y-Axis (FS + ES):</span> <span className="text-white font-mono">{yAxis.toFixed(1)}</span></div>
            </div>
            <ScoreDisplay label="Strategic Posture" value={quadrant} color={quadrantColor} />
            <div className="p-3 rounded-lg text-xs text-gray-400 leading-relaxed" style={glass(0.3)}>
              <strong className="text-amber-200">Recommendation:</strong> {quadrantDesc}
            </div>
          </div>
        </div>
        {onSave && <SaveBtn onClick={() => onSave("space", { summary: `${quadrant} posture` })} />}
        <ExportBtn onClick={() => {
          const buildDimRows = (items, label, color) => items.map(r => `<tr style="border-bottom:1px solid #e5e7eb"><td style="padding:8px;font-size:12px;color:#334155">${r.factor || "—"}</td><td style="padding:8px;text-align:center;font-size:12px;font-weight:600;color:${color}">${parseFloat(r.score).toFixed(1)}</td></tr>`).join("");
          const body = `${buildHeader(strategyContext, "SPACE Matrix Export")}
            <div class="section">📐 SPACE Matrix — Strategic Position &amp; Action Evaluation</div>
            <p style="font-size:12px;color:#64748b;margin-bottom:16px">Determines the appropriate strategic posture across four dimensions.</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
              <div><h4 style="color:#34d399;font-size:13px;font-weight:600;margin-bottom:8px">Financial Strength (FS) — Avg: ${fsAvg.toFixed(1)}</h4><table class="factor-table"><thead><tr><th>Factor</th><th style="text-align:center;width:80px">Score</th></tr></thead><tbody>${buildDimRows(fs, "FS", "#34d399")}</tbody></table></div>
              <div><h4 style="color:#60a5fa;font-size:13px;font-weight:600;margin-bottom:8px">Industry Strength (IS) — Avg: ${isAvg.toFixed(1)}</h4><table class="factor-table"><thead><tr><th>Factor</th><th style="text-align:center;width:80px">Score</th></tr></thead><tbody>${buildDimRows(is_, "IS", "#60a5fa")}</tbody></table></div>
              <div><h4 style="color:#fbbf24;font-size:13px;font-weight:600;margin-bottom:8px">Competitive Advantage (CA) — Avg: ${caAvg.toFixed(1)}</h4><table class="factor-table"><thead><tr><th>Factor</th><th style="text-align:center;width:80px">Score</th></tr></thead><tbody>${buildDimRows(ca, "CA", "#fbbf24")}</tbody></table></div>
              <div><h4 style="color:#f87171;font-size:13px;font-weight:600;margin-bottom:8px">Environmental Stability (ES) — Avg: ${esAvg.toFixed(1)}</h4><table class="factor-table"><thead><tr><th>Factor</th><th style="text-align:center;width:80px">Score</th></tr></thead><tbody>${buildDimRows(es, "ES", "#f87171")}</tbody></table></div>
            </div>
            <div style="display:flex;gap:12px;margin-bottom:16px"><div class="stat-box"><div class="lbl">X-Axis (CA + IS)</div><div class="num" style="color:#60a5fa">${xAxis.toFixed(1)}</div></div><div class="stat-box"><div class="lbl">Y-Axis (FS + ES)</div><div class="num" style="color:#34d399">${yAxis.toFixed(1)}</div></div></div>
            <div class="score-card"><div class="score-label">Strategic Posture</div><div class="score-value" style="color:${quadrantColor}">${quadrant}</div></div>
            <div class="interpretation-box"><strong>Recommendation:</strong> ${quadrantDesc}</div>`;
          openExportWindow("SPACE Matrix", body);
        }} />
      </div>
    </div>
  );
};

// ═══ BCG MATRIX ═══
const BCGMatrix = ({ onSave, strategyContext, initialData }) => {
  const [units, setUnits] = useState(
    initialData?.units?.length ? initialData.units : [
      { name: "Product A", growth: 15, share: 2.0 },
      { name: "Product B", growth: 5, share: 0.4 },
    ]
  );

  const updateUnit = (idx, field, val) => {
    setUnits(prev => prev.map((u, i) => i === idx ? { ...u, [field]: val } : u));
  };
  const addUnit = () => setUnits(prev => [...prev, { name: "", growth: 10, share: 1.0 }]);
  const removeUnit = (idx) => { if (units.length > 1) setUnits(prev => prev.filter((_, i) => i !== idx)); };

  const classify = (u) => {
    const highGrowth = parseFloat(u.growth) >= 10;
    const highShare = parseFloat(u.share) >= 1.0;
    if (highGrowth && highShare) return { label: "Star", icon: "⭐", color: "#fbbf24", desc: "High growth, high share — invest to maintain leadership" };
    if (highGrowth && !highShare) return { label: "Question Mark", icon: "❓", color: "#60a5fa", desc: "High growth, low share — decide to invest or divest" };
    if (!highGrowth && highShare) return { label: "Cash Cow", icon: "🐄", color: "#34d399", desc: "Low growth, high share — harvest profits" };
    return { label: "Dog", icon: "🐕", color: "#f87171", desc: "Low growth, low share — consider divestiture" };
  };

  const plotSize = 260;
  const pad = 30;
  const inner = plotSize - pad * 2;

  return (
    <div className="space-y-4">
      <p className="text-gray-400 text-xs leading-relaxed">The BCG Growth-Share Matrix classifies business units by market growth rate (%) and relative market share. Units with growth &ge;10% are "high growth"; share &ge;1.0 (equal to largest competitor) is "high share".</p>

      <SectionTitle>Business Units / Products</SectionTitle>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_100px_100px_120px_24px] gap-2 text-[10px] text-gray-500 uppercase tracking-wider px-1">
          <span>Name</span><span className="text-center">Growth %</span><span className="text-center">Rel. Share</span><span className="text-center">Category</span><span/>
        </div>
        {units.map((u, i) => {
          const cat = classify(u);
          return (
            <div key={i} className="grid grid-cols-[1fr_100px_100px_120px_24px] gap-2 items-center">
              <input value={u.name} onChange={e => updateUnit(i, "name", e.target.value)} className={inputCls + " !py-1.5 !text-xs"} placeholder="Business unit name" />
              <input type="number" step="0.1" value={u.growth} onChange={e => updateUnit(i, "growth", e.target.value)} className={weightInputCls + " !w-full"} />
              <input type="number" step="0.1" min="0" value={u.share} onChange={e => updateUnit(i, "share", e.target.value)} className={weightInputCls + " !w-full"} />
              <div className="flex items-center gap-1 text-xs" style={{ color: cat.color }}>{cat.icon} {cat.label}</div>
              <RemoveBtn onClick={() => removeUnit(i)} />
            </div>
          );
        })}
      </div>
      <AddRowBtn onClick={addUnit} label="Add Unit" />

      <div className="border-t pt-4 mt-4" style={{ borderColor: BORDER }}>
        <SectionTitle>Matrix Visualization</SectionTitle>
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="shrink-0">
            <svg width={plotSize} height={plotSize} className="rounded-xl" style={{ background: "rgba(10,22,40,0.8)" }}>
              {/* Quadrant backgrounds */}
              <rect x={pad} y={pad} width={inner / 2} height={inner / 2} fill="#fbbf2408" />
              <rect x={pad + inner / 2} y={pad} width={inner / 2} height={inner / 2} fill="#60a5fa08" />
              <rect x={pad} y={pad + inner / 2} width={inner / 2} height={inner / 2} fill="#34d39908" />
              <rect x={pad + inner / 2} y={pad + inner / 2} width={inner / 2} height={inner / 2} fill="#f8717108" />
              {/* Grid lines */}
              <line x1={pad} y1={pad + inner / 2} x2={pad + inner} y2={pad + inner / 2} stroke="#1e3a5f" strokeWidth={1} strokeDasharray="4,4" />
              <line x1={pad + inner / 2} y1={pad} x2={pad + inner / 2} y2={pad + inner} stroke="#1e3a5f" strokeWidth={1} strokeDasharray="4,4" />
              {/* Border */}
              <rect x={pad} y={pad} width={inner} height={inner} fill="none" stroke="#1e3a5f" strokeWidth={1} />
              {/* Quadrant labels */}
              <text x={pad + inner * 0.25} y={pad + inner * 0.15} fill="#fbbf2460" fontSize={10} textAnchor="middle">Stars</text>
              <text x={pad + inner * 0.75} y={pad + inner * 0.15} fill="#60a5fa60" fontSize={10} textAnchor="middle">Question Marks</text>
              <text x={pad + inner * 0.25} y={pad + inner * 0.9} fill="#34d39960" fontSize={10} textAnchor="middle">Cash Cows</text>
              <text x={pad + inner * 0.75} y={pad + inner * 0.9} fill="#f8717160" fontSize={10} textAnchor="middle">Dogs</text>
              {/* Axis labels */}
              <text x={plotSize / 2} y={plotSize - 4} fill="#94a3b8" fontSize={9} textAnchor="middle">Relative Market Share →</text>
              <text x={8} y={plotSize / 2} fill="#94a3b8" fontSize={9} textAnchor="middle" transform={`rotate(-90, 8, ${plotSize / 2})`}>Market Growth Rate % →</text>
              {/* Data points */}
              {units.map((u, i) => {
                const g = parseFloat(u.growth) || 0;
                const s = parseFloat(u.share) || 0;
                const maxGrowth = 30;
                const maxShare = 4;
                const cx = pad + inner - Math.min(Math.max(s / maxShare, 0), 1) * inner;
                const cy = pad + inner - Math.min(Math.max(g / maxGrowth, 0), 1) * inner;
                const cat = classify(u);
                return (
                  <g key={i}>
                    <circle cx={cx} cy={cy} r={10} fill={cat.color} fillOpacity={0.3} stroke={cat.color} strokeWidth={1.5} />
                    <text x={cx} y={cy + 3} fill="white" fontSize={8} textAnchor="middle">{u.name?.slice(0, 3) || (i + 1)}</text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="flex-1 space-y-2">
            {units.map((u, i) => {
              const cat = classify(u);
              return (
                <div key={i} className="p-3 rounded-lg flex items-start gap-3" style={glass(0.3)}>
                  <span className="text-lg">{cat.icon}</span>
                  <div>
                    <div className="text-xs font-medium text-white">{u.name || `Unit ${i + 1}`}</div>
                    <div className="text-[10px]" style={{ color: cat.color }}>{cat.label}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{cat.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {onSave && <SaveBtn onClick={() => {
          const cats = {};
          units.forEach(u => { const c = classify(u).label; cats[c] = (cats[c] || 0) + 1; });
          const summary = Object.entries(cats).map(([k, v]) => `${v} ${k}${v > 1 ? "s" : ""}`).join(", ");
          onSave("bcg", { summary: summary || "No units defined" });
        }} />}
        <ExportBtn onClick={() => {
          const unitRows = units.map(u => {
            const cat = classify(u);
            return `<tr style="border-bottom:1px solid #e5e7eb"><td style="padding:8px;font-size:12px;color:#334155;font-weight:600">${u.name || "—"}</td><td style="padding:8px;text-align:center;font-size:12px">${parseFloat(u.growth).toFixed(1)}%</td><td style="padding:8px;text-align:center;font-size:12px">${parseFloat(u.share).toFixed(1)}</td><td style="padding:8px;text-align:center"><span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;color:white;background:${cat.color}">${cat.icon} ${cat.label}</span></td></tr>`;
          }).join("");
          const catDetails = units.map(u => {
            const cat = classify(u);
            return `<div style="padding:10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px"><div style="font-weight:600;font-size:13px;color:#1e293b">${cat.icon} ${u.name || "Unit"} — <span style="color:${cat.color}">${cat.label}</span></div><div style="font-size:11px;color:#64748b;margin-top:4px">${cat.desc}</div></div>`;
          }).join("");
          const body = `${buildHeader(strategyContext, "BCG Matrix Export")}
            <div class="section">📊 BCG Matrix — Growth-Share Analysis</div>
            <p style="font-size:12px;color:#64748b;margin-bottom:16px">Classifies business units by market growth rate and relative market share.</p>
            <table class="factor-table"><thead><tr><th>Business Unit</th><th style="text-align:center;width:100px">Growth %</th><th style="text-align:center;width:100px">Rel. Share</th><th style="text-align:center;width:140px">Category</th></tr></thead><tbody>${unitRows}</tbody></table>
            <div class="section" style="font-size:14px">Classification Details</div>
            ${catDetails}
            <div class="interpretation-box"><strong>BCG Framework:</strong> Stars (high growth, high share) — invest to maintain. Cash Cows (low growth, high share) — harvest profits. Question Marks (high growth, low share) — decide to invest or divest. Dogs (low growth, low share) — consider divestiture.</div>`;
          openExportWindow("BCG Matrix", body);
        }} />
      </div>
    </div>
  );
};

// ═══ PORTER'S FIVE FORCES ═══
const PorterFiveForces = ({ onSave, strategyContext, initialData }) => {
  const forceDefinitions = [
    { key: "rivalry", name: "Competitive Rivalry", icon: "⚔️", color: "#f87171", factors: ["Number of competitors", "Industry growth rate", "Product differentiation", "Exit barriers"] },
    { key: "newEntrants", name: "Threat of New Entrants", icon: "🚪", color: "#fbbf24", factors: ["Capital requirements", "Economies of scale", "Brand loyalty", "Regulatory barriers"] },
    { key: "substitutes", name: "Threat of Substitutes", icon: "🔄", color: "#a78bfa", factors: ["Switching costs", "Price-performance ratio", "Number of substitutes", "Buyer propensity to switch"] },
    { key: "buyers", name: "Bargaining Power of Buyers", icon: "🛒", color: "#60a5fa", factors: ["Buyer concentration", "Purchase volume", "Product differentiation", "Price sensitivity"] },
    { key: "suppliers", name: "Bargaining Power of Suppliers", icon: "🏭", color: "#34d399", factors: ["Supplier concentration", "Switching costs", "Unique inputs", "Forward integration threat"] },
  ];

  const [forces, setForces] = useState(() => {
    if (initialData) {
      const init = {};
      for (const f of forceDefinitions) {
        init[f.key] = initialData[f.key]?.length ? initialData[f.key] : f.factors.map(name => ({ factor: name, rating: 3 }));
      }
      return init;
    }
    const init = {};
    for (const f of forceDefinitions) {
      init[f.key] = f.factors.map(name => ({ factor: name, rating: 3 }));
    }
    return init;
  });

  const updateFactor = (forceKey, idx, field, val) => {
    setForces(prev => ({
      ...prev,
      [forceKey]: prev[forceKey].map((f, i) => i === idx ? { ...f, [field]: val } : f),
    }));
  };
  const addFactor = (forceKey) => setForces(prev => ({ ...prev, [forceKey]: [...prev[forceKey], { factor: "", rating: 3 }] }));
  const removeFactor = (forceKey, idx) => {
    if (forces[forceKey].length > 1) setForces(prev => ({ ...prev, [forceKey]: prev[forceKey].filter((_, i) => i !== idx) }));
  };

  const forceAvg = (forceKey) => {
    const items = forces[forceKey] || [];
    return items.length ? items.reduce((s, f) => s + (parseInt(f.rating) || 0), 0) / items.length : 0;
  };

  const threatLevel = (avg) => avg >= 4 ? "Very High" : avg >= 3 ? "High" : avg >= 2 ? "Moderate" : "Low";
  const threatColor = (avg) => avg >= 4 ? "#f87171" : avg >= 3 ? "#fbbf24" : avg >= 2 ? "#60a5fa" : "#34d399";

  const overallAvg = forceDefinitions.reduce((s, f) => s + forceAvg(f.key), 0) / forceDefinitions.length;
  const overallInterpretation = overallAvg >= 3.5 ? "Highly Competitive — Difficult industry environment" : overallAvg >= 2.5 ? "Moderately Competitive — Manageable challenges" : "Low Competition — Favorable industry environment";

  // Pentagon visualization
  const svgSize = 220;
  const center = svgSize / 2;
  const maxR = 85;

  const getPoint = (index, value, maxVal = 5) => {
    const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2;
    const r = (value / maxVal) * maxR;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };

  const polygonPoints = forceDefinitions.map((f, i) => {
    const p = getPoint(i, forceAvg(f.key));
    return `${p.x},${p.y}`;
  }).join(" ");

  const gridLevels = [1, 2, 3, 4, 5];

  return (
    <div className="space-y-4">
      <p className="text-gray-400 text-xs leading-relaxed">Porter's Five Forces analyzes the competitive intensity of an industry. Rate each factor from 1 (low threat/power) to 5 (high threat/power).</p>

      <div className="space-y-4">
        {forceDefinitions.map(fd => (
          <div key={fd.key} className="p-3 rounded-xl" style={glass(0.3)}>
            <div className="flex items-center gap-2 mb-2">
              <span>{fd.icon}</span>
              <span className="text-xs font-semibold text-white">{fd.name}</span>
              <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full border" style={{ color: threatColor(forceAvg(fd.key)), borderColor: `${threatColor(forceAvg(fd.key))}40`, background: `${threatColor(forceAvg(fd.key))}15` }}>{threatLevel(forceAvg(fd.key))} ({forceAvg(fd.key).toFixed(1)})</span>
            </div>
            {forces[fd.key].map((f, i) => (
              <div key={i} className="flex gap-2 items-center mb-1.5">
                <input value={f.factor} onChange={e => updateFactor(fd.key, i, "factor", e.target.value)} className={inputCls + " !py-1.5 !text-xs flex-1"} placeholder="Factor" />
                <select value={f.rating} onChange={e => updateFactor(fd.key, i, "rating", e.target.value)} className={weightInputCls + " !w-24 appearance-none"}>
                  <option value={1}>1 — Low</option>
                  <option value={2}>2 — Mod Low</option>
                  <option value={3}>3 — Medium</option>
                  <option value={4}>4 — Mod High</option>
                  <option value={5}>5 — High</option>
                </select>
                <RemoveBtn onClick={() => removeFactor(fd.key, i)} />
              </div>
            ))}
            <AddRowBtn onClick={() => addFactor(fd.key)} label="Add Factor" />
          </div>
        ))}
      </div>

      <div className="border-t pt-4 mt-4" style={{ borderColor: BORDER }}>
        <SectionTitle>Analysis Summary</SectionTitle>
        <div className="flex flex-col md:flex-row gap-6 items-center">
          {/* Pentagon radar chart */}
          <div className="shrink-0">
            <svg width={svgSize} height={svgSize} className="rounded-xl" style={{ background: "rgba(10,22,40,0.8)" }}>
              {/* Grid pentagons */}
              {gridLevels.map(level => {
                const pts = forceDefinitions.map((_, i) => {
                  const p = getPoint(i, level);
                  return `${p.x},${p.y}`;
                }).join(" ");
                return <polygon key={level} points={pts} fill="none" stroke="#1e3a5f" strokeWidth={0.5} />;
              })}
              {/* Axis lines */}
              {forceDefinitions.map((_, i) => {
                const p = getPoint(i, 5);
                return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="#1e3a5f" strokeWidth={0.5} />;
              })}
              {/* Data polygon */}
              <polygon points={polygonPoints} fill={`${GOLD}20`} stroke={GOLD} strokeWidth={2} />
              {/* Data points + labels */}
              {forceDefinitions.map((fd, i) => {
                const p = getPoint(i, forceAvg(fd.key));
                const lp = getPoint(i, 5.8);
                return (
                  <g key={fd.key}>
                    <circle cx={p.x} cy={p.y} r={4} fill={fd.color} />
                    <text x={lp.x} y={lp.y} fill={fd.color} fontSize={7} textAnchor="middle" dominantBaseline="middle">{fd.icon}</text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="flex-1 space-y-3">
            <div className="space-y-2">
              {forceDefinitions.map(fd => {
                const a = forceAvg(fd.key);
                return (
                  <div key={fd.key} className="flex items-center gap-3">
                    <span className="text-sm w-5">{fd.icon}</span>
                    <span className="text-xs text-gray-400 w-40 truncate">{fd.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-[#1e3a5f] overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(a / 5) * 100}%`, background: fd.color }} />
                    </div>
                    <span className="text-xs font-mono w-8 text-right" style={{ color: fd.color }}>{a.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
            <ScoreDisplay label="Overall Industry Attractiveness" value={overallAvg.toFixed(1)} max="5.0" interpretation={overallInterpretation} color={threatColor(overallAvg)} />
          </div>
        </div>
        {onSave && <SaveBtn onClick={() => onSave("porter", { summary: `${overallInterpretation} (${overallAvg.toFixed(1)}/5.0)` })} />}
        <ExportBtn onClick={() => {
          const forceCards = forceDefinitions.map(fd => {
            const a = forceAvg(fd.key);
            const factorRows = forces[fd.key].map(f => `<tr style="border-bottom:1px solid #e5e7eb"><td style="padding:6px 8px;font-size:12px;color:#334155">${f.factor || "—"}</td><td style="padding:6px 8px;text-align:center;font-size:12px;font-weight:600;color:${threatColor(parseInt(f.rating))}">${f.rating}/5</td></tr>`).join("");
            return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:12px;page-break-inside:avoid">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><span style="font-weight:600;font-size:14px;color:#1e293b">${fd.icon} ${fd.name}</span><span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;color:white;background:${threatColor(a)}">${threatLevel(a)} (${a.toFixed(1)})</span></div>
              <table class="factor-table" style="margin-top:4px"><thead><tr><th>Factor</th><th style="text-align:center;width:80px">Rating</th></tr></thead><tbody>${factorRows}</tbody></table>
              <div style="margin-top:8px;height:8px;border-radius:4px;background:#e5e7eb;overflow:hidden"><div style="height:100%;border-radius:4px;background:${fd.color};width:${(a / 5) * 100}%"></div></div>
            </div>`;
          }).join("");
          const body = `${buildHeader(strategyContext, "Porter's Five Forces Export")}
            <div class="section">⚔️ Porter's Five Forces — Industry Competitive Analysis</div>
            <p style="font-size:12px;color:#64748b;margin-bottom:16px">Analyzes the five competitive forces that shape industry attractiveness.</p>
            ${forceCards}
            <div class="score-card"><div class="score-label">Overall Industry Attractiveness</div><div class="score-value" style="color:${threatColor(overallAvg)}">${overallAvg.toFixed(1)}</div><div style="font-size:10px;color:#64748b">out of 5.0</div><div class="score-interp" style="color:${threatColor(overallAvg)}">${overallInterpretation}</div></div>`;
          openExportWindow("Porter's Five Forces", body);
        }} />
      </div>
    </div>
  );
};

// ═══ FRAMEWORK BUTTONS (inline in markdown) ═══
export const FrameworkButton = ({ frameworkKey, onClick }) => {
  const fw = MATRIX_FRAMEWORKS[frameworkKey];
  if (!fw) return null;
  return (
    <button
      onClick={() => onClick(frameworkKey)}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all hover:scale-[1.02] mx-0.5 my-0.5"
      style={{ borderColor: `${GOLD}50`, color: GOLD_L, background: `${GOLD}12` }}
      title={`Open interactive ${fw.name} worksheet`}
    >
      {fw.icon} {fw.name} <span className="text-amber-500/50 text-[10px]">→ Interactive</span>
    </button>
  );
};

// ═══ MATRIX TOOLKIT MODAL ═══
export const StrategyMatrixToolkit = ({ open, matrixKey, onClose, onSave, strategyContext, initialData }) => {
  const fw = MATRIX_FRAMEWORKS[matrixKey];
  if (!open || !fw) return null;

  const worksheetMap = {
    ife: IFEMatrix,
    efe: EFEMatrix,
    space: SPACEMatrix,
    bcg: BCGMatrix,
    porter: PorterFiveForces,
  };

  const Worksheet = worksheetMap[matrixKey];
  // Use a key to force remount when initialData changes (ensures useState picks up new values)
  const worksheetKey = initialData ? `loaded-${JSON.stringify(initialData).length}` : "manual";

  return (
    <Modal open={open} onClose={onClose} title={`${fw.icon} ${fw.name}`} wide>
      <div className="mb-3 pb-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="text-gray-400 text-xs">{fw.description}</div>
        {initialData && (
          <div className="mt-2 text-[10px] text-amber-400/80 flex items-center gap-1.5">
            <span>📊</span> Pre-filled from AI analysis — review and adjust values before calculating
          </div>
        )}
      </div>
      {Worksheet && <Worksheet key={worksheetKey} onSave={onSave} strategyContext={strategyContext} initialData={initialData} />}
    </Modal>
  );
};
