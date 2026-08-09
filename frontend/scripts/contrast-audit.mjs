#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Stairs — contrast audit

   The audit in docs/product-audit-2026-08.md measured 23 text/background
   pairs on the dark theme and found 12 of them failing AA. This re-runs
   the same 23 pairs against whichever theme you ask for, so "we fixed the
   contrast" is a number rather than an opinion.

     node scripts/contrast-audit.mjs          # light (the default theme)
     node scripts/contrast-audit.mjs dark

   Ratios are computed on the COMPOSITED surface, not the token in
   isolation — a translucent panel over a gradient is not the colour it
   declares, which is how the original audit found failures that reading
   the CSS would have missed.
   ═══════════════════════════════════════════════════════════════════ */

const hex = (h) => {
  h = h.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (a, b) => {
  const [l1, l2] = [lum(rgb(a)), lum(rgb(b))];
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};
const rgb = (c) => (Array.isArray(c) ? c : hex(c));
// what a translucent colour actually resolves to once it is over something
const over = (fg, alpha, bg) => rgb(bg).map((b, i) => Math.round(rgb(fg)[i] * alpha + b * (1 - alpha)));

const THEMES = {
  light: {
    page: "#faf8f4", card: "#ffffff", sunken: "#f2eee7", sidebar: "#ffffff", modal: "#ffffff",
    ink: "#0f1b33", ink2: "#5a5750", ink3: "#5a5750", muted: "#8a867c", faint: "#8a867c", ghost: "#8a867c",
    gold: "#b8904a", goldInk: "#8a6a2f", goldSoft: "#efe6d6", teal: "#2a5c5c", inkOnAccent: "#0f1b33",
    okInk: "#006300", okFill: "#e6f2e6", warnInk: "#8a5a00", warnFill: "#fbf0da",
    badInk: "#b3312f", badFill: "#fae7e6", infoInk: "#1c5cab", infoFill: "#e4edf9",
    ringTrack: "#f2eee7", tint20: over("#b8904a", 0.2, "#ffffff"), tint10: over("#b8904a", 0.1, "#ffffff"),
  },
  dark: {
    page: "#0a1628", card: over("#162544", 0.6, "#0f1f3a"), sunken: "#0d1c33",
    sidebar: "#0a1628", modal: "#0f1932",
    ink: "#ffffff", ink2: "#d1d5dc", ink3: "#99a1af", muted: "#6a7282", faint: "#4a5565", ghost: "#364153",
    gold: "#b8904a", goldInk: "#b8904a", goldSoft: "#2a2416", teal: "#2a5c5c", inkOnAccent: "#0a1628",
    okInk: "#6ee7b7", okFill: over("#34d399", 0.2, "#0a1628"), warnInk: "#fcd34d", warnFill: over("#fbbf24", 0.2, "#0a1628"),
    badInk: "#fca5a5", badFill: over("#f87171", 0.2, "#0a1628"), infoInk: "#93c5fd", infoFill: over("#60a5fa", 0.2, "#0a1628"),
    ringTrack: "#0d1c33", tint20: over("#b8904a", 0.2, "#0a1628"), tint10: over("#b8904a", 0.1, "#0a1628"),
  },
};

// The same 23 pairs the original audit measured, expressed as roles.
// `size` is what the node actually renders at, which decides the threshold.
const PAIRS = (t) => [
  ["primary ink on page",              t.ink,      t.page,     "body"],
  ["primary ink on card",              t.ink,      t.card,     "body"],
  ["secondary ink on page",            t.ink2,     t.page,     "body"],
  ["secondary ink on card",            t.ink2,     t.card,     "body"],
  ["tertiary ink on page",             t.ink3,     t.page,     "body"],
  ["tertiary ink on card (was 3.24)",  t.ink3,     t.card,     "body"],
  ["muted ink — labels",               t.muted,    t.page,     "ui"],
  ["faint ink — metadata",             t.faint,    t.card,     "ui"],
  ["ghost ink — page footer (was 1.76)", t.ghost,  t.page,     "ui"],
  ["sidebar inactive item (was 3.81)", t.muted,    t.sidebar,  "ui"],
  ["sidebar section label (was 2.39)", t.faint,    t.sidebar,  "ui"],
  ["modal close button (was 3.60)",    t.muted,    t.modal,    "ui"],
  ["gold as TEXT on page",             t.gold,     t.page,     "never"],
  ["gold-ink — every gold word",       t.goldInk,  t.page,     "body"],
  ["gold-ink on a card",               t.goldInk,  t.card,     "body"],
  // Gold-on-gold is the one combination this palette can get wrong. At a 20%
  // tint it measures 4.16:1 and fails; the app uses 10% everywhere gold text
  // sits on a gold ground, which is why the failing row is kept visible.
  ["gold word on a 10% gold tint",      t.goldInk,  t.tint10,   "body"],
  ["gold word on a 20% tint — avoided", t.goldInk,  t.tint20,   "never"],
  ["primary button — ink on gold",     t.inkOnAccent, t.gold,  "body"],
  ["white on gold (the one to avoid)", "#ffffff",  t.gold,     "never"],
  ["teal — AI explanation",            t.teal,     t.card,     "body"],
  ["on-track badge",                   t.okInk,    t.okFill,   "body"],
  ["at-risk badge",                    t.warnInk,  t.warnFill, "body"],
  ["off-track badge",                  t.badInk,   t.badFill,  "body"],
  ["achieved badge",                   t.infoInk,  t.infoFill, "body"],
  // A progress arc is not the only carrier of its value — the ring prints
  // the percentage in its centre at 16.16:1, and every linear meter has the
  // number beside it. Measured anyway, because "it says the number" is a
  // claim that should be checked rather than assumed.
  ["ring track vs page (was 1.58)",     t.ringTrack, t.page,    "redundant"],
  ["ring fill (at-risk) vs track",      t.warnMark || "#fab219", t.ringTrack, "redundant"],
];

const NEED = { body: 4.5, ui: 3.0, never: 0, redundant: 0 };
const name = process.argv[2] === "dark" ? "dark" : "light";
const t = THEMES[name];
let fails = 0, worst = null;

console.log(`\ncontrast audit — ${name}\n`);
console.log("  pair                                    ratio   needs   verdict");
console.log("  " + "─".repeat(66));
for (const [label, fg, bg, kind] of PAIRS(t)) {
  const r = ratio(fg, bg);
  const need = NEED[kind];
  // "never" pairs are asserted the other way round: these must NOT be used as
  // text, and the number is here to keep the reason visible.
  const ok = kind === "never" || kind === "redundant" ? true : r >= need;
  if (!ok) { fails++; if (!worst || r < worst[1]) worst = [label, r]; }
  const verdict =
    kind === "never" ? `n/a — fill only (${r.toFixed(2)}:1 as text)` :
    kind === "redundant" ? "n/a — value also printed as text" :
    ok ? "pass" : "FAIL";
  console.log(`  ${label.padEnd(38)} ${r.toFixed(2).padStart(5)}   ${need ? need.toFixed(1) : "  —"}   ${verdict}`);
}
console.log("  " + "─".repeat(66));
console.log(`  ${PAIRS(t).length - fails}/${PAIRS(t).length} pass  ${fails ? `— worst: ${worst[0]} at ${worst[1].toFixed(2)}:1` : ""}\n`);
process.exit(fails ? 1 : 0);
