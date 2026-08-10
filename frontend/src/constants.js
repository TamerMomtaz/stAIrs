// Build-time, so a deployment can be pointed at a different backend without a
// code change. The default is the current production API, so nothing moves
// today — but preview deployments are no longer nailed to production data, and
// can be repointed at a staging backend as soon as one exists.
export const API = import.meta.env.VITE_API_URL || "https://stairs-production.up.railway.app";

// Every colour here now reads a token from tokens.css rather than holding a
// literal. The names are unchanged so the ~200 call sites keep working, but
// they resolve per theme: `GOLD` is whatever the active theme calls the
// accent, not #B8904A. A theme change is a variable swap; nothing below moves.
export const GOLD = "var(--accent)";
export const GOLD_L = "var(--accent-hi)";
// Gold as TEXT is a separate role. On a light ground the accent is a 2.78:1
// fill and must never carry a label, so the light theme points this at a
// darker cut while GOLD stays the fill.
export const GOLD_INK = "var(--accent-ink)";
export const TEAL = "var(--accent-teal)";
export const CHAMPAGNE = "var(--accent-champagne)";
// The pale gold behind a meter track or a gold tint. A fill, like GOLD.
export const GOLD_SOFT = "var(--accent-soft)";
// The welcome slideshow's own, brighter gold. Kept distinct on purpose —
// see the note in tokens.css.
export const ACCENT_BRIGHT = "var(--accent-bright)";
export const ACCENT_BRIGHT_HI = "var(--accent-bright-hi)";
export const DEEPEST = "var(--surface-app-deep)";
export const DEEP = "var(--surface-app)";
export const DEEP_MID = "var(--surface-app-mid)";
export const BORDER = "var(--border)";
export const BORDER_STRONG = "var(--border-strong)";
export const INK_ON_ACCENT = "var(--ink-on-accent)";

// Surfaces that sit above the page. Each is one role rather than one rgba()
// repeated in whichever component happens to draw it.
export const MODAL_SURFACE = "var(--surface-modal)";
export const SIDEBAR_SURFACE = "var(--surface-sidebar)";
export const DROPDOWN_SURFACE = "var(--surface-dropdown)";
export const INPUT_SURFACE = "var(--surface-input)";
export const SCRIM = "var(--scrim)";
export const SCRIM_STRONG = "var(--scrim-strong)";
// Composite shadows build their own colour: `0 8px 30px ${cast(0.4)}`.
export const cast = (alpha) => `rgb(var(--shadow-rgb) / ${alpha})`;

// Ink, for the inline styles and SVG fills that can't take a class.
export const INK = "var(--ink)";
export const INK_2 = "var(--ink-2)";
export const INK_3 = "var(--ink-3)";
export const INK_MUTED = "var(--ink-muted)";
export const INK_FAINT = "var(--ink-faint)";
export const INK_GHOST = "var(--ink-ghost)";
export const RAISED = "rgb(var(--surface-raised-rgb))";
export const SUNKEN = "var(--surface-sunken)";

// Health and status. One colour per state; the fill/line/ink cuts live as
// Tailwind utilities (bg-ok-fill, border-ok-line, text-ok-ink).
export const OK = "var(--ok)";
export const WARN = "var(--warn)";
export const BAD = "var(--bad)";
export const INFO = "var(--info)";
export const OK_INK = "var(--ok-ink)";
export const WARN_INK = "var(--warn-ink)";
export const BAD_INK = "var(--bad-ink)";
export const INFO_INK = "var(--info-ink)";
export const healthColors = { on_track: OK, at_risk: WARN, off_track: BAD, achieved: INFO };

// The categorical palette. Charts, quadrants and the local type maps draw
// from this rather than from hex, so the whole chart set retunes in one
// place when the ground changes from navy to paper.
export const HUE = {
  blue: "var(--hue-blue)", green: "var(--hue-green)", amber: "var(--hue-amber)",
  red: "var(--hue-red)", violet: "var(--hue-violet)", slate: "var(--hue-slate)",
  pink: "var(--hue-pink)", orange: "var(--hue-orange)", cyan: "var(--hue-cyan)",
  lime: "var(--hue-lime)", indigo: "var(--hue-indigo)", teal: "var(--hue-teal)",
};

// Tints of the accent. The codebase used to build these by string-concatenating
// a hex alpha suffix — `${tint(GOLD, 20)}` — which stops working the moment GOLD is a
// variable. This does the same job in a form that survives theming.
export const goldTint = (alpha) => `rgb(var(--accent-rgb) / ${alpha})`;

// The codebase tinted colours by concatenating a hex alpha suffix onto a hex
// string — `${tint(GOLD, 20)}`. That only ever worked because the base was a literal;
// it produces "var(--accent)33" the moment the base is a token. color-mix
// accepts a hex, a var() or any other colour, so one form covers the
// tokenised accents and the colours that still arrive from the database.
// A shade from the Tailwind palette, read as a token. For the handful of
// inline styles that need an exact ramp value the roles do not cover.
export const pal = (shade) => `var(--pal-${shade})`;
export const tint = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
// Gradients. 45 of the 49 sites were the same gold pair written out longhand;
// as one token the pair can't drift, and stage 3 changes it once.
export const GRAD_ACCENT = "var(--grad-accent)";
export const GRAD_ACCENT_90 = "var(--grad-accent-90)";
export const GRAD_VIOLET = "var(--grad-violet)";
export const GRAD_VIOLET_90 = "var(--grad-violet-90)";
export const GRAD_INDIGO = "var(--grad-indigo)";
export const GRAD_AMBER = "var(--grad-amber)";
export const GRAD_BLUE = "var(--grad-blue)";
export const GRAD_TEAL = "var(--grad-teal)";
export const GRAD_ACCENT_BRIGHT = "var(--grad-accent-bright)";
export const GRAD_ACCENT_BRIGHT_90 = "var(--grad-accent-bright-90)";
// The wordmark is type, not a fill. Its own pointer so repainting one does
// not drag the other with it.
export const GRAD_WORDMARK = "var(--grad-wordmark)";

