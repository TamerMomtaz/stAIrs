#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Stairs — filled-control contrast audit

   scripts/contrast-audit.mjs measures the PALETTE: a hand-written list of
   role pairs, each asserted against a threshold. It passed while the
   primary call-to-action in the app printed near-white on gold at 2.78:1,
   because the pair it asserts is `--ink-on-accent` on `--grad-accent`
   (5.82:1) and the pair the buttons paint was `--surface-app` on
   `--grad-accent`. The check and the thing being checked had drifted
   apart. The audit was not wrong; it was measuring a different app.

   So this one measures no list. It reads:

     tokens.css     for what every token resolves to, per theme
     constants.js   for which JS name means which token
     every .jsx     for the (fill, ink) pairs the components actually paint

   and holds each pair it finds against 4.5:1 in BOTH themes. Nothing here
   is hand-copied from anywhere, so nothing here can drift from anywhere.
   Add a button with the wrong ink and this fails; add a whole new gradient
   with the wrong ink and this fails too, without being taught about it.

     node scripts/control-contrast.mjs           # both themes
     node scripts/control-contrast.mjs --list    # also print passing pairs

   Gradients are measured at every stop, ternaries down both branches, and
   translucent fills over both grounds a control here sits on — so "it only
   fails when selected" and "it only fails at the far end of the gradient"
   are caught rather than averaged away.

   What it cannot resolve — a fill built at runtime from a lookup map — it
   PRINTS, with a count and a location, instead of dropping it. A silent
   skip is how the gold buttons survived a green audit this long, and a
   number for what is not covered is the difference between a gate and a
   green tick. Build a fill from a token and it becomes measurable; that is
   the pressure this is meant to apply.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ratio, toHex, hex, over } from "./lib/color.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

/* ── 1. tokens.css → what each token resolves to, per theme ────────── */

// Body text on a filled control. Every pair this script finds is a label
// sitting on its own button, so there is no "large text" discount to take.
const NEED = 4.5;

// Comments go first, before anything looks for a selector. tokens.css
// documents its own selectors in its header, so `:root[data-theme="light"]`
// occurs as prose above the block it names — matching the prose silently
// resolved the whole light theme to dark values, and every light row agreed
// with its dark twin because it WAS its dark twin.
const css = readFileSync(join(SRC, "tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// Pull one `selector { ... }` block out by brace matching, so a nested
// function like color-mix() cannot end the block early.
const block = (selector) => {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`tokens.css: no block for ${selector}`);
  let i = css.indexOf("{", at), depth = 0, start = i;
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start + 1, i);
  }
  throw new Error(`tokens.css: unterminated block for ${selector}`);
};

const declarations = (text) => {
  const out = {};
  // Strip comments first — they contain colons, hexes and prose.
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const line of clean.split(";")) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
};

const DARK = declarations(block(":root,"));
const LIGHT = { ...DARK, ...declarations(block(':root[data-theme="light"]')) };
// The Tailwind bridge: `text-ink-on-accent` is --color-ink-on-accent is
// --ink-on-accent. Parsed rather than hardcoded so a renamed utility is a
// resolution failure here instead of a silent miss.
const UTILITIES = declarations(block("@theme inline"));

const THEMES = { light: LIGHT, dark: DARK };

/* ── 2. resolving a CSS value to concrete colours ──────────────────── */

// Split on commas that are not inside parentheses.
const topLevelCommas = (s) => {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim());
};

// Split a ternary at its top-level `?` / `:`, so both branches get measured.
// A control that paints GRAD_ACCENT when selected is a filled control when
// selected, and that is the state its label has to be legible in.
const ternary = (s) => {
  let depth = 0, quote = null, q = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "?" && depth === 0 && s[i + 1] !== "." && s[i + 1] !== "?") { q = i; break; }
  }
  if (q < 0) return null;
  depth = 0; quote = null;
  for (let i = q + 1; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === ":" && depth === 0)
      return { cond: s.slice(0, q).trim(), a: s.slice(q + 1, i), b: s.slice(i + 1) };
  }
  return null;
};

