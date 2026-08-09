# ST.AIRS — Product Audit

**Date:** 8 August 2026 · **Commit:** `501e8d0` · **Version:** v3.7.0
**Scope:** Report only. No code was changed.

**Client complaints, verbatim:** the interface needs a facelift, the colours need work, and it's not obvious where things go.

All three are real, and all three are measurable. The headline number is at the end of §2.

---

## Contents

1. [Information architecture](#1-information-architecture)
2. [Visual design — and the cost of the light rebuild](#2-visual-design)
3. [Component consistency](#3-component-consistency)
4. [State and loading](#4-state-and-loading)
5. [Arabic / RTL](#5-arabic--rtl)
6. [Responsive](#6-responsive)
7. [Dead ends and half-built work](#7-dead-ends-and-half-built-work)
8. [Performance](#8-performance)
9. [Prioritised list](#9-prioritised-list)
10. [One week](#10-one-week)

Severity: **blocks-client-demo** / **embarrassing** / **polish**. Effort: **hours** / **a day** / **multi-day**.

---

## 1. Information architecture

### The map

Every screen, and how you reach it.

| Level | Screen | How you get there | Way back |
|---|---|---|---|
| 0 | **LoginScreen** — sign in | app open, no token (`StairsApp.jsx:337`) | n/a |
| 0 | LoginScreen — create account | tab switcher (`LoginScreen.jsx:158`) | tab switcher |
| 0 | LoginScreen — join org | `?invite=<token>` (`LoginScreen.jsx:48`) | clear the code field |
| 0 | LoginScreen — set new password | `?reset=<token>` (`LoginScreen.jsx:56`) | "Back to sign in" |
| 0 | Forgot-password modal | "Forgot Password?" (`LoginScreen.jsx:170`) | **"OK" — no action available** |
| 1 | **StrategyLanding** | after login, no active strategy (`StairsApp.jsx:338`) | n/a |
| 1 | WelcomeSlideshow — 9 slides | **auto-opens on every load** (`StrategyLanding.jsx:14–18`) | Esc / Skip |
| 1 | StrategyWizard — 5 steps | "Create New Strategy" (`StrategyLanding.jsx:64`) | Back on every step |
| 2 | **Main shell** | select a strategy (`StairsApp.jsx:174`) | ← in header (`StairsApp.jsx:364`) |
| 2 | Dashboard | sidebar · Core | sidebar |
| 2 | Staircase | sidebar · Core | sidebar |
| 2 | AI Advisor | sidebar · Core | sidebar |
| 2 | Alerts | sidebar · Core | sidebar |
| 2 | Action Plans | sidebar · Execution | sidebar |
| 2 | Manifest Room | sidebar · Execution | sidebar |
| 2 | Source of Truth | sidebar · Execution | sidebar |
| 2 | Knowledge | sidebar · Library | sidebar |
| 2 | Strategy Tools | sidebar · Library | sidebar |
| 2 | Notes | sidebar · Library | sidebar |
| 2½ | **Execution Room** — 3 tabs + a 4-step action wizard | **only** from an expanded stair (`StaircaseView.jsx:169`) or the saved-work chip (`StaircaseView.jsx:153`) | ← Back (`ExecutionRoom.jsx:1090`) |
| — | StairEditor | Staircase → Add / Edit | Cancel |
| — | StrategyMatrixToolkit — 5 matrices | Dashboard tiles, Strategy Tools, inline AI buttons | Modal close |
| — | PasswordManager | profile menu | Modal close |
| — | InviteManager (admin only) | profile menu | Modal close |
| — | TutorialOverlay — 14 steps | header "Guide" | Close |
| — | GuidanceToast — 12 triggers | fired by actions | Dismiss |
| — | 9 print windows | every "Export" button | browser tab close |

**Totals:** 4 login modes · 10 sidebar views · 1 unlisted full-screen room · 8 global modals · 3 separate onboarding systems · 9 print surfaces.

### Findings

| # | Finding | Evidence | Severity | Effort |
|---|---|---|---|---|
| IA-1 | **The room where the work happens is not in the navigation.** The sidebar lists Action Plans and Manifest Room — both of which are read-only views of output the Execution Room produces. The Execution Room itself has no nav entry. A user must know to open Staircase, expand a stair, and click a button inside the expanded panel. Two consumers are in the menu; the producer is hidden. | `Sidebar.jsx:3–7` (10 keys, no exec room) vs `StaircaseView.jsx:169` | blocks-client-demo | hours |
| IA-2 | **6 of 10 views have no heading.** Dashboard, Staircase, AI Advisor, Alerts, Knowledge and Notes render straight into content. The only cue to where you are is the sidebar highlight. Action Plans, Manifest Room, Source of Truth and Strategy Tools do render an `<h2>` — so the app is inconsistent with itself. | `DashboardView.jsx:141`, `StaircaseView.jsx:196`, `AIChatView.jsx:127`, `AlertsView.jsx:22`, `KnowledgeLibrary.jsx:12`, `NotesView.jsx:78` — vs `ActionPlansView.jsx:234`, `ManifestRoom.jsx:350`, `SourceOfTruthView.jsx:717`, `StrategyToolsPanel.jsx:40` | embarrassing | hours |
| IA-3 | **"Manifest Room" and "Execution Room" are two different places with almost the same name — and in Arabic it is worse.** English: Execution Room / Manifest Room. Arabic: `غرفة التنفيذ` (Execution Room) / `سجل التنفيذ` (Execution Log). An Arabic-speaking client sees two "التنفيذ" rooms and has no way to tell which produces and which records. | `StairsApp.jsx:355`, `ManifestRoom.jsx:350`, `ExecutionRoom.jsx:1090` | embarrassing | hours |
| IA-4 | **Shipped guidance copy names a tab that does not exist.** The Execution Room toast says "Work through each tab: Action Plan → Solutions → Implementation Chat". The actual tabs are Action Plan / **Recommendations** / **Chat**. The internal artifact key is still `SOLUTIONS`. Three names for two things. | `guidanceConfig.js:68` vs `ExecutionRoom.jsx:1079–1083`; `api.js:137` | embarrassing | hours |
| IA-5 | **"Action Plan" is both a sidebar destination and a tab inside another screen.** Generate a plan in the Execution Room's "Action Plan" tab; it also appears under the sidebar's "Action Plans". The toast tells you to "View all plans in the Action Plans **tab**" — it is not a tab, it is a sidebar item. | `StairsApp.jsx:354`, `ExecutionRoom.jsx:1080`, `guidanceConfig.js:76` | embarrassing | hours |
| IA-6 | **The product has two names.** Header, footer, page title and export headers all say "Stairs". One guidance toast says "Welcome to **ST.AIRS**!" — and that is the name the client uses. | `guidanceConfig.js:117` vs `StairsApp.jsx:367,431`, `index.html:7` | embarrassing | hours |
| IA-7 | **Forgot-password is a hard dead end.** The modal says: ask an administrator to mint you a reset link. There is no email-based reset. If the person who forgot the password *is* the organisation's only admin — which is every account created via self-signup, since registration creates a new org with the registrant as its admin — there is no recovery path in the product at all. | `LoginScreen.jsx:236–244`; `auth.py:346` (admin-only mint); `auth.py:101` | blocks-client-demo | a day |
| IA-8 | **The welcome slideshow plays on every single app open.** `hasSeenWelcome()` and `markWelcomeSeen()` are written, exported and unit-tested — and never called by any component. The effect that shows the slideshow has no gate at all: `if (!loading && userId) setShowWelcome(true)`. Nine slides, every time. | `StrategyLanding.jsx:14–18`; gate defined `WelcomeSlideshow.jsx:12–18`, called from `test/welcome-slideshow.test.jsx` only | blocks-client-demo | hours |
| IA-9 | **A button that names a destination it cannot reach.** The slideshow's final button reads "Skip to Dashboard →". It is rendered on StrategyLanding, where no dashboard exists — closing it lands you on the strategy list. | `WelcomeSlideshow.jsx:736,791` | polish | hours |
| IA-10 | **The five matrices are reachable three ways, with three different affordances**: unlabelled tiles on the Dashboard, described cards in Strategy Tools, and inline `LoadMatrixButtons` injected into AI output. Nothing tells the user these are the same five tools. | `DashboardView.jsx:150–166`, `StrategyToolsPanel.jsx:45–70`, `StaircaseView.jsx:177` | polish | a day |
| IA-11 | **No breadcrumb and no current-view label anywhere.** The header shows the strategy name; the view name is never written down. Combined with IA-2, five of ten screens are entirely unlabelled. | `StairsApp.jsx:361–372` | embarrassing | hours |
| IA-12 | **An unlabelled state that renders as a typo.** Collapse the sidebar and the footer renders the literal string `&I`. | `Sidebar.jsx:122` | embarrassing | hours |
| IA-13 | **Three onboarding systems run in parallel** — a 9-slide slideshow, a 14-step spotlight tour, and 12 contextual toasts — with three separate `localStorage` keys and no shared "this user is oriented" state. Two of them can fire in the same session. | `WelcomeSlideshow.jsx`, `tutorialConfig.js`, `guidanceConfig.js`; suppression is partial (`StairsApp.jsx:467`) | polish | multi-day |
| IA-14 | **Three destinations compete for "reference material":** Knowledge (📖, curated frameworks/books), Source of Truth (🔍, the client's own documents), Strategy Tools (🔧, the matrices). The 🔍 icon reads as "search", not "your uploaded evidence". | `StairsApp.jsx:350–353` | polish | hours |

### Can a user answer the three orientation questions?

- **What strategy am I in?** Yes. Header shows icon + name (`StairsApp.jsx:371`).
- **Where does my generated content live?** Partly. The Execution Room shows a "N saved items · Manifest Room" chip (`ExecutionRoom.jsx:1116`) and the Staircase shows "N of M actions have saved work" (`StaircaseView.jsx:153`) — both genuinely good. But AI chat history lives only in `localStorage` (`api.js:223`) and nothing says so; matrix results live in three places at once; and there is no single "everything I made" view.
- **What do I do next?** Only inside the empty states. `ActionPlansView.jsx:219` and `ManifestRoom.jsx:336` both explain what to do to fill them — the best copy in the product. Nothing on Dashboard, Staircase, Alerts, Knowledge or Notes does this.

---

## 2. Visual design

### Hardcoded dark values

| Kind | Occurrences | Files | Notes |
|---|---|---|---|
| Hex literals (`#0a1628`, `#162544`, `#1e3a5f`…) | **733** | 28 | **105 distinct** hex values |
| Tailwind arbitrary values (`bg-[#0a1628]/85`) | **302** | 25 | |
| `rgba()` / `rgb()` | **105** | 22 | 40 distinct values |
| `glass()` helper call sites | **67** | 16 | one definition, `constants.js:18` |
| `text-white` | **102** | 23 | |
| `text-gray-{300–700}` | **397** | most | see contrast table |
| `backdrop-blur` / `backdropFilter` | **12** | 8 | all over near-black scrims |
| SVG `stroke=` / `fill=` in markup | **72** | 7 | |

Top dark surface values by frequency: `#64748b` ×69 · `#94a3b8` ×60 · `#1e3a5f` ×46 · `#0a1628` ×38 · `#475569` ×25 · `#1e293b` ×24 · `#334155` ×15 · `#162544` ×5 · `#0f1f3a` ×5 · `#0a0e1a` ×1 · `#020617` ×1.

The last two matter more than their counts suggest:

- `#0a0e1a` (`WelcomeSlideshow.jsx:4`) — the first screen every user sees defines **its own** background and **its own gold** (`ACCENT = "#f5b731"`, `ACCENT_L = "#ffd666"`, lines 5–6), which are not the brand gold (`GOLD = "#B8904A"`, `GOLD_L = "#e8b94a"`). The welcome slideshow is off-brand from the rest of the app.
- `#020617` (`index.html:10`) — the pre-React paint colour, a ninth distinct near-black. It flashes before the app mounts.

### Things that only work because the background is near-black

- `text-white` ×102 — every one becomes invisible on a warm-white ground.
- `text-gray-500` ×141, `text-gray-600` ×94, `text-gray-700` ×5 — these are *already* too low-contrast on dark (see below); on light they invert to unreadably light.
- `glass(op)` = `rgba(22, 37, 68, op)` (`constants.js:18`) — a translucent **navy** panel. It reads as a surface only because near-black sits behind it. On warm white it becomes a navy stain. 67 call sites.
- `Modal` panel `rgba(15, 25, 50, 0.97)` over `bg-black/60 backdrop-blur-sm` (`SharedUI.jsx:46–48`) — 14 modal usages.
- Sidebar `rgba(10, 22, 40, 0.95)` + `blur(20px)` (`Sidebar.jsx:70–72`).
- Profile dropdown `rgba(22, 37, 68, 0.97)` (`StairsApp.jsx:392`, `StrategyLanding.jsx:40`).
- Every gold-on-dark gradient button sets `color: DEEP` / `color: "#0a1628"` as its *text* colour (`StaircaseView.jsx:169,185`, `StairEditor.jsx:36`, `LoginScreen.jsx:125,147,168,226,241`, `AIChatView.jsx:159`, `StrategyWizard.jsx:451,534,603,663,696,725`) — that stays correct on light, which is a small piece of luck.

### SVG and canvas colours baked into markup

| Where | Value | Line |
|---|---|---|
| ProgressRing track stroke | `stroke="#1e3a5f"` | `SharedUI.jsx:18` |
| ProgressRing label fill | `fill={col}` (health colour) | `SharedUI.jsx:20` |
| WelcomeSlideshow icon set (9 icons) | `stroke={ACCENT}`, `fill={BG}` | `WelcomeSlideshow.jsx:21–…` (26 attrs) |
| Matrix charts / plots | 33 `stroke=`/`fill=` attributes | `StrategyMatrixToolkit.jsx` |
| Tutorial reward checkmark | `#B8904A88` drop-shadow | `index.css:44` |
| AI-unavailable icon | 3 `stroke=`/`fill=` | `AiUnavailable.jsx` |
| Chat history hamburger | `fill="currentColor"` | `AIChatView.jsx:135` — the only one that will survive the change |

No canvas. 72 baked SVG colour attributes total.

### WCAG AA

Measured against the actual composited surfaces (`glass(0.6)` over the page gradient resolves to `#132340`; the sidebar to `#0a1628`; the modal to `#0f1932`).

| Text / background | Ratio | Body 4.5:1 | Large 3:1 | Occurrences |
|---|---|---|---|---|
| `text-white` on app bg | 18.13 | pass | pass | 102 |
| `text-gray-300` on app bg | 12.31 | pass | pass | 51 |
| `text-gray-400` on app bg | 6.97 | pass | pass | 96 |
| `GOLD_L #e8b94a` on app bg | 9.90 | pass | pass | — |
| `GOLD #B8904A` on app bg | 6.15 | pass | pass | 58 |
| `GOLD #B8904A` on `glass(0.6)` | 5.31 | pass | pass | — |
| **`text-gray-500` on app bg** | **3.75** | **FAIL** | pass | **141** |
| **`text-gray-500` on `glass(0.6)`** | **3.24** | **FAIL** | pass | — |
| **Sidebar inactive item `#64748b`** | **3.81** | **FAIL** | pass | every nav item |
| **Modal close button** | **3.60** | **FAIL** | pass | 14 modals |
| **LoginScreen "Forgot Password?" `#6b7280`** | **3.14** | **FAIL** | pass | — |
| **`text-gray-600` on app bg** | **2.40** | **FAIL** | **FAIL** | **94** |
| **`text-gray-600` on `glass(0.4)`** | **2.12** | **FAIL** | **FAIL** | — |
| **Sidebar section labels `#475569`** | **2.39** | **FAIL** | **FAIL** | 3 + footer |
| **LoginScreen "By DEVONEERS" `#4b5563`** | **2.01** | **FAIL** | **FAIL** | — |
| **`text-gray-700` — the page footer** | **1.76** | **FAIL** | **FAIL** | 5 |
| **ProgressRing track `#1e3a5f`** | **1.58** | **FAIL** | **FAIL** | 3 rings |

**12 of 23 tested pairs fail AA body text. Roughly 240 individual text nodes** (`text-gray-500` + `-600` + `-700`) sit below 4.5:1, and about 99 of those are below 3:1 — invisible-adjacent, not merely dim. The page footer at 1.76:1 and the sidebar's own section labels at 2.39:1 are the most visible offenders.

### Scale

- **31 distinct grey/neutral values** in play across Tailwind classes and hex literals — against a real scale of maybe 6.
- **15 distinct Tailwind font sizes** (`text-xs` ×266, `text-[10px]` ×158, `text-sm` ×133, `text-[11px]` ×37, `text-[9px]` ×26, `text-lg` ×23, `text-base` ×21, `text-2xl` ×9, `text-[15px]` ×8, `text-xl` ×7, `text-3xl` ×5, `text-4xl` ×4, `text-[8px]` ×2, `text-[13px]` ×2, `text-5xl` ×1) **plus 10 distinct inline `fontSize:` values** = **~19 type sizes**. A real scale is 6–8.
- `text-[10px]`, `text-[9px]` and `text-[8px]` account for **186 uses**. Sub-10px type is the single loudest "this looks unfinished" signal at demo distance.
- **19 distinct spacing steps** including two arbitrary values (`[15px]`, `[18px]`).
- **3 card radii** in use: `rounded-lg` ×161, `rounded-xl` ×69, `rounded-2xl` ×17.

### The token layer

There is one, and it is thin.

`constants.js` — 21 lines, the entire design system:

```js
export const GOLD = "#B8904A";
export const GOLD_L = "#e8b94a";
export const TEAL = "#2A5C5C";
export const CHAMPAGNE = "#F7E7CE";
export const DEEP = "#0a1628";
export const BORDER = "rgba(30, 58, 95, 0.5)";
export const glass = (op = 0.6) => ({ background: `rgba(22, 37, 68, ${op})`, border: `1px solid ${BORDER}` });
export const inputCls = "w-full px-4 py-3.5 rounded-xl bg-[#0a1628]/85 border border-[#1e3a5f] …";
export const labelCls = "text-gray-400 text-[11px] uppercase tracking-[0.12em] …";
```

- **No Tailwind theme config.** `vite.config.js` loads `@tailwindcss/vite` with no `@theme` block anywhere. There is no `tailwind.config.js`. Tailwind's stock palette is being used raw.
- **No CSS custom properties.** `index.css` is 119 lines and contains only tutorial keyframe animations — zero `--var` declarations.
- **No dark/light mechanism of any kind.** No `.dark` class, no `prefers-color-scheme`, no `data-theme`.

**Where components bypass the tokens that do exist:**

| Bypass | Where |
|---|---|
| `DEEP` re-typed as a literal `#0a1628` | 38 occurrences across 12 files |
| `BORDER` re-typed as `rgba(30, 58, 95, 0.5)` | `Sidebar.jsx:71,91,120`, `StaircaseView.jsx:198` |
| `glass()` re-typed as `rgba(22, 37, 68, x)` | `StairsApp.jsx:392,442`, `StrategyLanding.jsx:40`, `StaircaseView.jsx:147` |
| `GOLD` re-typed as `#B8904A` | in every one of the 5 export stylesheets |
| **A second, different gold** | `WelcomeSlideshow.jsx:5–6` — `#f5b731` / `#ffd666` |
| **A ninth background** | `index.html:10` — `#020617` |
| `inputCls` bypassed by hand-rolled inputs | 14 of 57 form controls |
| `LoginScreen` bypasses everything | 100% inline styles; 34 hex literals, 11 rgba, 24 dark-assuming lines |

So: tokens exist for gold, deep and border only. Every grey, every surface, every semantic colour and every size is a literal.

### The ExportPDF palette — the light design language already in the codebase

The client is right that this already exists. `exportUtils.js:5–45` defines `EXPORT_STYLES`, and it is a complete, coherent, light document system. Extracted exactly:

| Role | Value | Where |
|---|---|---|
| Page ground | `#fff` | `body { background: #fff }` |
| Body ink | `#1e293b` | `body { color: #1e293b }` |
| Accent — rules, section heads, table heads, footer | `#B8904A` | 7 uses |
| Hairline / card border | `#e5e7eb` | 6 uses |
| Muted label / meta | `#64748b` | `.stat-box .lbl`, `.knowledge-card .meta` |
| Secondary body | `#475569` | `.knowledge-card .desc` |
| Table body ink | `#334155` | `.factor-table td`, `.chat-msg .text` |
| Faint raised surface | `#f8fafc` | `.factor-table .cat-header` |
| Footer meta | `#94a3b8` | `.stairs-footer .meta` |
| Warm callout | bg `#fffbeb` · border `#fcd34d40` · text `#92400e` | `.interpretation-box`, `.chat-msg.user` |
| Cool callout | bg `#f0f9ff` · border `#bae6fd40` | `.chat-msg.ai` |
| Type | `'Segoe UI', system-ui, sans-serif` · `line-height: 1.5` | `body` |
| Rule weights | `2px solid #B8904A` (major) · `1px solid #e5e7eb` (minor) | header / footer / section |
| Semantic | green `#059669` · amber `#d97706` · red `#dc2626` · blue `#2563eb` · violet `#7c3aed` | `StairsApp.jsx:302,306` |

That is a nine-value neutral ramp, one accent, two callout treatments, five semantics, one type stack and two rule weights. It is a better-specified system than the app has, and it is **already what the client sees on the board deck**. The app should match its own export.

Two caveats before adopting it wholesale:

1. **The palette is duplicated five times, not shared.** `exportUtils.js:5` is the canonical copy, but `StairsApp.jsx:324`, `ManifestRoom.jsx:8`, `ActionPlansView.jsx:9` and `NotesView.jsx:70` each re-declare their own near-copy inline. `ExecutionRoom.jsx:1022` and `StrategyMatrixToolkit.jsx` build their own headers. They have already drifted — ManifestRoom uses a `3px` header rule where everyone else uses `2px`, and adds `#e2e8f0` and `#cbd5e1` that appear nowhere else.
2. `#64748b` on `#fff` is **4.83:1** and `#94a3b8` on `#fff` is **2.60:1**. The export's own footer meta fails AA. Lift `#94a3b8` to `#64748b` when the palette moves into the app, where it will carry live UI rather than print.

### The number

> **To take this interface from dark to light today, 792 distinct source lines across 29 files would have to be edited.**

That counts every line containing a dark-surface hex, a navy/black `rgba()`, a `bg-[#…]`/`border-[#…]`/`text-[#…]` arbitrary value, `text-white`, `text-gray-{400,500,600,700}`, `bg-white/…`, `bg-black/…`, a `glass()` call, a `backdrop-blur`, or a bare `DEEP`/`BORDER` reference. Print stylesheets are excluded — those are already light and must stay.

| File | Lines to edit |
|---|---|
| `ExecutionRoom.jsx` | 101 |
| `SourceOfTruthView.jsx` | 74 |
| `StrategyMatrixToolkit.jsx` | 68 |
| `ManifestRoom.jsx` | 52 |
| `StrategyWizard.jsx` | 51 |
| `ActionPlansView.jsx` | 50 |
| `WelcomeSlideshow.jsx` | 42 |
| `KnowledgeLibrary.jsx` | 37 |
| `StairsApp.jsx` | 31 |
| `DashboardView.jsx` | 30 |
| `TutorialOverlay.jsx` | 28 |
| `StrategyLanding.jsx` | 25 |
| `LoginScreen.jsx` | 24 |
| `InviteManager.jsx` | 23 |
| `StaircaseView.jsx` | 21 |
| `NotesView.jsx` | 17 |
| `AIChatView.jsx` | 16 |
| `PasswordManager.jsx` | 16 |
| `StrategyQuestionnaire.jsx` | 14 |
| `Sidebar.jsx` | 13 |
| `SharedUI.jsx` | 12 |
| `StrategyToolsPanel.jsx` | 12 |
| `GuidanceToast.jsx` | 10 |
| `StairEditor.jsx` | 6 |
| `constants.js` | 6 |
| `AiUnavailable.jsx` | 5 |
| `AlertsView.jsx` | 4 |
| `Markdown.jsx` | 3 |
| `index.html` | 1 |
| **Total** | **792** |

**What that number really means.** There is no switch to flip, because there is nothing to flip — no theme config, no custom properties, no `.dark` class. Every one of those 792 lines states its colour literally. That is the honest cost of the current architecture.

But it is not 792 units of work. Roughly **340 of them route through nine decisions**: `glass()` (67 sites), `text-white` (102), `text-gray-500/600/700` (240 — though these collapse to three replacement rules), `inputCls`, `labelCls`, `DEEP`, `BORDER`, the `Modal` shell, and the `Sidebar` surface. Introduce a real token layer — CSS custom properties in `index.css` plus a Tailwind `@theme` block — repoint those nine, and the remaining **~450 are genuine one-by-one edits**, concentrated in the six largest components, which hold 386 of them between them.

Realistic shape: **2 days** to build the token layer and convert `constants.js`, `SharedUI.jsx`, `Sidebar.jsx` and `StairsApp.jsx` (the shell — this alone makes the app look light). Then **3–4 days** to sweep the six large views. Then **1–2 days** for contrast repair and the long tail. **Call it 6–8 working days for a clean conversion**, or 2 days for a demo-credible one that leaves the Matrix Toolkit and Welcome Slideshow dark and hidden.

---

## 3. Component consistency

### Buttons

**214 `<button>` elements. 48 distinct style signatures. 38 of those signatures are used exactly once.** There is no `Button` component. 40 buttons carry inline `style={}` in addition to their classes.

Four recurring primary treatments that should be one:

| Treatment | Example | Used by |
|---|---|---|
| Gold gradient, navy text, `rounded-lg`, `px-6 py-3` | `background: linear-gradient(135deg, ${GOLD}, ${GOLD_L}), color: "#0a1628"` | `StairEditor.jsx:36`, `StrategyWizard.jsx:451,534,603,725`, `LoginScreen.jsx:125,147,168,226` |
| Gold gradient, `rounded-xl`, `px-5 py-3` | same colours, different radius and padding | `AIChatView.jsx:159`, `StrategyWizard.jsx:663` |
| Gold gradient, `rounded-lg`, `px-5 py-2.5`, `text-sm` | third size | `StaircaseView.jsx:185` |
| Gold tint + border, gold text | `borderColor: ${GOLD}60, color: GOLD, background: ${GOLD}15` | every "Export" — `DashboardView.jsx:146`, `AlertsView.jsx:23`, `ManifestRoom.jsx`, `ActionPlansView.jsx`, `StrategyToolsPanel.jsx:43`, `ExecutionRoom.jsx:1128` |

Secondary/ghost buttons are worse — `text-gray-400 hover:text-white`, `text-gray-500 hover:text-gray-300`, `text-gray-500 hover:text-amber-400`, and `text-gray-400 hover:text-amber-400 hover:bg-amber-500/10` all appear as "the quiet button", on different screens.

**Severity:** embarrassing · **Effort:** a day to extract a `Button` with 4 variants × 3 sizes; multi-day to migrate all 214.

### Inputs

`inputCls` and `labelCls` exist and are used well: **43 of 57 form controls use `inputCls`** (75%). The 14 that don't:

| Control | File | Why it differs |
|---|---|---|
| Advisor chat composer | `AIChatView.jsx:158` | `bg-[#0a1628]/60`, `rounded-xl`, `py-3` |
| Wizard AI composer | `StrategyWizard.jsx:661` | `bg-[#0a1628]/60`, `py-3.5`, `text-[15px]` |
| Execution Room chat composer | `ExecutionRoom.jsx:1803` | matches AIChatView but re-typed |
| 3 × inline chat inputs | `ExecutionRoom.jsx` (explain / action / impl-room) | three more shapes |
| 7 × matrix number/select inputs | `StrategyMatrixToolkit.jsx` | own `weightInputCls` |

Five different chat composers, all doing the same job. `inputCls` itself hardcodes `bg-[#0a1628]/85` and `border-[#1e3a5f]` (`constants.js:19`) — one edit fixes 43 controls, which is the good news.

**Severity:** polish · **Effort:** hours.

### Modals

`Modal` (`SharedUI.jsx:40`) is well built — three sizes, footer slot, backdrop click, `min-w-[340px]`, `max-h-[88vh]`. **14 usages.** Alongside it, **12 bespoke `fixed inset-0` overlays** that don't use it:

| Where | Count | What |
|---|---|---|
| `TutorialOverlay.jsx` | 4 | spotlight, tooltip, completion, update prompt |
| `SourceOfTruthView.jsx` | 3 | impact trace, quarantine confirm, add manual reference |
| `ExecutionRoom.jsx` | 2 | the room shell (`z-[90]`), export options |
| `StrategyLanding.jsx` | 1 | profile dropdown scrim |
| `StairsApp.jsx` | 1 | profile dropdown scrim |
| `LoginScreen.jsx` | 1 | forgot-password modal — its own `rgba(0,0,0,0.6)` + `#162544` panel |
| `Sidebar.jsx` | 1 | mobile nav scrim |

The three SourceOfTruth dialogs and the LoginScreen forgot-password modal are the ones worth converting — they are ordinary dialogs re-implemented with different backdrop opacity, different panel colour and no Escape handling.

**z-index ladder, unmanaged:** `z-40` (dropdown scrims) → `z-50` (dropdowns, sidebar) → `z-[90]` (Execution Room) → `z-[95]` (note-sync toast) → `z-[100]` (Modal). Five hand-picked values with no scale.

**Severity:** polish · **Effort:** a day.

### Cards

No `Card` component. Cards are `glass(op)` + a radius, with **op varying by author**: `glass()` (0.6), `glass(0.5)`, `glass(0.4)`, `glass(0.3)`, `glass(0.2)`, `glass(0.8)`. Radii split three ways (`rounded-lg` ×161, `rounded-xl` ×69, `rounded-2xl` ×17). The same conceptual object — a stat tile — is `rounded-xl` + `glass(0.5)` on the Dashboard (`DashboardView.jsx:148`) and `rounded-xl` + `glass(0.4)` in Source of Truth (`SourceOfTruthView.jsx:800`).

**Severity:** polish · **Effort:** a day.

### Badges

Five badge families, four of them one-offs:

| Badge | Shared? | Where |
|---|---|---|
| `HealthBadge` | shared, 7 usages | `SharedUI.jsx:5` |
| `ConfidenceBadge` | shared, but only used in AIChatView | `SharedUI.jsx:63` |
| `NotStartedBadge` | **one-off**, duplicates HealthBadge's shape | `StaircaseView.jsx:19` |
| `PriorityBadge` | **one-off** | `ExecutionRoom.jsx` |
| Sidebar count badge | **one-off**, two variants (expanded / collapsed) | `Sidebar.jsx:30,37` |
| Save-state chips (`✓ Saved` / `⚠ Not saved`) | **one-off** | `StaircaseView.jsx:134,140` |
| Status label on strategy cards | **one-off**, plain text + inline colour | `StrategyLanding.jsx:69` |

`NotStartedBadge` is the clearest case — it hand-copies `HealthBadge`'s exact class string with a different colour, because `HealthBadge` has no "not started" state.

**Severity:** polish · **Effort:** hours.

### The same element, different on different screens

| Element | Screen A | Screen B |
|---|---|---|
| Profile dropdown | `StairsApp.jsx:392` — 3 items (password, invites, sign out) | `StrategyLanding.jsx:40` — 1 item (sign out). Same visual, different capability, no explanation |
| "Export" button | gold-tinted bordered pill on 6 screens | plain `↗` icon in Notes (`NotesView.jsx`) |
| Loading indicator | bouncing dots (`ManifestRoom`, `ActionPlansView`, `StaircaseView`, `AIChatView`) | spinning ring (`StrategyLanding.jsx:61`, `KnowledgeLibrary.jsx:12`, `SourceOfTruthView`) |
| Save button while saving | `"..."` (`StairEditor.jsx:36`, `LoginScreen.jsx:148,168,227`) | `"Creating..."` (`StrategyWizard.jsx:725`) |
| Page footer | `text-gray-700` (`StairsApp.jsx:431`) | `text-gray-700` at different padding (`StrategyLanding.jsx:100`) |

---

## 4. State and loading

### The systemic finding

**Every list view in the product converts a load failure into an empty state.** There is not one surface that distinguishes "you have nothing" from "we couldn't reach the server". On a client demo with a flaky connection, the client is shown that their data is gone.

| Surface | On error | What the client sees | Evidence |
|---|---|---|---|
| **Dashboard** | `setDashData({stats:{total_elements:0, overall_progress:0}})` | **0% overall progress, 0 elements** — a ProgressRing reading zero | `StairsApp.jsx:194` |
| **Staircase** | `setStairTree([])` | "No elements yet. Add your first or use AI Advisor." | `StairsApp.jsx:193`, rendered `StaircaseView.jsx:199` |
| **Alerts** | `setAlerts([])` | "No active alerts" | `StairsApp.jsx:195`, rendered `AlertsView.jsx:21` |
| **Action Plans** | `setPlanGroups([])` | "No Action Plans Yet" | `ActionPlansView.jsx:162` |
| **Manifest Room** | falls through with empty state | "No Implementation Manifests Yet" | `ManifestRoom.jsx:168` |
| **Knowledge** | every fetch `.catch(()=>[])` | an empty library, no message | `KnowledgeLibrary.jsx:10` |
| **Source of Truth** | `.catch(() => {})` ×2 | confidence and health panels silently absent | `SourceOfTruthView.jsx:78,81` |
| **Data Health card** | `.catch(() => {})` | card silently absent | `DashboardView.jsx:84` |
| **AI provider chip** | `.catch(() => {})` | chip silently absent | `StairsApp.jsx:138` |
| **Source count badge** | `setSourceCount(0)` | badge silently absent | `StairsApp.jsx:196` |
| **Matrix results** | `.catch(() => {})` | server copies never load; stale local cache shown as truth | `StairsApp.jsx:192` |

The Dashboard case is the worst of these: it does not fail to a blank, it fails to **a confident, well-designed zero**.

**Severity:** blocks-client-demo · **Effort:** a day for a shared `<LoadState>` that carries `loading | empty | error` and a retry, plus wiring the eleven sites.

### Silent failures on write

| Action | What happens | Evidence |
|---|---|---|
| **Create Strategy fails** | `console.error`, `setCreating(false)`, **nothing shown**. The button says "Creating…", then reverts to "Create Strategy". No error, no retry, no explanation — at the single most important moment in the product. | `StrategyWizard.jsx:690–695` |
| **Login fails for any reason** | `catch { setErr("Invalid credentials") }` — a 500, a CORS failure or a dead network all tell the user their password is wrong | `LoginScreen.jsx:80` |
| **Tree/dashboard refetch after save or delete** | `catch {}` ×4 — the stair is saved but the tree silently shows stale data | `StairsApp.jsx:255,256,262,263` |
| **Delete strategy fails** | `catch {}` then removes from the local list anyway — the strategy reappears on next load | `api.js:270` |
| **Quarantine a source fails** | `console.error` only | `SourceOfTruthView.jsx:98` |
| **Popup blocked on any Export** | `if (!w) return;` — the button does nothing, 9 times over | `exportUtils.js:60`, `StairsApp.jsx:296`, `ManifestRoom.jsx:64`, `ActionPlansView.jsx:56`, `NotesView.jsx:69`, `ExecutionRoom.jsx:937` |

**14 silent catch blocks** in total across the app.

### What is genuinely good

Worth protecting during the rebuild — this is the strongest work in the codebase:

- `lib/aiResilience.js` — a proper failure taxonomy (busy / unavailable / offline / too_long / session), bilingual copy for every kind, leak detection so status codes and prompt templates never reach the client, and `promptTurn()` separating what is sent from what is shown. 258 well-reasoned lines.
- `AiUnavailable.jsx` — a real error component with retry, used in 5 places.
- The Execution Room's unsaved-work banner and per-item "not saved" chips (`ExecutionRoom.jsx:1103–1160`) — it tells you exactly which items failed to persist and warns you not to close the page.
- `StaircaseView`'s `SaveState` chip — "✓ Saved 3 Aug" / "⚠ Not saved" per AI result (`StaircaseView.jsx:132–141`).
- The note-sync toast (`StairsApp.jsx:441–455`) — explains that notes were local-only and are now on the account.
- `ActionPlansView` and `ManifestRoom` empty states — they explain the action that fills them.

### Bare and missing states

| Surface | State | Problem |
|---|---|---|
| Strategy list | loading | bare spinning ring, no text (`StrategyLanding.jsx:61`) |
| Knowledge Library | loading | bare spinning ring, no text (`KnowledgeLibrary.jsx:12`) |
| StairEditor save | loading | button text becomes `"..."` (`StairEditor.jsx:36`) |
| Login / signup / reset | loading | button text becomes `"..."` ×3 (`LoginScreen.jsx:148,168,227`) |
| Strategy creation | in progress | no progress at all while N elements POST one at a time in a loop (`StairsApp.jsx:204–213`) — a 30-element strategy is 30 serial round-trips behind a single "Creating…" |
| Document upload | progress | `onProgress` exists in `api.js:82` — **and no caller passes it**, so uploads show no percentage |
| Any successful save | confirmation | no toast. Guidance toasts fire on *some* actions (`note_saved`, `matrix_complete`), not on stair save, stair delete, note delete, or source upload |

---

## 5. Arabic / RTL

### How complete is it, really

**Structurally: about 60%. Practically: it does not survive a demo.**

`dir="rtl"` is set in exactly **two places**: the main app shell (`StairsApp.jsx:360`) and StrategyLanding (`StrategyLanding.jsx:20`). Everything inside those inherits, so the Execution Room, the Matrix Toolkit and all modals do get `rtl`. But:

- **`index.html` never changes.** `<html lang="en">` (line 2), no `dir` attribute, ever. Screen readers and browser text services see an English LTR document regardless of the toggle.
- **The login screen has no language at all.** `<LoginScreen onLogin={setUser} />` (`StairsApp.jsx:337`) is rendered before any `dir` wrapper and receives no `lang` prop. An Arabic-speaking client's first screen — sign in, create account, join an organisation, reset a password, forgot-password — is English-only and LTR-only.

### Components with no i18n at all

Eight files contain no `isAr`, no `lang`, and no Arabic strings:

| Component | Lines | What is English-only |
|---|---|---|
| `WelcomeSlideshow.jsx` | 808 | **the first screen every user sees**, all 9 slides |
| `StrategyMatrixToolkit.jsx` | 1210 | **the entire strategy tools suite** — all 5 matrices, every label, every axis, every interpretation |
| `TutorialOverlay.jsx` | 536 | all 14 onboarding steps |
| `LoginScreen.jsx` | 250 | the entire entry point |
| `GuidanceToast.jsx` + `guidanceConfig.js` | 5.3K + 177 | all 12 contextual toasts |
| `StrategyQuestionnaire.jsx` | 6.4K | the questionnaire chrome |
| `SharedUI.jsx` | 175 | HealthBadge labels, ConfidenceBadge, ValidationWarnings, AgentActivityIndicator |
| `Markdown.jsx` | — | renderer, no strings — fine |

### Partially translated

`StrategyWizard.jsx` receives `lang` and uses it **6 times** across 730 lines. English-only strings the Arabic user reads: "Strategy Name *", "Company / Product", "Industry", "Framework", "Brief Description", "Strategy Type *", "Color", "Cancel", "Next → Strategy Questionnaire", "← Back", "Skip — Fill Manually", "Upload & Continue", "Skip questionnaire", "Next → AI Builder", "Skip AI → Create empty", "← Back to AI", "Creating…", and all five step titles (`stepTitles`, line 715).

Other leaks in otherwise-translated components:

| String | Where |
|---|---|
| `"Code"` field label | `StairEditor.jsx:24` |
| `"Confirm?"` on delete | `StairEditor.jsx:34` |
| Health labels render `h.replace("_"," ").toUpperCase()` → `"ON TRACK"` | `StairEditor.jsx:30`, `SharedUI.jsx:9` |
| `"NOT STARTED"` | `StaircaseView.jsx:20` |
| `"💡 Explanation"` / `"✨ Enhancement"` panel headers | `StaircaseView.jsx:177,178` |
| `"📌 Save"` | `StaircaseView.jsx:177`, `AIChatView.jsx:142` |
| All 5 AI suggestion chips ("Build IFE Matrix"…) | `AIChatView.jsx:64–70` |
| Quick prompts: 3 in English, **2 in Arabic** | `AIChatView.jsx:125` |
| `"Change password"`, `"Invite your team"`, `"Sign Out"` in the profile menu | `StairsApp.jsx:399,403,407` |
| The whole note-sync toast | `StairsApp.jsx:443–453` |
| Both app footers | `StairsApp.jsx:431`, `StrategyLanding.jsx:100` |
| Agent Activity table values (`entry.agent_name`, `task_type`, `model_used`) | `DashboardView.jsx:66–69` — headers translated, contents not |

### What breaks under `dir="rtl"`

**71 physical-direction Tailwind utilities** (`left-` ×8, `right-` ×9, `ml-` ×22, `mr-` ×5, `pl-` ×5, `pr-` ×2, `text-left` ×20, `text-right` ×3) plus **12 inline `left:`/`right:` styles**, against **zero** RTL-aware utilities — no `rtl:` variants, no logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`). Tailwind does not flip these; they stay physically left/right under RTL.

Concrete breakages:

| Break | Evidence |
|---|---|
| Search icon sits left, padding reserved left, cursor starts right | `SourceOfTruthView.jsx:819–826` — `absolute left-3` + `pl-9` on an RTL input |
| Profile dropdown pins to the right edge under RTL | `StairsApp.jsx:392`, `StrategyLanding.jsx:40` — `absolute right-0` |
| Note-sync toast pins bottom-right under RTL | `StairsApp.jsx:442` — `fixed bottom-4 right-4` |
| Back-arrow hover slides left (away from the RTL reading direction) | `StairsApp.jsx:365`, `ExecutionRoom.jsx:1091` — `group-hover:-translate-x-0.5` |
| Staircase indentation always grows leftward | `StaircaseView.jsx:146` — `marginLeft: depth*24` |
| Every stair row's coloured type stripe stays on the left | `StaircaseView.jsx:147` — `borderLeft: 3px solid` |
| Execution Room split view: list stays left, detail right | `ExecutionRoom.jsx:1243` — `borderRight` |
| All 6 tabular views left-align under RTL | `DashboardView.jsx:55–59` and others — `text-left` |
| All arrow glyphs are hardcoded LTR: `←` Back, `→` Next, `▶` expand | throughout |

`Sidebar.jsx` is the exception and shows what right looks like — it flips `borderLeft`/`borderRight`, `justifyContent`, `textAlign` and tooltip side off `isAr` (lines 17–20, 45, 71, 96). It is the only RTL-aware component in the app.

### Data-model gaps

| Column | Authorable in the UI? | Read in the UI? |
|---|---|---|
| `stairs.title_ar` | yes — `StairEditor.jsx:26` (correctly `dir="rtl"`) | yes, 22 sites |
| `stairs.description_ar` | **no field exists anywhere** | yes, `AlertsView.jsx:11` |
| `strategies.name_ar` | **no field in the wizard** | yes, 6 sites |
| `strategies.description_ar` | **no field in the wizard** | yes |
| `ai_alerts.title_ar` / `description_ar` | backend-generated only | yes |
| `users.full_name_ar` | **no field** | **never read** |
| `organizations.name_ar` | **no field** | **never read** |
| `teams.name_ar` | no teams UI at all | never read |
| `frameworks.name_ar` | admin/seed only | never read |

So: a user can title a stair in Arabic but cannot describe one; can create a strategy but cannot name it in Arabic; and four `_ar` columns are dead weight in the schema.

### Per-screen verdict

| Screen | `dir` | Chrome | Content | Layout under RTL |
|---|---|---|---|---|
| Login | **no** | **English only** | — | untested, LTR-only |
| Strategy Landing | yes | translated | `name_ar` read, not authorable | dropdown mis-pinned |
| **Wizard** | inherited | **~6 strings of ~24** | `_ar` never captured | grids fine, arrows LTR |
| **Staircase** | inherited | translated | `title_ar` yes, badges English | indent + stripe both LTR |
| **Dashboard** | inherited | translated | agent-log contents English | tables `text-left` |
| **Execution Room** | inherited | well translated | plan/solution text is model output (follows prompt language, not the toggle) | split view LTR, arrows LTR |
| Source of Truth | inherited | translated | search icon/padding broken | |
| Matrix Toolkit | inherited | **English only** | **English only** | number inputs LTR |
| Welcome Slideshow | inherited | **English only** | **English only** | |
| Tutorial | inherited | **English only** | | tooltip positioning LTR |

**Severity:** blocks-client-demo if Arabic is being shown; embarrassing otherwise · **Effort:** multi-day. Login + wizard + shared badges is ~2 days; the Matrix Toolkit alone is 2–3 days; a proper logical-property sweep is another 2.

---

## 6. Responsive

Read from the code, not a browser — these are what the source guarantees.

`index.html:6` sets a correct viewport meta. There are **58 responsive prefixes** in the entire frontend, and **16 of 25** `grid-cols-N` declarations have no breakpoint at all. **15 of 27 components use zero responsive prefixes**, including `SourceOfTruthView`, `ActionPlansView`, `ManifestRoom`, `AIChatView`, `NotesView`, `LoginScreen`, `StaircaseView` and `WelcomeSlideshow`.

### 1440 — mostly fine

Content is capped at `max-w-6xl` (1152px) with the sidebar outside it (`StairsApp.jsx:419`), so there is a wide empty gutter on the right at 1440. Not broken, just unfinished-looking. The Dashboard's 4-up stat grid and 5-up matrix grid both stop at `md:`, so they never use the extra width. Sub-10px type (186 uses) is at its least legible at this distance.

### 1024 — fine

Sidebar is `md:static md:flex` at 200px expanded; content gets ~800px. The Execution Room's `isNarrow` threshold is 900px (`ExecutionRoom.jsx:63`), so at 1024 the split view holds. This is the size the app was designed at.

### 768 — the first real breaks

768px is exactly Tailwind's `md` boundary, so the sidebar is still `md:flex` (200px) leaving ~568px of content.

| Break | Evidence |
|---|---|
| **Source of Truth stat row: 6 columns in 568px** — ~95px each, holding an icon, a count and an uppercase label | `SourceOfTruthView.jsx:793` — `grid grid-cols-6` with no prefix |
| **Source of Truth has a second bare `grid-cols-5`** | `SourceOfTruthView.jsx` |
| **Manifest Room `grid-cols-3` never collapses** | `ManifestRoom.jsx` |
| **Execution Room enters `isNarrow` at 900px** — the action list and detail become alternating full-width pages, which is correct behaviour, but the 3-tab bar keeps `whitespace-nowrap` two-line tabs ("Recommendations" + "Strategic advice organized by impact level") with no `overflow-x` | `ExecutionRoom.jsx:1134–1143` |
| **Modal `min-w-[340px]`** is fine here but forces horizontal page scroll below 388px | `SharedUI.jsx:29–30` |
| **AI Advisor height is a magic number** — `h-[calc(100vh-180px)]` assumes a single-line header; the header wraps below ~700px, so the composer is pushed below the fold | `AIChatView.jsx:128` |

### 390 — several hard failures

| Break | Evidence |
|---|---|
| **Modal `min-w-[340px]` + shell `p-6`** = 340 + 48 = **388px minimum**. At 390 there is 2px of slack; the Wizard, StairEditor, PasswordManager and InviteManager are all at the very edge of horizontal scroll | `SharedUI.jsx:29,30` |
| **6-column grid in ~342px** — 57px per cell for an icon, a number and an uppercase label. Unreadable | `SourceOfTruthView.jsx:793` |
| **Strategy cards are fixed at 320px** with `width: "320px"` inline, inside `px-6` padding | `StrategyLanding.jsx:64,72` |
| **Header does not collapse.** Nine elements — menu, back+logo+wordmark, version, separator, strategy name, AI provider chip, Watch Intro, Guide, features, language, profile — in one non-wrapping flex row. Only two hide (`hidden sm:inline` on two labels). At 390 the profile button and language toggle are pushed off-screen with no overflow handling — **the sign-out control becomes unreachable** | `StairsApp.jsx:361–413` |
| **Agent Activity table** has `overflow-x-auto` — correctly handled | `DashboardView.jsx:51` |
| **Execution Room tab bar** — three two-line tabs, `whitespace-nowrap`, no `overflow-x` | `ExecutionRoom.jsx:1134` |
| **WelcomeSlideshow uses fixed px throughout** — `maxWidth: "800px"`, `width: "150px"`, `width: "200px"`, `minWidth: "90px"` — with zero responsive prefixes across 808 lines | `WelcomeSlideshow.jsx:73,79,188,416,756` |
| **Only 4 `overflow-x` declarations exist** in the whole app (two of them `hidden`) | `StairsApp.jsx:418`, `Sidebar.jsx:86`, `DashboardView.jsx:51` |
| **`text-[8px]`/`text-[9px]`** (28 uses) at 390 is below the legibility floor | throughout |

**Severity:** header overflow at 390 is blocks-client-demo (sign-out unreachable); the rest is embarrassing · **Effort:** a day for the header, the 6-col grid and the modal min-width; multi-day for a proper pass.

---

## 7. Dead ends and half-built work

### Backend endpoints with no UI

**26 of ~95 endpoints have no caller in the frontend.** The largest cluster is the purpose-built AI layer:

| Endpoint | Lines | Status |
|---|---|---|
| `POST /api/v1/ai/generate` | 123 | **no caller** |
| `POST /api/v1/ai/analyze/{stair_id}` | 59 | **no caller** |
| `POST /api/v1/ai/action-plan` | 45 | **no caller** |
| `POST /api/v1/ai/explain-action` | 43 | **no caller** |
| `POST /api/v1/ai/implementation-guide` | 42 | **no caller** |
| `POST /api/v1/ai/customized-plan` | 27 | **no caller** |

**339 lines of purpose-built endpoints, entirely unreachable.** Every AI feature in the product instead funnels through the single generic `POST /api/v1/ai/chat` with a prompt string assembled in the browser — **13 call sites** (`ExecutionRoom.jsx:281,318,377,468,533,629,774,816,879`, `StaircaseView.jsx:101`, `StrategyWizard.jsx:286`, `AIChatView.jsx:91`). Prompt engineering that belongs on the server lives in JSX. This is almost certainly the most valuable half-built thing in the repo.

Other orphans:

| Endpoint | What it does | Why it matters |
|---|---|---|
| `GET /api/v1/dashboard/export/csv` | complete CSV export of all stairs with 15 columns | Every one of the **10 "Export" buttons** in the UI opens a print dialog. There is **no data export at all** — a client asking for "the data in a spreadsheet" has no answer, and the endpoint is finished |
| `POST /api/v1/dashboard/onboarding/quickstart` | seeds a full OKR/BSC template staircase, bilingual | A ready-made "start from a template" that would fix the empty-Staircase problem |
| `GET/POST/DELETE /api/v1/teams` | full teams CRUD + `team_members` + `teams.name_ar` | No teams UI exists; the sharing model is org-wide only |
| `POST /api/v1/stairs/{id}/progress` + `GET /history` | progress log with history | Progress is a slider in StairEditor; nothing is ever logged or charted |
| `GET/POST /api/v1/stairs/{id}/relationships` + `POST /relationships` | typed cross-links between elements | No UI |
| `POST/GET /api/v1/stairs/{id}/kpi` + `GET /kpis/summary` | KPI measurements | No UI, despite `typeColors.kpi` existing in `constants.js:14` |
| `PUT /api/v1/alerts/{id}` | acknowledge/dismiss an alert | Alerts can be viewed and exported but **never dismissed** — the list only grows |
| `GET /api/v1/knowledge/kpis`, `/mena-intel`, `/measurement-tools/{code}`, `POST /reload` | 4 knowledge endpoints | `KnowledgeLibrary` fetches only 4 of 9 knowledge tables; `kb_authors`, `kb_leading_lagging_kpis`, `kb_mena_market_intel`, `kb_ontology_terms`, `kb_review_cadences` have no surface |
| `GET /api/v1/admin/ai-status` | per-provider failure rates, hourly + daily | No admin UI |
| `POST /api/v1/ai/status/refresh` | force provider re-probe | No caller |
| `GET /api/v1/dashboard/frameworks` | the `frameworks` table incl. `name_ar` | Wizard hardcodes its framework list instead |
| `POST /api/v1/strategies/{id}/restore`, `DELETE /{id}/permanent` | undelete + hard delete | Deleting a strategy is a `window.confirm` with no undo — the restore endpoint exists and is unreachable |
| `GET /api/v1/stairs/tree`, `/stairs`, `/{id}`, `/children`, `/ancestors` | 5 read endpoints | Superseded by `/strategies/{id}/tree` |
| `POST /api/v1/auth/register`, `GET /me`, `POST /refresh` | 3 auth endpoints | `/signup` is used instead of `/register`; `/me` and `/refresh` are never called, so a 72-hour token simply expires mid-session |
| `WS /ws/{org_id}/{user_id}` | per-org broadcast connection manager | **Zero WebSocket clients in the frontend.** The realtime layer — and the "Real-time" in "Strategy AI Interactive Real-time System" — is not connected |

### UI calling endpoints that don't exist

**None.** Every path the frontend requests resolves to a route. This is clean.

### TODO / FIXME / HACK

**Two comment markers in the entire repository**, and neither is a real TODO:

- `backend/app/routers/ai.py:232` — a user-facing "DATA QUALITY NOTE" string
- `backend/app/ai_providers.py:24` — a "NOTE:" explaining that the model id moved

No `TODO`, no `FIXME`, no `HACK`, no `XXX`, no `@deprecated`. Genuinely clean.

### Commented-out and abandoned code

**None found.** No `{/* <Component /> */}` blocks, no commented-out functions, no dead JSX. The two `//` comment hits are URL-pattern documentation in `main.py:824` and `test_tenancy.py:127`.

### Dead code inside the frontend

| Dead thing | Evidence |
|---|---|
| **The welcome-slideshow "seen" gate** — `hasSeenWelcome()` / `markWelcomeSeen()` are written, exported and unit-tested, and called by **no component**. This is why the slideshow plays every time (IA-8) | `WelcomeSlideshow.jsx:12–18`; only caller is `test/welcome-slideshow.test.jsx` |
| **Upload progress reporting** — `api.js:82` wires an `xhr.upload` progress listener behind an `onProgress` callback. **No caller passes one.** Document uploads show no progress | `api.js:76–88` |
| **`onImplStepToggle` prop** — `ManifestRoom` accepts it; `StairsApp.jsx:424` never passes it | `ManifestRoom.jsx:73` |
| **`ConfidenceBadge`** — a well-built component with a tooltip listing agents, warnings and contradictions, used on exactly one surface | `SharedUI.jsx:63`, used only in `AIChatView.jsx:142` |
| **`typeColors` has 11 entries; `typeLabels` has 5.** `perspective`, `strategic_objective`, `measure`, `kpi`, `goal`, `strategy` have colours and icons but no label, and StairEditor only offers the 5 labelled types | `constants.js:14–17`, `StairEditor.jsx:23` |
| **Hardcoded knowledge counts** — a toast claims "27 frameworks, 41 books, and 12 failure patterns" while `GET /knowledge/stats` returns live counts from 9 tables. Guaranteed to drift | `guidanceConfig.js:60` vs `knowledge.py:103` |
| **AI chat history is localStorage-only** — `ConvStore` never touches the server, so conversations do not follow the account across devices, and nothing tells the user. Notes were lifted to the server; chat was not | `api.js:223–236` |

### Internal telemetry rendered on client-facing surfaces

This is the "things nobody remembers" category the client asked about, and it is the most demo-hostile thing in the product:

| Surface | What the client sees |
|---|---|
| **Executive Dashboard** → Agent Activity Log | a 20-row table of internal agent names (`document_analyst`, `validation`), task types, confidence percentages and **raw model IDs**, plus a "Failure rate 12% · 3/25" chip. On the executive dashboard. (`DashboardView.jsx:16–78`, rendered unconditionally at line 168) |
| **AI Advisor** → every message footer | `⚡ Anthropic` provider chip, `1,847 tokens`, `3 agents` (`AIChatView.jsx:142`) |
| **App header** | `⚡ {provider_display}` chip (`StairsApp.jsx:374`) |
| **Loading state** | "Document Analyst working…", "Strategy Analyst analyzing…", "Validation Agent reviewing…" (`SharedUI.jsx:157–161`) |

There is no admin/role gate on any of it — `DashboardView.jsx:168` renders the agent log for every user. Note the irony: `aiResilience.js` was written specifically so a client never sees a vendor name or a status code, and then four other surfaces print the vendor name, the model ID and the failure rate directly.

**Severity:** blocks-client-demo · **Effort:** hours (gate on `user.role === "admin"`, or delete).

---

## 8. Performance

### Bundle

No build was run (no `node_modules` in this checkout), so these are source-weight figures, which for this app are the story anyway.

**`frontend/src/exportUtils.js` is 1,994,877 bytes. 1,990,302 of them — 99.8% — are one string.**

```js
export const DEVONEERS_LOGO_URI = "data:image/png;base64,iVBOR…"   // 1.90 MB
```

- Decoded, that is a **1,056 × 992 px PNG, ~1.46 MB**, carrying embedded C2PA content-credential metadata.
- It is rendered at **40px tall** in the app header, 32px in exports, 28px in the notes export. That is **25× oversized in each dimension — roughly 615× the pixels needed**.
- Base64 inflates it by a further ~33% over the binary.
- It is imported by **11 modules**, including `StairsApp.jsx:4` — a top-level, eager, non-lazy import. Every user parses and holds 1.9 MB of string on first paint, whether or not they ever export anything.
- **The same logo also ships separately** as `public/devoneers-logo.png` (1,492,709 bytes), loaded via `<img src="/devoneers-logo.png">` at `StairsApp.jsx:366` and `StrategyLanding.jsx:56`.

**Total frontend source is 2.66 MB. 2.0 MB of it — 75% — is that one logo, shipped twice.** A 96px-tall WebP or an inline SVG wordmark would be under 8 KB and cover both uses.

**Severity:** blocks-client-demo (this is the whole first-load story) · **Effort:** hours.

### Blocking first paint

| Issue | Evidence |
|---|---|
| **No code splitting at all.** Zero `React.lazy`, zero `Suspense`, zero dynamic `import()`. Every screen is in the initial chunk — `ExecutionRoom` (120 KB), `StrategyMatrixToolkit` (72 KB), `SourceOfTruthView` (56 KB), `StrategyWizard` (45 KB), `ManifestRoom` (40 KB), `WelcomeSlideshow` (38 KB) — **371 KB of source for screens a logged-out user cannot reach.** `vite.config.js` has no `manualChunks` | `vite.config.js:7–9`; no lazy imports anywhere in `src/` |
| **`exportUtils.js` is pulled into the entry chunk** by `StairsApp.jsx:4`, so the 1.9 MB logo string is in the critical path | `StairsApp.jsx:4` |
| **Wrong-colour flash before mount.** `index.html:10` paints `background: #020617` inline; the app then renders `#0a1628`. Two different near-blacks, so there is a visible shift on every load | `index.html:10` vs `StairsApp.jsx:360` |
| **No preconnect to the API origin.** The app calls `https://stairs-production.up.railway.app` with no `<link rel="preconnect">`, so the first authenticated request pays full DNS + TLS | `index.html`, `constants.js:5` |
| **No font strategy.** `'DM Sans'`, `'Instrument Serif'`, `'Noto Kufi Arabic'` are named in `font-family` and **never loaded** — no `@font-face`, no stylesheet link, nothing in `public/`. The app silently falls back to system fonts everywhere, including the Arabic face | `StairsApp.jsx:360,367`, `StrategyLanding.jsx:20,23,56`, `LoginScreen.jsx:114` |

That last one is worth stating plainly: **the app's chosen typefaces do not exist in the build.** Every serif wordmark and every Arabic string renders in a system fallback. Part of "the interface needs a facelift" may simply be that nobody has ever seen the intended typography.

### Re-render behaviour

| Issue | Evidence |
|---|---|
| **All application state lives in one component.** `StairsApp` holds 24 `useState` hooks; every one of them re-renders the entire tree including the active view | `StairsApp.jsx:36–66` |
| **Zero memoisation of components.** `React.memo` is used **0 times**. `useMemo` appears 7 times, `useCallback` 27 — all inside leaf components, none on the expensive paths | across `src/` |
| **A 60-second interval re-renders the whole app.** The AI-provider poll calls `setAiProvider` every 60s, re-rendering `StairsApp` and every child, forever | `StairsApp.jsx:136–142` |
| **The staircase tree re-renders wholesale on every expand.** `renderStair` is a closure over component state, recursive, and not memoised; expanding one node re-renders every node | `StaircaseView.jsx:142–195` |
| **`ExecutionRoom` re-renders on every window resize** — an unthrottled `resize` listener calls `setIsNarrow` on each event, and the component is 1,869 lines | `ExecutionRoom.jsx:142–144` |
| **Strategy creation is serial.** N elements POST one at a time in an awaited `for` loop; a 30-element strategy is 30 sequential round-trips behind a single "Creating…" | `StairsApp.jsx:204–213` |

### Lists

**No missing keys.** Every JSX list render carries a `key` — I checked all 34 candidate sites and the flagged ones were all template-literal HTML builders for the print stylesheets, not React. This is clean.

**No virtualisation**, and two lists that need it eventually: the staircase tree (unbounded, recursive, fully rendered including collapsed subtrees) and Source of Truth (server-side search and filter, but unbounded client rendering). The Agent Activity log is capped at 20 rows (`DashboardView.jsx:63`) — the only bounded list in the app.

**Severity:** polish for re-renders; blocks-client-demo for the logo · **Effort:** hours for the logo and the flash; a day for code splitting; multi-day for state architecture.

---

## 9. Prioritised list

Ordered by what a client sees first and judges hardest.

| # | Fix | Section | Severity | Effort |
|---|---|---|---|---|
| 1 | **Delete or admin-gate the agent telemetry** — agent names, model IDs, token counts, failure rates on the executive dashboard, in every chat message and in the header | §7 | blocks-client-demo | hours |
| 2 | **Replace the 1.9 MB base64 logo** with a small asset; drop the eager import; fix the `#020617` → `#0a1628` first-paint flash | §8 | blocks-client-demo | hours |
| 3 | **Gate the welcome slideshow** — call the `markWelcomeSeen` gate that already exists, so nine slides stop playing on every load | §1 IA-8 | blocks-client-demo | hours |
| 4 | **Distinguish "error" from "empty"** — a shared `LoadState` with retry across 11 surfaces. Stop showing a confident 0% dashboard when the fetch failed | §4 | blocks-client-demo | a day |
| 5 | **Fix the 390px header** — the sign-out control is currently pushed off-screen with no overflow handling | §6 | blocks-client-demo | hours |
| 6 | **Surface an error when strategy creation fails** — currently silent, at the most important moment in the product | §4 | blocks-client-demo | hours |
| 7 | **Build the light token layer and convert the shell** — CSS custom properties + Tailwind `@theme`; repoint `constants.js`, `glass()`, `inputCls`, `labelCls`, `SharedUI`, `Sidebar`, `StairsApp` to the ExportPDF palette. Makes the app read as light in one pass | §2 | blocks-client-demo | 2 days |
| 8 | **Sweep the six large views to light** — ExecutionRoom, SourceOfTruth, MatrixToolkit, ManifestRoom, Wizard, ActionPlans (386 of the 792 lines) | §2 | blocks-client-demo | 3–4 days |
| 9 | **Repair contrast** — retire `text-gray-600`/`-700` (99 nodes below 3:1), lift `text-gray-500` (141 nodes below 4.5:1), fix the sidebar labels and the ProgressRing track | §2 | embarrassing | a day |
| 10 | **Put the Execution Room in the navigation**, and give all 10 views a heading | §1 IA-1, IA-2 | blocks-client-demo | hours |
| 11 | **Retire sub-10px type** — 186 uses of `text-[10px]`/`[9px]`/`[8px]`; collapse ~19 sizes to a 7-step scale | §2 | embarrassing | a day |
| 12 | **Fix the naming collisions** — Manifest Room vs Execution Room (worse in Arabic), Recommendations vs Solutions, Action Plans tab vs view, ST.AIRS vs Stairs, the `&I` glyph | §1 IA-3–6, IA-12 | embarrassing | hours |
| 13 | **Translate the login screen and the wizard**, and pass `lang` to `LoginScreen`; set `dir`/`lang` on `<html>` | §5 | embarrassing | a day |
| 14 | **Extract `Button`, `Card`, `Badge` and one export stylesheet** — 48 button signatures → 4 variants; 5 print stylesheets → 1 | §3 | embarrassing | 2 days |
| 15 | **Give the app a self-service password reset** — today the org's only admin has no recovery path | §1 IA-7 | embarrassing | a day |
| 16 | **Load the fonts that are already specified** — DM Sans, Instrument Serif, Noto Kufi Arabic are named everywhere and shipped nowhere | §8 | embarrassing | hours |
| 17 | **Wire the CSV export** — the endpoint is complete and every "Export" currently means "print dialog" | §7 | embarrassing | hours |
| 18 | **Fix the bare responsive grids** — `grid-cols-6` and `grid-cols-5` in Source of Truth, `grid-cols-3` in Manifest Room, the Execution Room tab bar overflow, the 320px fixed strategy cards | §6 | embarrassing | a day |
| 19 | **Handle popup-blocked exports** — 9 buttons currently do nothing silently | §4 | embarrassing | hours |
| 20 | **RTL logical properties** — 83 physical-direction sites, zero RTL-aware utilities | §5 | embarrassing | 2 days |
| 21 | **Translate the Matrix Toolkit** — 1,210 lines, the entire strategy tools suite, English-only | §5 | embarrassing | 2–3 days |
| 22 | **Code-split by route** — 371 KB of unreachable-at-login screens in the entry chunk | §8 | polish | a day |
| 23 | **Consolidate the three onboarding systems** into one oriented-state | §1 IA-13 | polish | multi-day |
| 24 | **Decide on the 339 orphaned AI endpoints** — either move the 13 in-browser prompt builders onto them, or delete them | §7 | polish | multi-day |
| 25 | **Decide on the WebSocket layer** — connect it or remove it and stop calling the product real-time | §7 | polish | multi-day |
| 26 | **Add `description_ar` and `name_ar` fields**, or drop the four unreachable `_ar` columns | §5 | polish | hours |
| 27 | **Sync AI chat history to the server**, or tell the user it is device-local | §7 | polish | a day |
| 28 | **Alert dismissal** — the endpoint exists; the list currently only grows | §7 | polish | hours |

---

## 10. One week

If I had five days to make this feel finished, I would spend them on the fact that the interface is not actually *broken* — it is dark, it is uneven, and it tells on itself. **Day one goes to the things that embarrass the product in front of a client and cost almost nothing: strip the agent telemetry off the executive dashboard and out of every chat message (a client should never see a model ID or a failure rate), replace the 1.9 MB base64 logo with a real asset, stop the nine-slide welcome film from replaying on every load, and make failed loads say "couldn't load, retry" instead of confidently reporting zero progress and an empty staircase.** Days two and three go to the light conversion, done properly at the root rather than by find-and-replace: build the token layer the app never had — CSS custom properties plus a Tailwind theme — populate it with the palette the ExportPDF stylesheet already defines (warm white ground, `#1e293b` navy ink, `#B8904A` gold on the rules only, `#e5e7eb` hairlines), then repoint `glass()`, `inputCls`, `labelCls`, the Modal and the Sidebar through it. That is nine decisions covering roughly 340 of the 792 lines, and it makes the shell read as light in a single pass; the app finally matches the board deck it exports. Day four sweeps the six big views to the new tokens, kills `text-gray-600` and `-700` outright, and retires sub-10px type on a proper scale — most of what reads as "unfinished" is 186 pieces of eight-to-ten-pixel text and 99 text nodes below 3:1 contrast. Day five is orientation: put the Execution Room in the sidebar (it is the only screen where real work happens and the only one not in the menu), give all ten views a heading, and settle the naming so Manifest Room and Execution Room are not two words apart in English and one word apart in Arabic. That leaves Arabic, RTL layout, the component library and the 339 lines of orphaned AI endpoints for the following sprint — none of which a client notices in a demo, all of which will cost more the longer they sit.

---

## Added after the audit

Findings raised during the client-readiness pass rather than in the original sweep.

| # | Finding | Evidence | Severity | Effort |
|---|---|---|---|---|
| A-1 | **The strategy landing has no search, filter or sort.** Every strategy renders as a card in one wrapping list. Three-per-row is right for four strategies and wrong for twenty-six: at 27 cards the screen is roughly nine rows of scrolling with no way to narrow, order by recency, or separate active from archived. The card layout itself is fine — the missing thing is a way to not look at all of them at once. Backend already returns `status`, `updated_at` and `element_count`, so sorting and filtering need no new endpoint. | `StrategyLanding.jsx:68-90` — the full list renders unconditionally, no query state | polish, rising with account age | a day |
| A-2 | **The unlayered `*` reset was zeroing every spacing utility.** Fixed in stage 1 of the light rebuild. Recorded here because it invalidates the "field sizing" work in `fc01e1c`: that pass shipped `px-3 py-2.5` → `px-4 py-3.5` and the padding was swallowed, so only the font-size and radius changes landed. The client's original "the box is too tight and the fields are very small" was a literal bug report, not a preference. | `index.html:36` (removed); measured input 24.5px → 52.5px, primary button 20px → 44px | done | — |
| A-3 | **Two colours in the app diverge from the rest of it and nothing made that visible.** The welcome slideshow carries its own gold (`#f5b731`/`#ffd666`, brighter than `#B8904A`/`#e8b94a`) and its own ground (`#0a0e1a`, darker than `#0a1628`), across 60 call sites. Stage 2 preserved both exactly rather than folding them in — collapsing a colour is a palette decision, not a side effect of plumbing — but they now sit as four lines in `tokens.css` where stage 3 can kill them in one edit. | `tokens.css` `--accent-bright`, `--accent-bright-hi`, `--surface-app-deep` | polish | minutes, once decided |
| A-4 | **Three gradients had already collapsed to flat fills.** `linear-gradient(135deg, #8b5cf6, #a78bfa)` and two others were written as two loose colour literals; when both stops resolved to the same role the gradient silently became a solid. Gradients are now one token each (`--grad-violet`, `--grad-indigo`, `--grad-amber`, `--grad-blue`, `--grad-accent`), so a pair cannot drift apart. 45 of the 49 gradient sites in the app were the same gold pair written out longhand. | `tokens.css` `--grad-*` | done | — |
| A-5 | **The print documents are a second palette and must stay literal.** `pdfStyles`, `EXPORT_STYLES` and the four inline export templates render into `about:blank` windows that never load `tokens.css`, so a `var()` there resolves to nothing. 289 colour literals live in that boundary and were deliberately left alone; `KnowledgeLibrary`'s three shared colour maps had to be split into a screen set and a print set for the same reason. Worth knowing before anyone "finishes the job" on the remaining literals. | `exportUtils.js:15`, `ManifestRoom.jsx:10`, `ActionPlansView.jsx:11`, `KnowledgeLibrary.jsx:44-56` | by design | — |