// The elevation scale. Dark spends nothing on it — its ground is dark
// enough that a border reads as a lift. Paper cannot do that, so a card
// on light is white + warm border + shadow-1, and glass() applies it.
export const SHADOW_1 = "var(--shadow-1)";
export const SHADOW_2 = "var(--shadow-2)";
export const SHADOW_SM = "var(--shadow-sm)";
export const SHADOW_MD = "var(--shadow-md)";
export const SHADOW_LG = "var(--shadow-lg)";

// The two type stacks, in one place. Each names its metric-matched fallback
// (declared in fonts.css) so the frame before the webfont lands occupies the
// same space as the real face and nothing reflows. The Arabic stack keeps
// DM Sans behind Noto Kufi Arabic, because Noto Kufi ships only the Arabic
// subset — Latin inside an Arabic screen (element codes, numerals, product
// names) stays in the UI face instead of dropping to a generic sans.
export const FONT_UI = "'DM Sans', 'DM Sans Fallback', system-ui, -apple-system, sans-serif";
export const FONT_UI_AR = "'Noto Kufi Arabic', 'DM Sans', 'DM Sans Fallback', system-ui, sans-serif";
// Noto Kufi sits in the display stack too. Instrument Serif has no Arabic
// glyphs, so without it an Arabic heading falls past the Latin display faces
// all the way to a generic serif — the wrong typeface entirely. Latin is
// unaffected: Instrument Serif matches first, and the browser only falls
// through per-glyph.
export const FONT_DISPLAY = "'Instrument Serif', 'Instrument Serif Fallback', 'Noto Kufi Arabic', Georgia, serif";
export const fontStack = (isAr) => (isAr ? FONT_UI_AR : FONT_UI);

export const typeColors = { vision: "var(--type-vision)", objective: "var(--type-objective)", key_result: "var(--type-key-result)", initiative: "var(--type-initiative)", task: "var(--type-task)", perspective: "var(--type-perspective)", strategic_objective: "var(--type-objective)", measure: "var(--type-measure)", kpi: "var(--type-kpi)", goal: "var(--type-goal)", strategy: "var(--type-vision)" };
export const typeIcons = { vision: "◆", objective: "▣", key_result: "◎", initiative: "▶", task: "•", perspective: "◈", strategic_objective: "▢", measure: "◉", kpi: "◎", goal: "▣", strategy: "◆" };
export const typeLabels = { vision: "Vision", objective: "Objective", key_result: "Key Result", initiative: "Initiative", task: "Task" };
export const typeLabelsAr = { vision: "الرؤية", objective: "الهدف", key_result: "نتيجة رئيسية", initiative: "مبادرة", task: "مهمة" };
// 67 call sites. The opacity argument is preserved, so every existing
// glass(0.4) keeps its relative weight while the underlying surface changes
// with the theme.
// 67 call sites. On dark the opacity argument is the whole effect — a
// translucent panel over a near-black gradient. On paper a translucent
// card is not a card, so --glass-lift raises every one of them to solid
// white and the border and shadow carry the elevation instead. The
// argument is still honoured in dark, so nothing there moves.
export const glass = (op = 0.6) => ({
  background: `color-mix(in srgb, rgb(var(--surface-raised-rgb)) calc(${Math.round(op * 100)}% + var(--glass-lift)), transparent)`,
  border: `1px solid ${BORDER}`,
  boxShadow: SHADOW_1,
});
// Everything a <div> needs before an onClick on it counts as a control.
//
// A div with a click handler and nothing else is reachable by mouse and by
// nothing else: a screen reader announces no role, Tab skips it, and Enter
// and Space do nothing. The affordance audit calls that category C, and it
// found eight of them — the staircase expand row, the strategy card, the
// dashboard tile, the conversation item, the wizard dropzone.
//
// Spread it: <div {...clickable(open, { label: "Open the room" })}>. The
// cursor comes free, because index.css gives [role="button"] a pointer.
export const clickable = (onClick, { label, disabled = false } = {}) => ({
  role: "button",
  tabIndex: disabled ? -1 : 0,
  "aria-label": label,
  "aria-disabled": disabled || undefined,
  onClick: disabled ? undefined : onClick,
  onKeyDown: disabled ? undefined : (e) => {
    // Space scrolls the page unless you stop it, which is why a real button
    // is always the better answer where the markup allows one.
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); }
  },
});

export const inputCls = "w-full px-4 py-3.5 rounded-xl bg-input border border-hairline-strong text-ink text-[15px] placeholder-ink-faint focus:border-accent/45 focus:ring-2 focus:ring-accent/10 focus:outline-none transition";
export const labelCls = "text-ink-3 text-[11px] uppercase tracking-[0.12em] mb-2 block font-medium";
