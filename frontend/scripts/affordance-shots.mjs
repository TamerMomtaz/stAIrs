#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Stairs — affordance screenshots

   Not part of CI, and not a gate. This exists because jsdom draws
   nothing: the suite can prove a focus ring is DECLARED and the audit
   can prove it is PRESENT, and neither can tell you whether you can see
   it. Two things needed eyes:

     1. the :focus-visible ring, on the warm ground AND the navy one —
        a ring tuned for one often disappears on the other
     2. hover:brightness-110 on a filled gold button, on the warm page,
        where the accent is already only 2.78:1 as a fill

   It drives the REAL built app in Chromium with the network mocked at
   the boundary — the same discipline as the wiring tests, one layer up.

     npm run build && node scripts/affordance-shots.mjs
   ═══════════════════════════════════════════════════════════════════ */

// Playwright is NOT a devDependency, on purpose: its postinstall downloads
// browsers, and every CI job here runs `npm ci`. This is a local instrument,
// run when a change touches something whose failure mode is visual.
//
//   npm i --no-save playwright && npm run build && node scripts/affordance-shots.mjs
let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  console.error("\n  playwright is not installed. This script is deliberately not a\n"
    + "  devDependency — its postinstall pulls browsers, and CI runs npm ci.\n\n"
    + "    npm i --no-save playwright\n");
  process.exit(1);
}
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const OUT = process.env.SHOT_DIR || join(ROOT, "shots");
mkdirSync(OUT, { recursive: true });

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };

// Serve dist/, falling back to index.html so the hash router boots anywhere.
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split("?")[0]);
  for (const candidate of [join(DIST, path), join(DIST, "index.html")]) {
    try {
      const body = await readFile(candidate);
      res.writeHead(200, { "Content-Type": MIME[extname(candidate)] || "application/octet-stream" });
      return res.end(body);
    } catch { /* try the fallback */ }
  }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* ── The fixtures, matching the shapes the app actually reads ─────── */

const USER = { id: "u1", email: "ops@acme.co", full_name: "Ops Lead", role: "admin" };
const STRATEGY = { id: "strat-1", name: "Marketing and Sales", icon: "📈", company: "Acme", industry: "SaaS", color: "#b8904a" };
const TREE = [{
  stair: { id: "stair-1", title: "Grow qualified pipeline 40%", code: "OBJ-2608-A9C9",
    element_type: "objective", health: "at_risk", progress_percent: 45, description: "Lift inbound quality." },
  children: [{
    stair: { id: "stair-2", title: "Publish 12 case studies", code: "INI-2608-B2D1",
      element_type: "initiative", health: "on_track", progress_percent: 70 },
    children: [],
  }],
}];

const ROUTES = {
  "/api/v1/strategies": [STRATEGY],
  "/api/v1/strategies/strat-1": STRATEGY,
  "/api/v1/strategies/strat-1/tree": TREE,
  "/api/v1/ai/provider": { provider: "claude", provider_display: "Claude" },
  "/api/v1/ai/health": {
    provider_display: "Claude", healthy: true, ai_enabled: true, degraded: false,
    active_model: "claude-sonnet-4-20250514", success_rate: 98.5, calls_ok: 197,
    calls_failed: 3, last_error: null, fallback_switches_today: 0,
    providers: { claude: { display_name: "Claude", has_key: true, failures_last_hour: 0 } },
  },
  "/api/v1/dashboard": {}, "/api/v1/alerts": [], "/api/v1/notes": [],
};

const newPage = async (browser, { theme, signedIn = true }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
  await ctx.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = ROUTES[path] ?? (path.endsWith("/count") ? { count: 0 } : []);
    await route.fulfill({ json: body });
  });
  const page = await ctx.newPage();
  await page.addInitScript(([theme, user, signedIn]) => {
    // localStorage only. An init script runs before the document exists, so
    // touching documentElement here throws and silently kills every line
    // after it — which is how the signed-in shots came out as login screens.
    // index.html reads stairs_theme before first paint anyway.
    localStorage.setItem("stairs_theme", theme);
    if (signedIn) {
      localStorage.setItem("stairs_token", "fake.jwt.token");
      localStorage.setItem("stairs_user", JSON.stringify(user));
    }
    // Silence the first-run tutorial and the slideshow; both cover the header.
    localStorage.setItem("stairs_tutorial", JSON.stringify({ completedVersion: 99, completedStepIds: [], featuresUsed: [], dismissed: true }));
    // Keyed per user — stairs_welcome_seen_<id> — and the flat key silently
    // does nothing, leaving the slideshow over everything the shots want.
    localStorage.setItem(`stairs_welcome_seen_${user.id}`, "true");
  }, [theme, USER, signedIn]);
  return { ctx, page };
};

