#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Stairs — affordance audit

   Two lies a screen can tell, and one thing it can leave out:

     A. LOOKS LIKE A CONTROL, ISN'T. A box — background, border, padding,
        rounded corners — or a hover style, on something with no handler,
        no role and no href. The user aims at it and nothing happens.
     B. IS A CONTROL, DOESN'T LOOK IT. A handler on something carrying no
        pointer cursor, no hover state, nothing to separate it from the
        prose beside it.
     C. MOUSE ONLY. A div or span with an onClick and no role, no
        tabIndex and no key handler. Unreachable by keyboard, invisible
        to a screen reader. An accessibility bug, not a polish one.

     node scripts/affordance-audit.mjs              # counts per view
     node scripts/affordance-audit.mjs --list A     # every finding in A
     node scripts/affordance-audit.mjs --list A2a   # one subcategory
     node scripts/affordance-audit.mjs --json

   WHY A PARSER AND NOT A GREP. `onClick` inside a comment, inside a
   string, or on the line above the element it appears to belong to all
   defeat a regex. Every element below comes from a real JSX AST, and
   its handlers are its own attributes, not the ones nearest in the file.

   WHAT THIS CANNOT SEE. A handler that exists and throws is wired as far
   as any parser is concerned — the Manifest chip called a state setter
   that had been deleted and passed every static check we had. Category B
   and C findings are about the *shape* of a control; whether the handler
   survives being called is a question for src/test/appWiring.test.jsx,
   which renders the real app and drives it. Neither check replaces the
   other.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";

const traverse = _traverse.default ?? _traverse;
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SRC = join(ROOT, "src");

/* ── What the browser already treats as a control ───────────────── */

const NATIVE_INTERACTIVE = new Set([
  "button", "a", "input", "select", "textarea", "label",
  "summary", "details", "option", "optgroup",
]);
// Activating one of these IS the interaction. onChange/onSubmit belong to
// form elements that are already controls, so they don't make a div one.
const ACTIVATION = new Set([
  "onClick", "onMouseDown", "onMouseUp", "onPointerDown", "onPointerUp", "onDoubleClick",
]);
const KEY_HANDLERS = new Set(["onKeyDown", "onKeyUp", "onKeyPress"]);

/* ── Theme resolution ────────────────────────────────────────────
   A box is only a box if you can see it. `bg-sunken` is a visible lift
   on paper and a near-invisible one on navy, so "has a background" is
   not a fact about the class — it is a fact about the class in a theme.
   Both themes are resolved from tokens.css rather than a copied table,
   so a retune can't silently invalidate this audit. */

const tokensCss = readFileSync(join(SRC, "tokens.css"), "utf8");

/* Does a base rule hand every button a pointer, or does each one have to
   ask? Tailwind v4's preflight dropped v3's `button { cursor: pointer }`,
   which is how 181 controls came to draw an arrow. index.css puts it back —
   and this reads it rather than assuming it, so deleting that rule makes
   B1 climb back to the number that found the bug instead of staying quiet. */
const baseCss = readFileSync(join(SRC, "index.css"), "utf8");
const CURSOR_BASE_RULE = /button:not\(:disabled\)[^{]*\{[^}]*cursor:\s*pointer/s.test(baseCss);
const ROLE_BUTTON_BASE_RULE = /\[role="button"\]:not\(:disabled\)[^{]*\{[^}]*cursor:\s*pointer/s.test(baseCss);

const declarations = (block) => {
  const out = {};
  for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
};
const blockAfter = (selector) => {
  const at = tokensCss.indexOf(selector);
  if (at < 0) throw new Error(`tokens.css: no ${selector}`);
  const open = tokensCss.indexOf("{", at);
  let depth = 0, i = open;
  for (; i < tokensCss.length; i++) {
    if (tokensCss[i] === "{") depth++;
    else if (tokensCss[i] === "}" && --depth === 0) break;
  }
  return tokensCss.slice(open + 1, i);
};

const THEME_VARS = {
  dark: declarations(blockAfter(':root,\n:root[data-theme="dark"]')),
  light: declarations(blockAfter(':root[data-theme="light"]')),
};
// Tailwind's utilities point at the roles; the roles point at the values.
const UTILITY_VARS = declarations(blockAfter("@theme inline"));
// Light overrides dark rather than replacing it — anything it doesn't
// restate keeps the dark value, exactly as the cascade does it.
THEME_VARS.light = { ...THEME_VARS.dark, ...THEME_VARS.light };

const hexToRgb = (h) => {
  h = h.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const contrast = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)];
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};
const over = (fg, alpha, bg) => bg.map((b, i) => Math.round(fg[i] * alpha + b * (1 - alpha)));

