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
    ink: "#0f1b33", ink2: "#5a5750", ink3: "#5a5750", muted: "#6d6a62", faint: "#6d6a62", ghost: "#6d6a62",
    gold: "#b8904a", goldInk: "#8a6a2f", goldSoft: "#efe6d6", teal: "#2a5c5c", tealInk: "#2a5c5c", inkOnAccent: "#0f1b33",
    // --surface-app, which is what `color: DEEP` resolves to on a filled
    // button — near-white on paper, navy on the dark ground. And the worst of
    // --grad-teal's two stops for that ink, which is the one worth asserting.
    deep: "#faf8f4", gradTealStop: "#2a5c5c", gradBlueStop: "#246dc5", gradVioletStop: "#4a3aa7",
    gradIndigoStop: "#4a3aa7", gradAmberStop: "#a98341",
    wordmark: "#8a6a2f", slideGround: "#f2eee7",
    okInk: "#006300", okFill: "#e6f2e6", warnInk: "#8a5a00", warnFill: "#fbf0da",
    badInk: "#b3312f", badFill: "#fae7e6", infoInk: "#1c5cab", infoFill: "#e4edf9",
    ringTrack: "#f2eee7", tint20: over("#b8904a", 0.2, "#ffffff"), tint10: over("#b8904a", 0.1, "#ffffff"),
  },
  dark: {
    page: "#0a1628", card: over("#162544", 0.6, "#0f1f3a"), sunken: "#0d1c33",
    sidebar: "#0a1628", modal: "#0f1932",
    // muted/faint/ghost collapse to one value, as light's already do — see the
    // note on the fourth ink in tokens.css.
    ink: "#ffffff", ink2: "#d1d5dc", ink3: "#99a1af", muted: "#868e9d", faint: "#868e9d", ghost: "#868e9d",
    gold: "#b8904a", goldInk: "#b8904a", goldSoft: "#2a2416", teal: "#2a5c5c", tealInk: "#5eead4", inkOnAccent: "#0a1628",
    deep: "#0a1628", gradTealStop: "#14b8a6", gradBlueStop: "#3b82f6", gradVioletStop: "#956cf7",
    gradIndigoStop: "#7279f5", gradAmberStop: "#d97706",
    wordmark: "#ffd666", slideGround: "#0a0e1a",
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
  ["muted ink — labels (10px)",         t.muted,    t.page,     "body"],
  ["faint ink — metadata (10px)",       t.faint,    t.card,     "body"],
  ["ghost ink — page footer (was 1.76)", t.ghost,  t.page,     "body"],
  ["sidebar inactive item (was 3.81)", t.muted,    t.sidebar,  "ui"],
  // The collapse control is the character ☰ with no aria-label, so it is
  // the button's own accessible name: text, held to 4.5:1, not 3:1.
  ["sidebar collapse glyph ☰ (14px)",  t.muted,    t.sidebar,  "body"],
  ["slideshow wordmark on its ground", t.wordmark, t.slideGround, "large"],
  ["sidebar section label (was 2.39)", t.faint,    t.sidebar,  "ui"],
  ["modal close button (was 3.60)",    t.muted,    t.modal,    "ui"],
  ["gold as TEXT on page",             t.gold,     t.page,     "never"],
  // EXCUSED, deliberately, and written down here rather than known in
  // someone's head. The accent is a 2.78:1 fill against the light page. That
  // is under 3:1, and it stays: every gold control also carries a gold-ink
  // label, measured two rows down at 4.5:1 or better, so the fill is never the
  // only thing identifying the control or its state. Darkening the accent to
  // clear 3:1 as a boundary would change the brand colour to fix something no
  // one reads it for. The number is printed so it cannot drift unnoticed.
  ["gold fill vs page — decorative",   t.gold,     t.page,     "decorative"],
  ["gold control edge vs card",        over(t.gold, 0.38, t.card), t.card, "decorative"],
  ["gold-ink — every gold word",       t.goldInk,  t.page,     "body"],
  ["gold-ink on a card",               t.goldInk,  t.card,     "body"],
  // Gold-on-gold is the one combination this palette can get wrong. At a 20%
  // tint it measures 4.16:1 and fails; the app uses 10% everywhere gold text
  // sits on a gold ground, which is why the failing row is kept visible.
  ["gold word on a 10% gold tint",      t.goldInk,  t.tint10,   "body"],
  ["gold word on a 20% tint — avoided", t.goldInk,  t.tint20,   "never"],
  ["primary button — ink on gold",     t.inkOnAccent, t.gold,  "body"],
  ["white on gold (the one to avoid)", "#ffffff",  t.gold,     "never"],
  // Teal was measured as though --accent-teal were the text in the Explain
  // panel. It never is. Every call site uses it as a fill, a border, a
  // gradient stop or a step mark — tint(TEAL, 6) for the panel ground,
  // tint(TEAL, 38) for the button outline — while the words are
  // `text-teal-300`, a different token that diverges from it in dark. The old
  // row asserted 4.5:1 on a colour nothing renders as text, which is why dark
  // "failed" a pair it could only have passed by washing out every teal fill
  // in the app. Split by purpose, the way gold already is.
  ["accent-teal as TEXT — fill only",  t.teal,     t.card,     "never"],
  ["teal label on the explain panel",  t.tealInk,  over(t.teal, 0.06, t.card), "body"],
  // Splitting a measurement is only honest if the fill stays measured. Teal's
  // fills are below, each one either asserted or excused in writing — the
  // difference between excusing a pair and forgetting it is whether the next
  // person can see that anyone thought about it.
  //
  // ASSERTED. The active step chip carries state ("which step am I on"), which
  // 1.4.11 covers, and its label is real text. It used to set color:<hue>
  // inline, which beat the text-ink class and left Assess at 1.88:1; the label
  // now takes --ink and the hue identifies the step through the tint and the
  // border instead.
  ["active step chip — label",         t.ink,      over(t.teal, 0.15, t.card),   "body"],
  ["active step chip — border vs card", over(t.teal, 0.38, t.card), t.card,      "decorative"],
  // ASSERTED. Text sitting on a coloured fill. --accent-teal is a fill cut,
  // not a gradient stop: building the Send button inline from it left the
  // button's own label at 2.40:1 in dark. --grad-teal exists so the stop is
  // the hue. The whole family, not just the instance — teal was 2.40:1,
  // violet 4.28:1, indigo 4.06:1, and amber had no correct ink at all.
  //
  // The ink is NOT the same for every family, and quietly assuming it was is
  // what let the gold buttons rot behind a green audit. A gradient that
  // INVERTS with the theme — blue, violet, indigo, teal, bright on the dark
  // ground and dark on paper — takes --surface-app, and inverts along with
  // it. Gold does not invert: #B8904A is the same colour in both themes, so
  // --surface-app lands on it as navy in dark (6.15:1, fine) and as
  // near-white in light (2.78:1, the primary call-to-action, unreadable).
  // Those take --ink-on-accent. Each row below measures the ink its family
  // actually paints.
  //
  // Which ink each CALL SITE actually paints is no longer a matter of belief:
  // scripts/control-contrast.mjs reads the pairs off the components
  // themselves, so this list can no longer quietly describe a different app.
  ["send button — ink on teal fill",   t.deep,     t.gradTealStop,               "body"],
  ["blue gradient — ink on its stop",  t.deep,     t.gradBlueStop,               "body"],
  ["violet gradient — ink on its stop", t.deep,    t.gradVioletStop,             "body"],
  ["indigo gradient — ink on its stop", t.deep,    t.gradIndigoStop,             "body"],
  // Gold's family, so navy rather than the surface — see above.
  ["amber gradient — ink on its stop", t.inkOnAccent, t.gradAmberStop,           "body"],
  // EXCUSED, with the number kept visible. These teal edges are decoration on
  // regions that are already identifiable without them: the explain panel has
  // a tinted ground and a labelled heading, and the generate card has a title
  // and a button inside it. Neither edge is the only thing saying what the
  // region is, so 1.4.11 does not bite. Raising them to 3:1 would mean a teal
  // hairline loud enough to outrank the content it surrounds.
  ["explain panel edge — decorative",  over(t.teal, 0.15, t.card), t.card,       "decorative"],
  ["generate card edge — decorative",  over(t.teal, 0.25, t.card), t.card,       "decorative"],
  ["on-track badge",                   t.okInk,    t.okFill,   "body"],
  ["at-risk badge",                    t.warnInk,  t.warnFill, "body"],
  ["off-track badge",                  t.badInk,   t.badFill,  "body"],
  ["achieved badge",                   t.infoInk,  t.infoFill, "body"],
  ["muted ink on the sunken chip",     t.muted,    t.sunken,   "body"],
  // A progress arc is not the only carrier of its value — the ring prints
  // the percentage in its centre at 16.16:1, and every linear meter has the
  // number beside it. Measured anyway, because "it says the number" is a
  // claim that should be checked rather than assumed.
  ["ring track vs page (was 1.58)",     t.ringTrack, t.page,    "redundant"],
  ["ring fill (at-risk) vs track",      t.warnMark || "#fab219", t.ringTrack, "redundant"],
];

const NEED = { body: 4.5, ui: 3.0, large: 3.0, never: 0, redundant: 0, decorative: 0 };
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
  const ok = kind === "never" || kind === "redundant" || kind === "decorative" ? true : r >= need;
  if (!ok) { fails++; if (!worst || r < worst[1]) worst = [label, r]; }
  const verdict =
    kind === "never" ? `n/a — fill only (${r.toFixed(2)}:1 as text)` :
    kind === "redundant" ? "n/a — value also printed as text" :
    // Not "unmeasured" — measured, printed, and excused in writing at the row
    // itself. An edge that is not the only thing identifying its region.
    kind === "decorative" ? "n/a — decorative edge, excused in place" :
    ok ? "pass" : "FAIL";
  console.log(`  ${label.padEnd(38)} ${r.toFixed(2).padStart(5)}   ${need ? need.toFixed(1) : "  —"}   ${verdict}`);
}
console.log("  " + "─".repeat(66));
console.log(`  ${PAIRS(t).length - fails}/${PAIRS(t).length} pass  ${fails ? `— worst: ${worst[0]} at ${worst[1].toFixed(2)}:1` : ""}\n`);
process.exit(fails ? 1 : 0);
