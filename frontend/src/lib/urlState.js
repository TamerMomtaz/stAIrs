/* ═══════════════════════════════════════════════════════════════════
   Stairs — where you are, in the URL

   Until now the app had no routing of any kind. Five navigations left the
   URL at `/`, `history.length` never grew, Back walked you out of the
   product, and a refresh inside the Execution Room dropped you at the
   strategy picker three clicks from where you were. Nothing was lost —
   #60 put the work on the server — but your PLACE was, every time.

   THE SHAPE

     #/                                  the strategy picker
     #/s/<strategyId>/<view>             a strategy, open at one of its views
     #/s/<strategyId>/room/<stairId>     the Execution Room, over that step

   HASH, NOT PATHS. Two reasons, both practical. Path routing needs a
   catch-all rewrite on Railway and on Vercel, and getting that wrong is a
   404 on every deep link. And `/?reset=<token>` and `/?invite=<token>`
   links are already in the wild — the hash sits after the query string and
   leaves both untouched.

   ONE SOURCE OF TRUTH. The hash is it. There is deliberately no
   localStorage mirror of the active strategy: there used to be one
   (`StrategyAPI.setActive`), it was written in two places, and across 124
   commits it was never once read. A second source of truth is a future
   bug, not insurance.

   WHAT IS NOT IN HERE. Modals. `showEditor` and `matrixToolkit` are not
   places, and Back should not close a dialog.
   ═══════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";

export const DEFAULT_VIEW = "dashboard";

/* The views that may appear in a URL. A hash naming anything else is
   treated as a typo and falls back to the default rather than rendering an
   empty shell — an unknown view is a bad link, not an error worth a
   screen. */
export const ROUTABLE_VIEWS = [
  "dashboard", "staircase", "ai", "alerts", "sources", "notes",
  "knowledge", "tools", "execroom", "actionplans", "manifest",
];

const clean = (s) => (s || "").replace(/^#/, "").replace(/^\/+/, "");

export function parseHash(hash) {
  const parts = clean(hash).split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== "s" || !parts[1]) return { strategyId: null, view: DEFAULT_VIEW, roomStairId: null };
  const strategyId = parts[1];
  if (parts[2] === "room") {
    // A room link without a step is meaningless — send it to the picker,
    // which is the screen that answers "which step" anyway.
    return { strategyId, view: "execroom", roomStairId: parts[3] || null };
  }
  const view = ROUTABLE_VIEWS.includes(parts[2]) ? parts[2] : DEFAULT_VIEW;
  return { strategyId, view, roomStairId: null };
}

export function formatHash({ strategyId, view, roomStairId }) {
  if (!strategyId) return "#/";
  const id = encodeURIComponent(strategyId);
  if (roomStairId) return `#/s/${id}/room/${encodeURIComponent(roomStairId)}`;
  return `#/s/${id}/${encodeURIComponent(view || DEFAULT_VIEW)}`;
}

/* pushState, not location.hash — assigning to location.hash also pushes,
   but it fires hashchange asynchronously and there is no way to replace
   rather than push. `replace` matters for the two cases where the app
   corrects the URL rather than the user navigating: a bad view name, and a
   strategy that turned out not to exist. Neither should cost a Back press. */
export function go(next, { replace = false } = {}) {
  const url = formatHash(next);
  if (url === (window.location.hash || "#/")) return;
  const full = window.location.pathname + window.location.search + url;
  if (replace) window.history.replaceState(null, "", full);
  else window.history.pushState(null, "", full);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const read = () => setRoute(parseHash(window.location.hash));
    // hashchange covers our own go(); popstate covers the Back button, which
    // does not fire hashchange when the change came from pushState.
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("popstate", read);
    };
  }, []);
  return route;
}