// Resolve a CSS value to [r,g,b,a], chasing var() through the theme.
const resolveColor = (value, theme, depth = 0) => {
  if (!value || depth > 8) return null;
  const v = value.trim();

  let m = v.match(/^var\((--[\w-]+)(?:\s*,\s*(.+))?\)$/);
  if (m) {
    const next = THEME_VARS[theme][m[1]] ?? UTILITY_VARS[m[1]] ?? m[2];
    return resolveColor(next, theme, depth + 1);
  }
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return [...hexToRgb(v), 1];

  // rgb(var(--x-rgb) / 0.4) and rgb(var(--x-rgb))
  m = v.match(/^rgba?\(\s*var\((--[\w-]+)\)\s*(?:\/\s*([\d.]+))?\s*\)$/);
  if (m) {
    const triplet = THEME_VARS[theme][m[1]] ?? UTILITY_VARS[m[1]];
    if (!triplet) return null;
    const parts = triplet.trim().split(/[\s,]+/).map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    return [...parts.slice(0, 3), m[2] ? Number(m[2]) : 1];
  }
  m = v.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && !parts.slice(0, 3).some(Number.isNaN)) {
      return [...parts.slice(0, 3), parts.length > 3 ? parts[3] : 1];
    }
  }
  return null;
};

// The colour a `bg-x` / `border-x` utility actually paints, composited
// onto the page, plus how far that lands from the page itself.
const utilityColor = (name, theme) => {
  const decl = UTILITY_VARS[`--color-${name}`];
  if (!decl) return null;
  const c = resolveColor(decl, theme);
  if (!c) return null;
  const page = resolveColor(THEME_VARS[theme]["--surface-app"], theme) ?? [0, 0, 0, 1];
  const composited = c[3] < 1 ? over(c.slice(0, 3), c[3], page.slice(0, 3)) : c.slice(0, 3);
  return { rgb: composited, vsPage: contrast(composited, page.slice(0, 3)) };
};

// A fill or line reads as a distinct surface at about 1.05:1 against the
// page. Below that it is the same colour with extra steps.
const VISIBLE = 1.05;

/* ── Class vocabulary ────────────────────────────────────────────── */

