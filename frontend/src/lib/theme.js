/* ═══════════════════════════════════════════════════════════════════
   Stairs — theme

   One attribute on <html> selects the whole palette; tokens.css holds
   both sets of values. Nothing else in the app knows which theme is
   active, and that is the point of the token layer — no component reads
   this module, and none should need to.

   The initial value is set synchronously in index.html, before first
   paint, so a returning dark session never flashes light. This module
   only handles changing it afterwards.
   ═══════════════════════════════════════════════════════════════════ */

const KEY = "stairs_theme";

export const getTheme = () =>
  document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

export const setTheme = (theme) => {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem(KEY, next); } catch { /* private mode: the choice lasts the session */ }
  return next;
};

export const toggleTheme = () => setTheme(getTheme() === "dark" ? "light" : "dark");