// A ring is two pixels wide. Crop to the focused control plus a margin, or
// the screenshot answers a different question than the one being asked.
const shotFocused = async (page, name, pad = 26) => {
  const box = await page.evaluate((pad) => {
    const r = document.activeElement?.getBoundingClientRect();
    if (!r || !r.width) return null;
    return { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + pad * 2, height: r.height + pad * 2 };
  }, pad);
  if (!box) return;
  await page.screenshot({ path: join(OUT, `${name}.png`), clip: box });
  console.log(`  ${name}.png`);
};

const shot = async (page, name) => {
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${name}.png`);
};

/* What the ring and the fill actually resolve to, measured in the page
   rather than computed from the tokens — this is the number the browser
   painted, not the one the stylesheet asked for. */
const measure = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const page_ = getComputedStyle(document.body).backgroundColor;
  return { outline: cs.outlineColor, outlineWidth: cs.outlineWidth, offset: cs.outlineOffset,
    background: cs.backgroundColor, filter: cs.filter, color: cs.color, page: page_ };
}, selector);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const report = {};

for (const theme of ["light", "dark"]) {
  console.log(`\n── ${theme} ──`);

  /* 1. LOGIN — reachable with no session, and the screen with the most
        inline-styled buttons, so it is where a focus ring is most at risk. */
  {
    const { ctx, page } = await newPage(browser, { theme, signedIn: false });
    await page.goto(`${BASE}/#/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await shot(page, `login-${theme}`);
    // Tab to the first real control and hold focus there.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(600);
    report[`login-${theme}-focus`] = await page.evaluate(() => {
      const el = document.activeElement;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, text: (el.textContent || "").trim().slice(0, 30),
        outlineColor: cs.outlineColor, outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle };
    });
    await shot(page, `login-${theme}-focused`);
    await shotFocused(page, `login-${theme}-focus-crop`);
    await ctx.close();
  }

  /* 2. STAIRCASE — the signed-in case, and where clickable() put role=button
        on a row that never had a focus style of its own. */
  {
    const { ctx, page } = await newPage(browser, { theme });
    await page.goto(`${BASE}/#/s/strat-1/staircase`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await shot(page, `staircase-${theme}`);
    const row = page.locator('[role="button"]').filter({ hasText: "Grow qualified pipeline" }).first();
    if (await row.count()) {
      await row.focus();
      await page.waitForTimeout(600);
      report[`staircase-${theme}-row-focus`] = await measure(page, '[role="button"]:focus');
      await shot(page, `staircase-${theme}-row-focused`);
      await shotFocused(page, `staircase-${theme}-focus-crop`);
    }
    await ctx.close();
  }

  /* 3. THE GOLD BUTTON, hovered — the specific question about
        brightness-110 on a fill that is only 2.78:1 to begin with. */
  {
    const { ctx, page } = await newPage(browser, { theme, signedIn: false });
    await page.goto(`${BASE}/#/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const gold = page.locator("button").filter({ hasText: /Sign In|Log In|Create Account|Sign Up/i }).first();
    if (await gold.count()) {
      report[`gold-${theme}-rest`] = await gold.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { background: cs.backgroundImage || cs.backgroundColor, filter: cs.filter, color: cs.color };
      });
      await gold.hover();
      await page.waitForTimeout(250);
      report[`gold-${theme}-hover`] = await gold.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { background: cs.backgroundImage || cs.backgroundColor, filter: cs.filter, color: cs.color };
      });
      await gold.screenshot({ path: join(OUT, `gold-${theme}-hover.png`) });
      console.log(`  gold-${theme}-hover.png`);
      await shot(page, `gold-${theme}-hover-full`);
    }
    await ctx.close();
  }
}

await browser.close();
server.close();
console.log("\n── measured ──");
console.log(JSON.stringify(report, null, 2));