const BG = /^bg-(?!transparent$|clip-|gradient|none$|\[)([\w-]+?)(?:\/\d+)?$/;
const BORDER_COLOR = /^border-(?!\[)(?:[xytrbl]-)?([a-z][\w-]*?)(?:\/\d+)?$/;
const BORDER_WIDTH = /^border(?:-[xytrbl])?(?:-\d+)?$/;
const PADDING = /^p[xytrbl]?-/;
const ROUNDED = /^rounded/;
const HOVER = /^hover:/;
// The neutral surface roles — the vocabulary the app's real controls are
// built from. A pill wearing these is wearing a button's clothes. A pill
// wearing a status colour or a tinted wash is a badge, which is a
// recognised non-interactive convention: the colour is the information.
const NEUTRAL_FILL = /^(sunken|raised|app|input|dropdown|modal|sidebar)$/;

/* ── Static evaluation of className / style ──────────────────────── */

// A handler whose whole body is e.stopPropagation() is not a control. It is
// a wall, stopping a click from reaching the backdrop underneath, and it
// wants no cursor, no hover and no keyboard route of its own.
const isStopPropagation = (value) => {
  const expr = value?.type === "JSXExpressionContainer" ? value.expression : value;
  if (expr?.type !== "ArrowFunctionExpression") return false;
  const { body } = expr;
  const call = body.type === "CallExpression" ? body
    : body.type === "BlockStatement" && body.body.length === 1 && body.body[0].type === "ExpressionStatement"
      ? body.body[0].expression
      : null;
  return call?.type === "CallExpression" && call.callee?.property?.name === "stopPropagation";
};

// The union of every class the element can carry. A hover style behind a
// ternary is still a hover style — the branch it hides in doesn't matter.
const classesOf = (node, acc = []) => {
  if (!node) return acc;
  switch (node.type) {
    case "StringLiteral": acc.push(...node.value.split(/\s+/).filter(Boolean)); break;
    case "TemplateLiteral":
      node.quasis.forEach((q) => acc.push(...q.value.cooked.split(/\s+/).filter(Boolean)));
      node.expressions.forEach((e) => classesOf(e, acc));
      break;
    case "ConditionalExpression": classesOf(node.consequent, acc); classesOf(node.alternate, acc); break;
    case "LogicalExpression": classesOf(node.left, acc); classesOf(node.right, acc); break;
    case "BinaryExpression": classesOf(node.left, acc); classesOf(node.right, acc); break;
    case "JSXExpressionContainer": classesOf(node.expression, acc); break;
    // A helper call — inputCls and friends. Named so the report can say so
    // rather than pretending the element has no classes at all.
    case "Identifier": acc.push(`@${node.name}`); break;
    case "CallExpression":
      if (node.callee.type === "Identifier") acc.push(`@${node.callee.name}()`);
      break;
  }
  return acc;
};

// Which CSS properties an inline style sets. glass() returns background +
// border + boxShadow, so spreading it is spreading a box.
const styleOf = (node, acc = new Set()) => {
  if (!node) return acc;
  if (node.type === "JSXExpressionContainer") return styleOf(node.expression, acc);
  if (node.type === "ConditionalExpression") { styleOf(node.consequent, acc); return styleOf(node.alternate, acc); }
  if (node.type === "LogicalExpression") { styleOf(node.left, acc); return styleOf(node.right, acc); }
  if (node.type !== "ObjectExpression") return acc;
  for (const p of node.properties) {
    if (p.type === "SpreadElement") {
      const callee = p.argument?.callee;
      if (callee?.name === "glass") { acc.add("background"); acc.add("border"); }
      else acc.add("?spread");
    } else if (p.key) {
      // A computed key — style={{ [side]: 0 }} — names no property we can read.
      acc.add(p.key.name ?? p.key.value ?? "?computed");
    }
  }
  return acc;
};

/* ── Walk every view ─────────────────────────────────────────────── */

const jsxFiles = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "test" && entry !== "node_modules") jsxFiles(full, out);
    } else if (entry.endsWith(".jsx")) out.push(full);
  }
  return out;
};

const findings = [];
const perFile = new Map();
let walls = 0;      // stopPropagation containers, excluded from every category
let clickable = 0;  // every real activation handler, for scale
let pointered = 0;  // how many of those the pointer actually changes over

