# CLAUDE.md — Stairs Development Guide

Stairs (Strategy AI Interactive Real-time System) is a full-stack strategic planning platform with AI-powered analysis. FastAPI + PostgreSQL backend, React + Vite + Tailwind frontend.

## Project Structure

```
backend/
  app/
    main.py              # FastAPI app, middleware, lifespan, knowledge cache
    helpers.py           # Shared utils: auth, JWT, passwords, row conversion
    db/connection.py     # asyncpg connection pool
    models/schemas.py    # Pydantic request/response models
    routers/
      auth.py            # /api/v1/auth/* (login, register, me, refresh, invites, passwords)
      stairs.py          # /api/v1/stairs/* (CRUD, tree, progress, relationships, KPIs)
      strategies.py      # /api/v1/strategies/* (strategy containers CRUD)
      knowledge.py       # /api/v1/knowledge/* (frameworks, books, failure patterns)
      ai.py              # /api/v1/ai/* (chat, analyze, generate)
      dashboard.py       # /api/v1/dashboard/*, alerts, teams, export, onboarding
      websocket.py       # /ws/{org_id}/{user_id}
  tests/
  schema.sql
  Dockerfile
  docker-compose.yml
  requirements.txt

frontend/
  src/
    main.jsx             # React entry point
    StairsApp.jsx        # App orchestrator (state, routing, auth)
    constants.js         # API URL, colors, type mappings, CSS helpers
    api.js               # StairsAPI, ConvStore, StrategyAPI, NotesStore
    components/
      LoginScreen.jsx    # Auth form
      StrategyLanding.jsx # Strategy list/selection
      StrategyWizard.jsx  # AI-assisted strategy creation
      StaircaseView.jsx   # Hierarchical staircase visualization
      StairEditor.jsx     # Element CRUD modal
      DashboardView.jsx   # Executive dashboard with KPIs
      AIChatView.jsx      # AI chat interface
      AlertsView.jsx      # Alert notifications
      KnowledgeLibrary.jsx # Knowledge engine browser
      NotesView.jsx       # Notes with pin, search, export
      SharedUI.jsx        # HealthBadge, ProgressRing, Modal
      Markdown.jsx        # Simple markdown renderer
    test/
  package.json
  vite.config.js
  index.html
```

## Commands

### Backend
```bash
cd backend
pip install -r requirements.txt        # Install dependencies
uvicorn app.main:app --reload          # Dev server on :8000
pip install -r requirements-dev.txt    # pytest — not in requirements.txt
python -m pytest tests/ -v             # Run tests (252 tests, no database needed)
```

### Frontend
```bash
cd frontend
npm install                            # Install dependencies
npm run dev                            # Dev server on :5173
npm test                               # Run tests (376 tests, vitest)
npm run test:watch                     # Tests in watch mode
npm run build                          # Production build to dist/
npm run audit:contrast                 # Palette gate; `dark` for the other theme
npm run audit:controls                 # Filled-control gate; reads the components
```

### Docker
```bash
cd backend
# Requires: POSTGRES_PASSWORD and JWT_SECRET env vars
POSTGRES_PASSWORD=secret JWT_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(48))") docker compose up
```

## Environment Variables