// A control whose fill AND ink both switch on the same condition has two
// states, not four. Measuring the cross product invents pairs the app can
// never paint — `INK_3 on GRAD_ACCENT` for a tab that is grey when inactive
// and gold-with-navy when active — and a check that reports failures nobody
// can reproduce is one people learn to ignore.
const variants = (fillExpr, inkExpr) => {
  const f = ternary(fillExpr), i = ternary(inkExpr);
  if (f && i && f.cond === i.cond) return [[f.a, i.a], [f.b, i.b]];
  if (f) return [[f.a, inkExpr], [f.b, inkExpr]];
  if (i) return [[fillExpr, i.a], [fillExpr, i.b]];
  return [[fillExpr, inkExpr]];
};

// A fill of "transparent"/"none" is not a fill: the ink lands on whatever is
// behind, which is the palette audit's question, not this one.
const NO_FILL = new Set(["transparent", "none", "unset", "inherit", "initial"]);

// Returns an array of concrete colours a value paints (one for a flat
// colour, one per stop for a gradient, one per candidate ground for a
// translucent one), or null if it cannot be resolved.
const resolve = (value, vars, seen = new Set()) => {
  if (!value) return null;
  let v = value.trim();

  // "GRAD_ACCENT" and `${tint(GOLD, 19)}` both name one expression.
  const quoted = v.match(/^"([^"]*)"$|^'([^']*)'$|^`([^`$]*)`$/);
  if (quoted) v = (quoted[1] ?? quoted[2] ?? quoted[3]).trim();
  const wrapped = v.match(/^`\$\{([\s\S]+)\}`$/);
  if (wrapped) v = wrapped[1].trim();
  if (v in SCOPE) v = SCOPE[v];

  // A template literal is just an expression with holes. Filling them lets
  // `linear-gradient(135deg, ${GOLD}, ${tint(GOLD, 7)})` be measured instead
  // of shrugged at — and an inline gradient is where the wrong ink hides.
  const tpl = v.match(/^`([\s\S]*)`$/);
  if (tpl) {
    let ok = true;
    const filled = tpl[1].replace(/\$\{([^{}]+)\}/g, (_, e) => {
      const t = e.trim();
      if (t in SCOPE) return SCOPE[t];
      const tn = t.match(/^tint\(\s*([\w$.]+)\s*,\s*([\d.]+)\s*\)$/);
      if (tn && tn[1] in SCOPE) return `color-mix(in srgb, ${SCOPE[tn[1]]} ${tn[2]}%, transparent)`;
      ok = false;
      return "";
    });
    return ok ? resolve(filled, vars, seen) : null;
  }

  const branches = ternary(v);
  if (branches) {
    const out = [];
    for (const b of [branches.a, branches.b]) {
      const t = b.trim();
      // A branch that paints nothing contributes no fill to measure.
      if (NO_FILL.has(t.replace(/^["'`]|["'`]$/g, ""))) continue;
      const r = resolve(t, vars, seen);
      if (!r) return null;
      out.push(...r);
    }
    return out.length ? out : null;
  }

  if (/^#[0-9a-f]{3,8}$/i.test(v)) return [hex(v)];

  const varMatch = v.match(/^var\(\s*(--[\w-]+)\s*(?:,[\s\S]*)?\)$/);
  if (varMatch) {
    const name = varMatch[1];
    if (seen.has(name) || !(name in vars)) return null; // cycle or unknown
    return resolve(vars[name], vars, new Set([...seen, name]));
  }

  // rgb(var(--x-rgb)) — the triplet form the surfaces and accent use.
  const rgbMatch = v.match(/^rgba?\(\s*var\(\s*(--[\w-]+)\s*\)\s*(?:\/[^)]*)?\)$/);
  if (rgbMatch) {
    const triplet = vars[rgbMatch[1]];
    if (!triplet) return null;
    const n = triplet.trim().split(/[\s,]+/).map(Number);
    return n.length === 3 && n.every((x) => Number.isFinite(x)) ? [n] : null;
  }

  const literal = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (literal) return [[+literal[1], +literal[2], +literal[3]]];

  if (/^(linear|radial)-gradient\(/i.test(v)) {
    const inner = v.slice(v.indexOf("(") + 1, v.lastIndexOf(")"));
    const stops = topLevelCommas(inner)
      // drop the direction: "135deg", "to right", "circle at center"
      .filter((s) => !/^(-?[\d.]+deg|to\s|circle|ellipse|at\s)/i.test(s))
      // drop any stop position suffix: "var(--x) 40%"
      .map((s) => s.replace(/\s+[\d.]+%$/, ""));
    const out = [];
    for (const s of stops) {
      const r = resolve(s, vars, seen);
      if (!r) return null;
      out.push(...r);
    }
    return out.length ? out : null;
  }

  // A translucent fill is not one colour, it is one colour per thing it can
  // sit on. Rather than give up, composite it over both grounds a control in
  // this app actually sits on — the page and a raised card — and let the
  // worse of the two be the one that has to pass.
  // tint(X, n) from constants.js is the codebase's own name for that.
  const tinted = v.match(/^tint\(\s*([\s\S]+)\s*,\s*([\d.]+)\s*\)$/);
  if (tinted) v = `color-mix(in srgb, ${tinted[1]} ${tinted[2]}%, transparent)`;

  const mix = v.match(/^color-mix\(\s*in\s+srgb\s*,\s*([\s\S]+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/i);
  if (mix) {
    const base = resolve(mix[1], vars, seen);
    if (!base) return null;
    const alpha = Number(mix[2]) / 100;
    return groundsFor(vars).flatMap((g) => base.map((b) => over(b, alpha, g)));
  }
  const slash = v.match(/^rgba?\(\s*var\(\s*(--[\w-]+)\s*\)\s*\/\s*([\d.]+)\s*\)$/);
  if (slash) {
    const triplet = vars[slash[1]];
    if (!triplet) return null;
    const n = triplet.trim().split(/[\s,]+/).map(Number);
    if (n.length !== 3 || !n.every(Number.isFinite)) return null;
    return groundsFor(vars).map((g) => over(n, Number(slash[2]), g));
  }

  return null;
};

// The two grounds a filled control sits on in this app. Derived from the
// tokens rather than typed in, so a repaint moves them.
const groundCache = new Map();
const groundsFor = (vars) => {
  if (groundCache.has(vars)) return groundCache.get(vars);
  const page = resolve("var(--surface-app)", vars);
  const raised = resolve("rgb(var(--surface-raised-rgb))", vars);
  const g = [...(page ?? []), ...(raised ?? [])];
  groundCache.set(vars, g);
  return g;
};

/* ── 3. constants.js → which JS identifier means which token ───────── */

const constantsSrc = readFileSync(join(SRC, "constants.js"), "utf8");
const CONSTANTS = {};
for (const m of constantsSrc.matchAll(/export const ([A-Z][A-Z0-9_]*)\s*=\s*"([^"]+)"/g)) {
  CONSTANTS[m[1]] = m[2];
}
// HUE.blue and friends: marks, not fills — but components do reach for them
// as fills, so they have to be resolvable to be measurable.
for (const m of constantsSrc.matchAll(/(\w+)\s*:\s*"(var\(--[\w-]+\))"/g)) {
  CONSTANTS[`HUE.${m[1]}`] = m[2];
}

// A file may rename what it imports — WelcomeSlideshow calls DEEPEST `BG` and
// ACCENT_BRIGHT `ACCENT`. Without this the slideshow's Get Started button,
// which prints BG on GRAD_ACCENT_BRIGHT, reads as "not measurable" rather
// than as the 2.71:1 it is. A rename is not a place for a check to stop.
const localsOf = (src) => {
  const scope = { ...CONSTANTS };
  for (const m of src.matchAll(/^const ([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$.]*)\s*;/gm)) {
    if (m[2] in scope) scope[m[1]] = scope[m[2]];
  }
  return scope;
};
// Which names resolve is per file; the measuring loop sets this per pair.
let SCOPE = CONSTANTS;

/* ── 4. the components → pairs actually painted ────────────────────── */

const jsxFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) { if (entry !== "test") walk(p); }
    else if (entry.endsWith(".jsx")) jsxFiles.push(p);
  }
})(SRC);
jsxFiles.sort();

// Walk forward from an opening brace to its match, ignoring braces inside
// strings and template literals.
const matchBrace = (s, open) => {
  let depth = 0, i = open, quote = null;
  for (; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
};

const styleEntries = (body) =>
  Object.fromEntries(
    topLevelCommas(body)
      .map((part) => {
        const at = part.indexOf(":");
        return at < 0 ? null : [part.slice(0, at).trim(), part.slice(at + 1).trim()];
      })
      .filter(Boolean)
  );

// An ink named by a Tailwind class: text-ink-on-accent → --ink-on-accent.
const inkFromClass = (tagText) => {
  const cls = tagText.match(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/);
  if (!cls) return null;
  const names = (cls[1] || cls[2] || cls[3] || "").split(/\s+/);
  for (const n of names) {
    const m = n.match(/^text-([a-z0-9-]+)$/i);
    if (!m) continue;
    const utility = `--color-${m[1]}`;
    if (utility in UTILITIES) return { expr: n, css: UTILITIES[utility] };
  }
  return null;
};

const FILL_KEYS = ["background", "backgroundImage", "backgroundColor"];
const found = [];

for (const file of jsxFiles) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  const scope = localsOf(src);
  let at = 0;
  while ((at = src.indexOf("style={{", at)) !== -1) {
    const objOpen = at + "style={".length;         // the inner {
    const objClose = matchBrace(src, objOpen);
    if (objClose < 0) { at += 8; continue; }
    const body = src.slice(objOpen + 1, objClose);

    // The enclosing opening tag, for className and for a readable location.
    let tagStart = src.lastIndexOf("<", at);
    while (tagStart > 0 && !/[A-Za-z]/.test(src[tagStart + 1])) tagStart = src.lastIndexOf("<", tagStart - 1);
    let tagEnd = objClose, quote = null, depth = 0;
    for (; tagEnd < src.length; tagEnd++) {
      const c = src[tagEnd];
      if (quote) { if (c === "\\") tagEnd++; else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth <= 0) break;
    }
    const tagText = src.slice(Math.max(0, tagStart), Math.min(src.length, tagEnd + 1));

    const entries = styleEntries(body);
    const fillKey = FILL_KEYS.find((k) => k in entries);
    const bare = fillKey ? entries[fillKey].trim().replace(/^["'`]|["'`]$/g, "") : "";
    if (fillKey && !NO_FILL.has(bare)) {
      // An ink named by a class resolves through the Tailwind bridge, not
      // through the JS constants — `text-ink-on-accent` is not an identifier
      // any scope knows. Display the class, resolve the token behind it.
      const ink = entries.color
        ? { expr: entries.color, src: entries.color }
        : inkFromClass(tagText);
      if (ink) {
        found.push({
          file: rel,
          line: src.slice(0, at).split("\n").length,
          fillExpr: entries[fillKey],
          inkExpr: ink.expr,
          inkSrc: ink.src ?? ink.css,
          scope,
        });
      }
    }
    at = objClose;
  }
}

/* ── 5. measure ────────────────────────────────────────────────────── */

const failures = [], unresolved = [], passes = [], approximate = [];

// An opaque fill is exactly one colour and the measurement is exact, so it
// gates. A translucent one is a different colour on every ground it lands
// on — sidebar white, page warm-white, a modal, another tint — and this
// script cannot know which. Worst-case compositing there would report
// failures the app never paints, and a gate that cries wolf gets switched
// off. Those are measured and printed below the line instead, with numbers,
// so they are visible without being load-bearing.
const TRANSLUCENT = /tint\(|color-mix\(|\/\s*0?\.\d/;

for (const pair of found) {
  SCOPE = pair.scope;
  const rows = [];
  let blocked = null;
  for (const [themeName, vars] of Object.entries(THEMES)) {
    for (const [fillExpr, inkExpr] of variants(pair.fillExpr, pair.inkSrc)) {
      // A state that paints no fill is not a filled control in that state.
      if (NO_FILL.has(fillExpr.trim().replace(/^["'`]|["'`]$/g, ""))) continue;
      const fills = resolve(fillExpr, vars);
      const inks = resolve(inkExpr, vars);
      if (!fills || !inks) {
        blocked = !fills ? `fill ${fillExpr.trim()}` : `ink ${inkExpr.trim()}`;
        break;
      }
      // Worst stop against the ink: a gradient is only as legible as its
      // least legible end.
      // Opacity is a property of the STATE, not of the control: a tab that
      // is a gold gradient when selected and a faint tint when not has one
      // exact branch and one approximate one. Judging the pair by whichever
      // branch is mentioned first buries the exact failure behind the
      // approximate one, which is how a 2.78:1 selected tab reads as
      // "not gated".
      const approx = TRANSLUCENT.test(fillExpr);
      for (const f of fills) {
        for (const i of inks) {
          rows.push({ theme: themeName, r: ratio(i, f), fill: toHex(f), ink: toHex(i), approx });
        }
      }
    }
    if (blocked) break;
  }
  const exactBad = rows.some((r) => !r.approx && r.r < NEED);
  const approxBad = rows.some((r) => r.approx && r.r < NEED);
  if (blocked) unresolved.push({ ...pair, blocked });
  else if (exactBad) failures.push({ ...pair, rows: rows.filter((r) => !r.approx) });
  else if (approxBad) approximate.push({ ...pair, rows: rows.filter((r) => r.approx) });
  else passes.push({ ...pair, rows });
}

/* ── 6. report ─────────────────────────────────────────────────────── */

const worstOf = (rows) => rows.reduce((a, b) => (b.r < a.r ? b : a));

console.log(`\nfilled-control contrast — ${jsxFiles.length} components, ${found.length} (fill, ink) pairs painted\n`);

if (process.argv.includes("--list")) {
  for (const p of passes.sort((a, b) => worstOf(a.rows).r - worstOf(b.rows).r)) {
    const w = worstOf(p.rows);
    console.log(`  pass  ${w.r.toFixed(2).padStart(5)}:1  ${p.inkExpr} on ${p.fillExpr}  (${w.theme})  ${p.file}:${p.line}`);
  }
  console.log("");
}

// Printed, never silent. A pair this script cannot resolve is a pair nobody
// is checking, and the honest thing is to say so and say which — a count of
// "not covered" is the difference between a gate and a green tick.
if (unresolved.length) {
  console.log(`  not statically measurable — ${unresolved.length} pair${unresolved.length > 1 ? "s" : ""}, listed so the gap is visible:`);
  for (const u of unresolved) {
    console.log(`      ${u.file}:${u.line}  ${u.inkExpr} on ${u.fillExpr}`);
  }
  console.log("");
}

for (const f of failures) {
  const w = worstOf(f.rows);
  console.log(`  FAIL  ${w.r.toFixed(2)}:1  (needs ${NEED})  ${f.file}:${f.line}`);
  console.log(`      ${f.inkExpr} on ${f.fillExpr}`);
  for (const row of f.rows.filter((r) => r.r < NEED)) {
    console.log(`      ${row.theme.padEnd(5)}  ink ${row.ink} on fill ${row.fill}  ${row.r.toFixed(2)}:1`);
  }
  console.log("");
}

if (approximate.length) {
  console.log(`  translucent fills — measured over page and card, NOT gated (${approximate.length} land under ${NEED} on their worst ground):`);
  for (const a of approximate) {
    const w = worstOf(a.rows);
    console.log(`      ${w.r.toFixed(2)}:1  ${a.file}:${a.line}  ${a.inkExpr} on ${a.fillExpr}  (${w.theme}, ink ${w.ink} on ${w.fill})`);
  }
  console.log("");
}

const measured = passes.length + failures.length;
console.log("  " + "─".repeat(66));
console.log(
  `  ${passes.length}/${measured} measured pairs pass both themes` +
    (failures.length ? `  — ${failures.length} failing` : "") +
    (unresolved.length ? `  (${unresolved.length} not measurable)` : "")
);
if (!failures.length) console.log(`  no measured control prints unreadable ink on its own fill, in either theme`);
console.log("");
process.exit(failures.length ? 1 : 0);
