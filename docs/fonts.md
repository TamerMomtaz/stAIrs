# Typefaces

Three families are named throughout the app. Until now none of them were
loaded, so every screen rendered in a system fallback — including the Arabic,
which fell to whatever naskh face the OS happened to provide rather than the
Kufi the design specifies.

They are self-hosted in `frontend/public/fonts/` and declared in
`frontend/src/fonts.css`.

| Family | Role | Weights | Subsets shipped |
|---|---|---|---|
| DM Sans | UI text | variable 400–700 | latin, latin-ext |
| Instrument Serif | "Stairs" wordmark, display headings | 400 | latin, latin-ext |
| Noto Kufi Arabic | Arabic UI text | variable 400–700 | arabic |

Source: Google Fonts, fetched as the variable woff2 for each subset — one file
per subset instead of one per weight.

## What a session actually downloads

`unicode-range` keeps each subset off the wire until a glyph in it renders.

| Session | Fetched | Bytes |
|---|---|---|
| English | `dm-sans-latin`, `instrument-serif-latin` | 84 KB |
| Arabic | the above + `noto-kufi-arabic` | 205 KB |
| Either, with accented Latin | + the two `latin-ext` files | + 43 KB |

The two English-path faces are preloaded from `index.html`, so the fetch starts
with the first bytes of the document rather than after the CSS is parsed.
The Arabic face is 124 KB and most sessions never render an Arabic glyph, so it
is preloaded only when `localStorage.stairs_lang === "ar"` — a small inline
script in `index.html` adds the link and sets `<html lang="ar">` on boot.
`StairsApp` keeps `lang` in step when the toggle is used mid-session.

## No flash of unstyled text

Three things in combination:

1. **Same-origin, preloaded** — no third-party DNS or TLS on the critical path,
   and the request is in flight before the stylesheet exists.
2. **`font-display: swap`** — text is never invisible, so there is no FOIT.
3. **Metric-matched fallbacks** — if the swap is ever visible, nothing moves.

The third is what the `DM Sans Fallback` and `Instrument Serif Fallback` faces
in `fonts.css` are for. They wrap a `local()` system font with overrides that
make it occupy exactly the space the real face will.

## Recomputing the metric overrides

The values are measured from the shipped woff2 files, not estimated. If a font
is ever re-subset or updated, recompute them:

```js
// npm i fontkit
const fk = require("fontkit");
const sample = "abcdefghijklmnopqrstuvwxyz";
const m = (path) => {
  const f = fk.openSync(path);
  const r = f.layout(sample);
  return {
    adv: r.glyphs.reduce((a, g, i) => a + r.positions[i].xAdvance, 0) / f.unitsPerEm / 26,
    asc: f.ascent / f.unitsPerEm,
    desc: Math.abs(f.descent) / f.unitsPerEm,
    gap: f.lineGap / f.unitsPerEm,
  };
};
const web = m("public/fonts/dm-sans-latin.woff2");
const fallback = m("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf");
const sizeAdjust = web.adv / fallback.adv;
console.log({
  "size-adjust":       (sizeAdjust * 100).toFixed(2) + "%",
  "ascent-override":   (web.asc / sizeAdjust * 100).toFixed(2) + "%",
  "descent-override":  (web.desc / sizeAdjust * 100).toFixed(2) + "%",
  "line-gap-override": (web.gap / sizeAdjust * 100).toFixed(2) + "%",
});
```

Liberation Sans and Liberation Serif stand in for Arial and Times — they are
metric-compatible by design, and unlike the Microsoft originals they are
available on a build machine.

Current values:

| Fallback face | size-adjust | ascent | descent | line-gap |
|---|---|---|---|---|
| DM Sans Fallback | 107.20% | 92.53% | 28.92% | 0% |
| Instrument Serif Fallback | 84.43% | 117.26% | 36.72% | 0% |

Noto Kufi Arabic has no metric-matched fallback. Arabic system faces vary too
much between platforms for a single override set to help, and there is no
metric-compatible clone to measure against. It relies on the conditional
preload instead.

## Known issue: synthetic bold on the wordmark

Instrument Serif ships **400 only**. Several places ask for a heavier weight:

- `LoginScreen.jsx` — `fontWeight: "bold"` on the 52px wordmark
- `StairsApp.jsx`, `StrategyLanding.jsx` — `font-bold` on the header wordmark
- `WelcomeSlideshow.jsx` — `fontWeight: "800"` on two display headings

The browser synthesises those by smearing the 400 outlines, which on a delicate
display serif reads as slightly muddy. This was invisible before, because the
face was never loading and Georgia — which does have a real bold — was drawing
the wordmark instead.

Two ways out, both a design call rather than a load-time fix:

- drop the weight declarations and let Instrument Serif render at its intended
  400, which is already display-heavy; or
- add a second display face that has a real bold.

Left as-is here so that loading the fonts does not quietly restyle the brand.

## Updating a font file

Files in `public/` are served at a stable path and are not content-hashed, which
is what makes them preloadable from a static `index.html`. If a font is
replaced, change the filename (e.g. `dm-sans-latin-v2.woff2`) and update both
`fonts.css` and the preload tags, so caches cannot serve a stale face.