for (const file of jsxFiles(SRC).sort()) {
  const rel = relative(ROOT, file);
  const view = basename(file, ".jsx");
  const code = readFileSync(file, "utf8");
  const ast = parse(code, { sourceType: "module", plugins: ["jsx"] });
  perFile.set(view, { rel, elements: 0, A1: 0, A2a: 0, A2b: 0, A3: 0, B1: 0, B2: 0, C: 0 });
  const bucket = perFile.get(view);

  traverse(ast, {
    JSXOpeningElement(path) {
      const node = path.node;
      if (node.name.type !== "JSXIdentifier") return;      // <Foo.Bar> — a component
      const tag = node.name.name;
      const isComponent = /^[A-Z]/.test(tag);
      bucket.elements++;

      const attrs = new Map();
      let hasSpreadAttr = false;
      for (const a of node.attributes) {
        if (a.type === "JSXSpreadAttribute") { hasSpreadAttr = true; continue; }
        attrs.set(a.name.name, a.value);
      }

      const classes = new Set(classesOf(attrs.get("className")));
      const styles = styleOf(attrs.get("style"));
      const has = (re) => [...classes].some((c) => re.test(c));

      const handlers = [...attrs.keys()].filter((k) => ACTIVATION.has(k) && !isStopPropagation(attrs.get(k)));
      if ([...attrs.keys()].some((k) => ACTIVATION.has(k)) && !handlers.length) walls++;
      const keyed = [...attrs.keys()].some((k) => KEY_HANDLERS.has(k));
      const semantic = attrs.has("role") || attrs.has("href") || attrs.has("tabIndex");
      const native = NATIVE_INTERACTIVE.has(tag);
      const interactive = handlers.length > 0 || semantic || native;
      const disabled = attrs.has("disabled");

      /* Is a control already wrapping this? A span inside a button is
         allowed every box and hover style it likes — the button is the
         affordance, and the span is its label. */
      let inControl = false;
      for (let p = path.parentPath; p; p = p.parentPath) {
        if (p.node.type !== "JSXElement") continue;
        const open = p.node.openingElement;
        if (open.name.type !== "JSXIdentifier") continue;
        const parentAttrs = open.attributes.filter((a) => a.type === "JSXAttribute").map((a) => a.name.name);
        if (NATIVE_INTERACTIVE.has(open.name.name) || parentAttrs.some((n) => ACTIVATION.has(n))) {
          inControl = true;
          break;
        }
      }

      const parent = path.parent;
      const leaf = parent.type === "JSXElement"
        && !parent.children.some((c) => c.type === "JSXElement" || c.type === "JSXFragment");

      const bgClass = [...classes].map((c) => c.match(BG)?.[1]).find(Boolean);
      const hasBg = !!bgClass || styles.has("background") || styles.has("backgroundColor");
      const hasBorder = has(BORDER_WIDTH) || styles.has("border") || styles.has("borderWidth");
      const hasPad = has(PADDING) || [...styles].some((s) => s.startsWith("padding"));
      const hasRound = has(ROUNDED) || styles.has("borderRadius");
      const hasHover = has(HOVER);
      const roleIsButton = attrs.get("role")?.value === "button";
      const hasCursor = classes.has("cursor-pointer") || styles.has("cursor")
        || (CURSOR_BASE_RULE && (tag === "button" || tag === "summary"))
        || (ROLE_BUTTON_BASE_RULE && roleIsButton);

      const at = { view, rel, line: node.loc.start.line, tag, classes: [...classes], styles: [...styles] };

      /* ── A. Looks like a control, isn't ───────────────────────── */
      if (!interactive && !inControl && !isComponent && !hasSpreadAttr) {
        // A1 — a hover style is a promise. Nothing else in a UI moves
        // under the pointer unless it does something.
        if (hasHover) {
          findings.push({ ...at, cat: "A1", why: `hover style, no handler: ${[...classes].filter((c) => HOVER.test(c)).join(" ")}` });
          bucket.A1++;
        } else if (leaf && (hasBg || hasBorder) && hasPad && hasRound) {
          // Three things separate a dead control from a badge or a panel.
          // Shape: a full round is a badge, a soft radius is a button.
          // Palette: a neutral surface is what the controls are made of; a
          // status colour is its own information. Flow: an inline box is a
          // chip you could aim at, a block box is a panel you read.
          const badgeShape = classes.has("rounded-full");
          const neutral = (bgClass && NEUTRAL_FILL.test(bgClass))
            || [...classes].some((c) => /^border-hairline/.test(c));
          const inline = tag === "span" || has(/^inline/);

          const themes = {};
          for (const t of ["light", "dark"]) {
            const c = bgClass ? utilityColor(bgClass, t) : null;
            themes[t] = c ? Number(c.vsPage.toFixed(2)) : null;
          }
          const cat = !inline ? "A3" : badgeShape ? "A2b" : neutral ? "A2a" : "A2b";
          if (cat === "A3") bucket.A3++;
          else {
            findings.push({
              ...at, cat, themes,
              why: `${hasBg ? `bg-${bgClass ?? "inline"}` : "no fill"}${hasBorder ? " + border" : ""} + padding + `
                + `${badgeShape ? "rounded-full (badge shape)" : "rounded"}, no handler`
                + `${cat === "A2a" ? " — neutral surface, the button vocabulary" : ""}`,
            });
            bucket[cat]++;
          }
        }
        // A3 — the same box on something that wraps other elements. A card
        // is allowed to be a card; counted, not reported.
        else if ((hasBg || hasBorder) && hasPad && hasRound) bucket.A3++;
      }

      /* A dismiss-backdrop is a click target covering the whole screen. It
         wants no cursor and no hover — it is deliberately invisible — but it
         does still owe the keyboard an Escape route, so it stays in C. */
      const backdrop = (classes.has("fixed") && classes.has("inset-0"))
        || (styles.has("position") && styles.has("inset"));

      /* ── B. Is a control, doesn't look it ─────────────────────── */
      if (handlers.length) { clickable++; if (hasCursor) pointered++; }
      if (handlers.length && !disabled && !backdrop) {
        // Tailwind v4's preflight dropped v3's `button { cursor: pointer }`
        // and nothing here added it back, so a native button is as
        // cursor-less as a div. Verified against the compiled stylesheet:
        // the only cursor rules in it are the four utilities.
        if (!hasCursor) {
          findings.push({ ...at, cat: "B1", why: `${native ? "<" + tag + ">" : tag} with ${handlers[0]}, no cursor-pointer` });
          bucket.B1++;
        }
        // Inline-styled screens can't express :hover in a style attribute, so
        // they do it with onMouseEnter and React state. That is still a hover
        // affordance, and counting it as missing would be wrong.
        const jsHover = attrs.has("onMouseEnter") || attrs.has("onMouseLeave") || attrs.has("onFocus");
        if (!hasHover && !jsHover && !classes.has("group") && !has(/^(focus|active):/)) {
          findings.push({ ...at, cat: "B2", why: `${handlers[0]}, no hover/focus/active style` });
          bucket.B2++;
        }
      }

      /* ── C. Mouse only ────────────────────────────────────────── */
      if (handlers.includes("onClick") && !native && !isComponent && !semantic && !keyed) {
        // A full-screen backdrop that dismisses a menu is a real finding,
        // but it is a different fix (Escape) from a control that needs a
        // role. Tagged so the report can say which is which.
        findings.push({
          ...at, cat: "C", backdrop,
          why: backdrop
            ? `<${tag} onClick> dismiss-backdrop with no Escape route`
            : `<${tag} onClick> with no role, tabIndex or key handler`,
        });
        bucket.C++;
      }
    },
  });
}

