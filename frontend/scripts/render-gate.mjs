#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Stairs — render gate

   Everything the other checks cannot see, asserted as numbers.

   The affordance audit reads source and the suite runs in jsdom, so
   between them they can prove a rule is DECLARED, COMPILED and PRESENT
   — and every one of those was true of a focus ring that rendered
   invisible on 13 of 49 controls, because an ancestor's `overflow:
   hidden` clipped it. That took a browser. So does a label's contrast
   against the fill it actually sits on, which is how a near-white label
   survived on a gold button while the contrast audit asserted the right
   pair against the right token and passed: it measures the palette, not
   what the components apply.

   WHY MEASUREMENTS AND NOT SCREENSHOTS. A pixel diff fails on a font
   hint, a scrollbar, a GPU driver — and a job that cries wolf is
   switched off within a week, which costs more than it ever caught.
   Everything below is a number the layout engine computes: geometry,
   composited colour, contrast ratios. Same input, same answer, every
   run. Nothing here compares images.

     node scripts/render-gate.mjs          # assert, exit non-zero on failure
     node scripts/render-gate.mjs --list   # print every measurement

   Playwright is installed by the CI job that runs this, not by the
   repository, so `npm ci` stays clean for the other three jobs.
   ═══════════════════════════════════════════════════════════════════ */

let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  console.error("\n  playwright is not installed — it is not a devDependency on purpose.\n"
    + "    npm i --no-save playwright && npx playwright install --with-deps chromium\n");
  process.exit(1);
}
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const LIST = process.argv.includes("--list");

/* ── Thresholds, and what each one is for ────────────────────────── */

const RING_MIN = 3;      // WCAG 2.4.11: a focus indicator against its ground
const LABEL_MIN = 4.5;   // a button label is text
// NOT an absolute edge threshold. The gold fill is 2.78:1 against the light
// page and the contrast audit excuses that deliberately and in writing: the
// fill never identifies the control on its own, because every gold control
// carries a label measured at 4.5:1 or better. A gate that failed on it would
// be re-litigating a brand decision already made, and a gate that argues with
// a decision gets switched off. What IS asserted is that hovering never makes
// the edge worse than at rest — which is the regression this repo actually
// shipped, brightness-110 taking 2.95:1 down to 2.46:1.
const EDGE_NO_WORSE = 0.98;   // a hair of tolerance for rounding through composites
const TARGET_MIN = 24;   // WCAG 2.5.8: the smallest a control may be

/* ── Serve the built app ─────────────────────────────────────────── */

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split("?")[0]);
  for (const candidate of [join(DIST, path), join(DIST, "index.html")]) {
    try {
      const body = await readFile(candidate);
      res.writeHead(200, { "Content-Type": MIME[extname(candidate)] || "application/octet-stream" });
      return res.end(body);
    } catch { /* fall through to index.html */ }
  }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* ── Fixtures ────────────────────────────────────────────────────── */

const USER = { id: "u1", email: "ops@acme.co", full_name: "Ops Lead", role: "admin" };
const STRATEGY = { id: "strat-1", name: "Marketing and Sales", icon: "📈", company: "Acme", industry: "SaaS" };
const TREE = [{
  stair: { id: "stair-1", title: "Grow qualified pipeline 40%", code: "OBJ-2608-A9C9",
    element_type: "objective", health: "at_risk", progress_percent: 45, description: "Lift inbound quality." },
  children: [],
}];
const ROUTES = {
  "/api/v1/strategies": [STRATEGY],
  "/api/v1/strategies/strat-1": STRATEGY,
  "/api/v1/strategies/strat-1/tree": TREE,
  "/api/v1/ai/provider": { provider: "claude", provider_display: "Claude" },
  "/api/v1/dashboard": {}, "/api/v1/alerts": [],
};
const EMPTY = { ...ROUTES, "/api/v1/strategies": [] };

/* ── Colour, resolved by painting rather than by parsing ─────────── */

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (r) => 0.2126 * lin(r[0]) + 0.7152 * lin(r[1]) + 0.0722 * lin(r[2]);
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
};
const over = (fg, a, bg) => bg.map((v, i) => Math.round(fg[i] * a + v * (1 - a)));

/* getComputedStyle hands back oklab() and colour-mix() unresolved, and a
   translucent colour read off a black canvas is not its colour. Paint it over
   black AND white, then solve: alpha falls out of the difference, the base
   colour out of either. This runs in the page, where the browser's own colour
   pipeline does the conversion. */
const SOLVE = `(css) => {
  const px = (bg) => { const c = document.createElement('canvas'); c.width = c.height = 1;
    const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0,0,1,1);
    x.fillStyle = css; x.fillRect(0,0,1,1);
    const d = x.getImageData(0,0,1,1).data; return [d[0],d[1],d[2]]; };
  const b = px('#000'), w = px('#fff');
  const a = 1 - (w[0] - b[0]) / 255;
  return { rgb: a > 0.004 ? b.map(v => Math.min(255, Math.round(v / a))) : [0,0,0],
           a: Math.round(a * 1000) / 1000 };
}`;

/* What an element is painted ON. Walks up for the first ancestor with a
   non-transparent background, so a contrast figure is against the surface the
   user actually sees behind it rather than against `transparent`. */
const GROUND = `(el, solve) => {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const c = solve(getComputedStyle(n).backgroundColor);
    if (c.a > 0.02) return c;
  }
  return { rgb: [255,255,255], a: 1 };
}`;

const results = [];
const record = (theme, surface, check, value, min, detail) => {
  const pass = value === null ? false : value >= min;
  results.push({ theme, surface, check, value, min, pass, detail });
};

// CI installs the browser this Playwright pins, so the build is fixed there.
// CHROMIUM_PATH lets a machine with one already present skip the download;
// every number below is layout and colour maths, which does not move between
// Chromium builds.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--font-render-hinting=none"],
});

const open = async (theme, routes, hash, signedIn = true) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: routes[path] ?? (path.endsWith("/count") ? { count: 0 } : []) });
  });
  const page = await ctx.newPage();
  await page.addInitScript(([theme, user, signedIn]) => {
    localStorage.setItem("stairs_theme", theme);
    if (signedIn) {
      localStorage.setItem("stairs_token", "fake.jwt.token");
      localStorage.setItem("stairs_user", JSON.stringify(user));
    }
    localStorage.setItem("stairs_tutorial", JSON.stringify({ completedVersion: 99, completedStepIds: [], featuresUsed: [], dismissed: true }));
    localStorage.setItem(`stairs_welcome_seen_${user.id}`, "true");
  }, [theme, USER, signedIn]);
  await page.goto(`${BASE}/${hash}`, { waitUntil: "networkidle" });
  // Settle transitions rather than racing them: a ring measured at 150ms is
  // half drawn, which is how the first pass read 1px on a 2px outline.
  await page.waitForTimeout(700);
  return { ctx, page };
};

for (const theme of ["light", "dark"]) {
  const pageBg = theme === "light" ? [250, 248, 244] : [10, 22, 40];

  /* ── 1. NO FOCUS RING IS CLIPPED ──────────────────────────────────
     Geometry only. A ring drawn outside the control's box is erased by
     any ancestor that clips, and that is invisible to every static check
     — it was true of 13 of 49 controls here. */
  for (const [surface, hash, signedIn, routes] of [
    ["login", "#/", false, EMPTY],
    ["landing", "#/", true, EMPTY],
    ["staircase", "#/s/strat-1/staircase", true, ROUTES],
  ]) {
    const { ctx, page } = await open(theme, routes, hash, signedIn);
    /* How far outside its own box the ring is drawn. Measured from a real
       focused control, not from the stylesheet and not from an unfocused
       element:
         - :focus-visible does not apply until something has focus, so reading
           an unfocused element returns outline-offset: 0 for everything. An
           earlier version of this check did that and reported a clean sweep
           having examined nothing.
         - the CSSOM will not decompose `outline: 2px solid var(--accent-ink)`,
           because a shorthand holding a var() has no parsed longhands, so
           parsing the rule returned 0 for the width just as silently.
       Focusing one control and waiting out the transition gives the number the
       engine actually uses. */
    /* Probe a control that is actually VISIBLE and actually takes focus. The
       first match is not good enough: on the staircase it is the mobile-nav
       toggle, which is md:hidden at this width, so focusing it left
       activeElement on <body> and the ring measured 0 — and reach 0 means
       "inset, nothing to check", so the whole surface passed having examined
       nothing. Being unable to measure is not the same as passing, and the
       final `reach === null` below makes that a failure rather than a shrug. */
    let reach = null;
    const candidates = page.locator('button:visible, [role="button"]:visible, input:visible');
    const n = Math.min(await candidates.count(), 6);
    for (let i = 0; i < n; i++) {
      const el = candidates.nth(i);
      await el.focus().catch(() => {});
      await page.waitForTimeout(450);
      const m = await el.evaluate((e) => {
        if (document.activeElement !== e) return null;
        const cs = getComputedStyle(e);
        return { width: parseFloat(cs.outlineWidth) || 0, offset: parseFloat(cs.outlineOffset) || 0 };
      }).catch(() => null);
      if (m && m.width > 0) { reach = m.offset + m.width; break; }
    }
    await page.evaluate(() => document.activeElement?.blur());
    if (reach === null) {
      record(theme, surface, "rings unclipped", 0, 1, "could not measure a focus ring on any control");
      await ctx.close();
      continue;
    }
    const clipped = await page.evaluate((reach) => {
      const sel = 'button,[role="button"],a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';
      const out = { total: 0, clipped: [], reach };
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        out.total++;
        // A ring drawn inside the border box cannot be reached by an
        // ancestor's clip, so there is nothing to check.
        if (reach <= 0) continue;
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
          const pcs = getComputedStyle(n);
          if (pcs.overflow === "visible" || pcs.overflow === "") continue;
          const pr = n.getBoundingClientRect();
          const room = [r.top - pr.top, r.left - pr.left, pr.right - r.right, pr.bottom - r.bottom];
          if (room.some((v) => v < reach)) {
            out.clipped.push((el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 32));
          }
          break;
        }
      }
      return out;
    }, reach);
    // Expressed as a ratio so it reads like the others: 1 is clean.
    record(theme, surface, "rings unclipped",
      clipped.total ? (clipped.total - clipped.clipped.length) / clipped.total : 1, 1,
      `${clipped.total - clipped.clipped.length}/${clipped.total} ` + (clipped.reach <= 0 ? "(inset)" : `@${clipped.reach}px`) + (clipped.clipped.length ? ` — ${clipped.clipped.slice(0, 4).join(", ")}` : ""));
    await ctx.close();
  }

  /* ── 2. THE RING READS AGAINST THE GROUND IT LANDS ON ─────────────
     Not against a token: against whatever surface is actually behind
     that control. The ring shipped at 1.73:1 on a white field while the
     stylesheet said it cleared 3:1. */
  {
    const { ctx, page } = await open(theme, ROUTES, "#/s/strat-1/staircase");
    const probes = [
      ["staircase row", '[role="button"]'],
      ["header chip", '[data-testid="ai-status-chip"]'],
      ["sidebar item", "nav button"],
      ["theme toggle", '[data-testid="theme-toggle"]'],
    ];
    for (const [name, sel] of probes) {
      const el = page.locator(sel).first();
      if (!(await el.count())) { record(theme, name, "focus ring", null, RING_MIN, "not found"); continue; }
      await el.focus();
      await page.waitForTimeout(400);
      const m = await el.evaluate((e, [solveSrc, groundSrc]) => {
        const solve = eval(solveSrc), ground = eval(groundSrc);
        const cs = getComputedStyle(e);
        const own = solve(cs.backgroundColor);
        return { width: parseFloat(cs.outlineWidth) || 0, ring: solve(cs.outlineColor),
          field: own.a > 0.02 ? own : ground(e, solve) };
      }, [SOLVE, GROUND]);
      if (!m.width) { record(theme, name, "focus ring", 0, RING_MIN, "no outline drawn"); continue; }
      const field = over(m.field.rgb, m.field.a, pageBg);
      const ring = over(m.ring.rgb, m.ring.a, field);
      record(theme, name, "focus ring", contrast(ring, field), RING_MIN, `${m.width}px`);
    }
    // Target size, same trip: a 25x16 control is under the minimum whatever
    // its colours do.
    for (const [name, sel] of probes.slice(1)) {
      const el = page.locator(sel).first();
      if (!(await el.count())) continue;
      const box = await el.boundingBox();
      record(theme, name, "target size", Math.min(box.width, box.height), TARGET_MIN,
        `${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    await ctx.close();
  }

  /* ── 3. FILLED BUTTONS: LABEL AND EDGE, AT REST AND HOVERED ───────
     The label is text and owes 4.5:1 against the fill it sits on. The
     edge owes 3:1 against the page, or the control dissolves into it.
     Both measured hovered too, because a hover that improves one at the
     cost of the other is the trade this application already got wrong. */
  {
    const { ctx, page } = await open(theme, EMPTY, "#/", false);
    const gold = page.getByRole("button", { name: /^Sign In$/i }).last();
    if (await gold.count()) {
      const read = async () => gold.evaluate((e, [solveSrc, groundSrc]) => {
        const solve = eval(solveSrc), ground = eval(groundSrc);
        const cs = getComputedStyle(e);
        // A gradient fill has no single colour; take the stops it declares.
        const stops = (cs.backgroundImage.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/gi) || []).map(solve);
        const flat = solve(cs.backgroundColor);
        const fills = stops.length ? stops : [flat];
        const m = cs.filter.match(/brightness\(([\d.]+)\)/);
        return { label: solve(cs.color), fills, brightness: m ? Number(m[1]) : 1, ground: ground(e, solve) };
      }, [SOLVE, GROUND]);
      let restEdge = null;
      for (const [state, act] of [["rest", async () => {}], ["hover", async () => { await gold.hover(); await page.waitForTimeout(350); }]]) {
        await act();
        const m = await read();
        const b = m.brightness;
        const bright = (c) => c.map((v) => Math.min(255, Math.round(v * b)));
        const ground = over(m.ground.rgb, m.ground.a, pageBg);
        // Worst stop is the one that decides both figures.
        const fills = m.fills.map((f) => bright(over(f.rgb, f.a, ground)));
        const label = over(m.label.rgb, m.label.a, fills[0]);
        const labelWorst = Math.min(...fills.map((f) => contrast(label, f)));
        const edgeWorst = Math.min(...fills.map((f) => contrast(f, ground)));
        record(theme, `gold button (${state})`, "label on fill", labelWorst, LABEL_MIN, `brightness ${b}`);
        if (state === "rest") restEdge = edgeWorst;
        else record(theme, "gold button (hover)", "edge vs rest", edgeWorst / restEdge, EDGE_NO_WORSE,
          `${edgeWorst.toFixed(2)}:1 hovered vs ${restEdge.toFixed(2)}:1 at rest`);
      }
    } else {
      record(theme, "gold button", "label on fill", null, LABEL_MIN, "not found");
    }
    await ctx.close();
  }
}

