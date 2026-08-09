/* Contrast maths, shared by the two audits.

   scripts/contrast-audit.mjs asks "is the PALETTE sound" — it measures a
   hand-written list of role pairs. scripts/control-contrast.mjs asks "does
   the APP use it soundly" — it measures the pairs the components actually
   paint. Both need the same WCAG relative-luminance maths, and a second copy
   of it is a second thing to get wrong. */

export const hex = (h) => {
  h = h.replace("#", "").trim();
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
export const rgb = (c) => (Array.isArray(c) ? c : hex(c));
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const lum = (v) => 0.2126 * lin(v[0]) + 0.7152 * lin(v[1]) + 0.0722 * lin(v[2]);
export const ratio = (a, b) => {
  const [l1, l2] = [lum(rgb(a)), lum(rgb(b))];
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};
// what a translucent colour actually resolves to once it is over something
export const over = (fg, alpha, bg) =>
  rgb(bg).map((b, i) => Math.round(rgb(fg)[i] * alpha + b * (1 - alpha)));
export const toHex = (v) => "#" + rgb(v).map((c) => c.toString(16).padStart(2, "0")).join("");