Copy `.env.example` to `.env` at the repo root. Key variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes (prod) | `postgresql://stairs@localhost:5432/stairs` | PostgreSQL connection string |
| `JWT_SECRET` | **Yes, always** | none — startup fails without it | Auth token signing secret. Every org filter trusts the `org` claim in this token, so a guessable key is a master key. Generate: `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Verify without revealing it: `python backend/scripts/check_jwt_secret.py` |
| `ANTHROPIC_API_KEY` | No | empty (AI features return mock data) | Claude API key |
| `CLAUDE_MODEL` | No | `claude-sonnet-4-20250514` | Anthropic model ID |
| `ALLOWED_ORIGINS` | No | localhost + `*.vercel.app` | CORS origins, comma-separated. `*` is **not** honoured — this API sends credentials, and wildcard-with-credentials is invalid per the CORS spec |
| `RATE_LIMIT_WINDOW` | No | `60` | Rate limit window in seconds |
| `RATE_LIMIT_MAX` | No | `100` | Max requests per window per IP |
| `PORT` | No | `8000` | Backend server port |
| `VITE_API_URL` | No | production API URL | **Frontend, build-time.** Which backend the built bundle calls. Set on preview deployments to keep them off production data |

## Architecture Notes

- **Database**: PostgreSQL via asyncpg connection pool. Schema auto-initializes from `schema.sql` on first startup if tables don't exist. Railway auto-injects `DATABASE_URL`.
- **Auth**: JWT tokens (python-jose) with bcrypt password hashing. `get_auth` requires a `Bearer` token and raises 401 without one — there is no unauthenticated fallback. `DEFAULT_ORG_ID`/`DEFAULT_USER_ID` belong to the seed data only, never to a request path.
- **Passwords**: `POST /api/v1/auth/password` changes your own (current password required). Admins issue single-use, expiring reset links via `POST /api/v1/auth/password/reset-links`; the holder redeems one at `/?reset=<token>`. Tokens are returned once, at creation. Setting a hash directly with pgcrypto works too — `crypt(pw, gen_salt('bf', 12))` produces `$2a$`, which the Python side verifies.
- **Sessions**: JWTs are stateless with a 72-hour expiry and carry `org` and `role` as claims. There is **no revocation** — a password change, role change or organization move takes effect at next login, and existing tokens remain valid until they expire. Rotating `JWT_SECRET` is the only way to end every session at once.
- **Tenancy**: every tenant-owned table carries its own `organization_id` and every query filters on it. Registration creates a **new organization per signup** with the registrant as its admin; joining an existing organization requires an invitation token minted by an admin of that organization (`POST /api/v1/auth/invites`). Cross-organization access returns 404, not 403, so an unauthorised caller learns nothing about whether an id exists.
- **AI**: Anthropic Claude API via httpx. Knowledge engine caches strategy frameworks, failure patterns, measurement tools into system prompts. Falls back gracefully when `ANTHROPIC_API_KEY` is unset.
- **WebSocket**: Connection manager with per-org broadcast at `/ws/{org_id}/{user_id}`.
- **Frontend state**: All state lives in `StairsApp.jsx`. No external state management library. API classes in `api.js` wrap fetch calls. `ConvStore` and `NotesStore` persist to localStorage.
- **Styling**: Tailwind CSS v4 via Vite plugin. Glass-morphism theme with `glass()` helper in `constants.js`.

## Testing

- **Backend**: pytest with asyncio support. Tests cover helpers (row conversion, health computation, code generation, password hashing, JWT), Pydantic schemas, and main app logic. No database required — tests mock the connection pool.
- **Frontend**: vitest with jsdom + @testing-library/react. Tests cover constants validation, API/store classes (localStorage mocking), and component rendering.
- **CI**: `.github/workflows/ci.yml` runs one thing per job on every PR to `main` — `lint` (correctness rules only), `frontend` (vitest + build), `backend` (pytest), `contrast-light`/`contrast-dark` (the palette audit), and `controls` (the filled-control audit).

### Three ways a green check passes over broken code

All three have shipped a broken control under a green suite. None is caught by
anything except knowing about them.

**1. A mock proves the component, not the app.** Rendering a view with
`vi.fn()` props asserts the view calls its callback. It says nothing about the
callback the app hands it. `onOpenManifest` spent its life calling a state
setter that had been deleted, throwing `ReferenceError` on every click, while
a test passing `vi.fn()` stayed green.

For anything whose job is to navigate or mutate app state, add a case to
`src/test/appWiring.test.jsx`: it mocks the network boundary and nothing else,
renders the real `<App />`, drives it by hash the way a person drives it, and
asserts on where `window.location.hash` lands.

**2. An unscoped query matches the wrong element.** The Execution Room is a
full-screen overlay, and the sidebar underneath it stays mounted — naming
several of the same destinations. `getByRole('button', { name: /Manifest
Room/i })` matches the *sidebar nav item*, clicks it, and passes while the
room's own control is still dead. Same false green, new costume.

Scope every query to the surface under test:

```js
const room = await screen.findByTestId('execution-room');
fireEvent.click(within(room).getByRole('button', { name: /Manifest Room/i }));
```

The rule generalises past this one overlay: if two surfaces can be mounted at
once, a bare `screen.*` query is ambiguous by construction, and the ambiguity
resolves in whichever direction makes your test pass.

**3. The check and the thing being checked drift apart.** The palette audit
asserts `--ink-on-accent` on gold at 5.82:1, and passed every run for months
while every filled gold button in the app printed `--surface-app` on gold at
2.78:1 — the primary call-to-action, unreadable in the default theme. The audit
was not wrong. It was measuring a different application than the one shipping.

Any check that names its subject in its own words — a hand-written list of
pairs, a fixture, a mock, a snapshot — describes the code as it was understood
on the day it was written, and goes on reporting on that version. It does not
notice the component reaching past the token it asserts.

So derive the check from the thing, and the two cannot disagree.
`scripts/control-contrast.mjs` reads `tokens.css`, `constants.js` and every
`.jsx`, and measures the (fill, ink) pairs the components actually paint — it
cannot pass while the buttons are wrong, because the buttons are its input. It
also prints what it could not resolve, with a count, because a check that
silently skips the hard cases is back to describing an app of its own choosing.

The generalisation worth keeping: when you find one instance of a bug, find the
assertion that should have caught it and ask what that assertion is reading. If
the answer is "a copy of what the code used to do", fixing the instance buys you
nothing but time.

**And a green CI does not mean it looks right.** The suite runs in jsdom, which
has no layout engine and draws nothing. It cannot see wrapping, overflow,
truncation, contrast, or direction. The RTL breadcrumb separator is the honest
example: the test pins the *codepoint* (U+203A, never hand-swapped), because
that is the decision worth protecting — but what the engine *draws* from it was
established by rendering the component in Chromium and comparing bitmaps, and
nothing in CI re-checks it. A change that flips the crumbs backwards passes
every check.

So anything whose failure mode is visual — a header that wraps at 390, a
palette that dips under contrast, a control that mirrors the wrong way — needs
eyes or pixels, not a green tick. Render it at the widths and directions you
claim to support and look.

## Code Style

- Python: No linter config — follow existing patterns (no type stubs on internal functions, minimal docstrings).
- JavaScript: No ESLint/Prettier config — follow existing patterns (functional components, arrow functions, concise JSX).
- Commit messages: imperative mood, summary line under 72 chars.