await browser.close();
server.close();

/* ── Report ──────────────────────────────────────────────────────── */

const pad = (s, n) => String(s).padEnd(n);
const failures = results.filter((r) => !r.pass);

if (LIST || failures.length) {
  console.log(`\n  ${pad("theme", 7)}${pad("surface", 22)}${pad("check", 18)}${pad("measured", 11)}min`);
  console.log(`  ${"─".repeat(72)}`);
  for (const r of results) {
    if (!LIST && r.pass) continue;
    const ratio = r.check === "rings unclipped" || r.check === "edge vs rest";
    const v = r.value === null ? "—" : r.check === "target size" ? `${r.value.toFixed(0)}px`
      : r.check === "rings unclipped" ? r.detail : ratio ? `${r.value.toFixed(2)}x` : `${r.value.toFixed(2)}:1`;
    const m = r.check === "target size" ? `${r.min}px` : r.check === "rings unclipped" ? "all"
      : r.check === "edge vs rest" ? `${r.min}x` : `${r.min}:1`;
    console.log(`  ${r.pass ? " " : "✗"} ${pad(r.theme, 6)}${pad(r.surface, 22)}${pad(r.check, 18)}${pad(v, 11)}${m}${r.detail && r.check !== "rings unclipped" ? `   (${r.detail})` : ""}`);
  }
}

console.log(`\n  ${results.length - failures.length}/${results.length} rendered measurements pass.`);
if (failures.length) {
  console.error(`\n  FAIL — ${failures.length} below threshold. These are measured in Chromium;`);
  console.error(`  no other check in this repository can see them.\n`);
  process.exit(1);
}
console.log("  Nothing the layout engine draws contradicts what the stylesheet claims.\n");