/* ── Report ──────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const listArg = args.includes("--list") ? args[args.indexOf("--list") + 1] : null;

if (args.includes("--json")) {
  console.log(JSON.stringify({ findings, perView: Object.fromEntries(perFile) }, null, 2));
  process.exit(0);
}

if (listArg) {
  const want = findings.filter((f) => f.cat.startsWith(listArg));
  console.log(`\n${want.length} finding(s) in ${listArg}\n`);
  for (const f of want) {
    const themes = f.themes ? `  [light ${f.themes.light ?? "—"}:1 / dark ${f.themes.dark ?? "—"}:1]` : "";
    console.log(`  ${f.rel}:${f.line}  <${f.tag}>${themes}\n      ${f.why}`);
  }
  console.log();
  process.exit(0);
}

const all = [...perFile.entries()]
  .map(([view, b]) => ({ view, ...b, total: b.A1 + b.A2a + b.A2b + b.B1 + b.B2 + b.C }));
// Views with nothing left to report drop out of the table but stay in the
// totals — otherwise fixing a view shrinks the denominator it was measured
// against, and every count looks better than it is.
const rows = all.filter((r) => r.total > 0).sort((a, b) => b.total - a.total);

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

console.log("\n  AFFORDANCE AUDIT — every view, both themes\n");
console.log(`  ${pad("view", 26)}${num("els", 5)}${num("A1", 5)}${num("A2a", 5)}${num("A2b", 5)}${num("B1", 5)}${num("B2", 5)}${num("C", 5)}${num("total", 7)}`);
console.log(`  ${"─".repeat(68)}`);
for (const r of rows) {
  console.log(`  ${pad(r.view, 26)}${num(r.elements, 5)}${num(r.A1, 5)}${num(r.A2a, 5)}${num(r.A2b, 5)}${num(r.B1, 5)}${num(r.B2, 5)}${num(r.C, 5)}${num(r.total, 7)}`);
}
const sum = (k) => all.reduce((n, r) => n + r[k], 0);
console.log(`  ${"─".repeat(68)}`);
console.log(`  ${pad("TOTAL", 26)}${num(sum("elements"), 5)}${num(sum("A1"), 5)}${num(sum("A2a"), 5)}${num(sum("A2b"), 5)}${num(sum("B1"), 5)}${num(sum("B2"), 5)}${num(sum("C"), 5)}${num(sum("total"), 7)}`);

console.log(`
  A1   hover style, nothing behind it            ${sum("A1")}
  A2a  dead pill in the button vocabulary        ${sum("A2a")}
  A2b  dead pill in a status colour (a badge)    ${sum("A2b")}
  A3   box on a container — a card, not a lie    ${sum("A3")}  (not counted)
  B1   handler, no pointer cursor                ${sum("B1")}
  B2   handler, no hover/focus/active style      ${sum("B2")}
  C    click handler no keyboard can reach       ${sum("C")}   (${findings.filter((f) => f.cat === "C" && f.backdrop).length} of them dismiss-backdrops)

  For scale: ${pointered} of ${clickable} click handlers change the pointer${CURSOR_BASE_RULE ? " (base rule active)" : " — NO BASE RULE, every button draws an arrow"}.
  Excluded: ${walls} stopPropagation walls, which are not controls.
`);
