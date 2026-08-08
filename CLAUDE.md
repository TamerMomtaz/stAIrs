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
      auth.py            # /api/v1/auth/* (login, register, me, refresh)
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
python -m pytest tests/ -v             # Run tests (47 tests)
```

### Frontend
```bash
cd frontend
npm install                            # Install dependencies
npm run dev                            # Dev server on :5173
npm test                               # Run tests (39 tests, vitest)
npm run test:watch                     # Tests in watch mode
npm run build                          # Production build to dist/
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
- **Tenancy**: every tenant-owned table carries its own `organization_id` and every query filters on it. Registration creates a **new organization per signup** with the registrant as its admin; joining an existing organization requires an invitation token minted by an admin of that organization (`POST /api/v1/auth/invites`). Cross-organization access returns 404, not 403, so an unauthorised caller learns nothing about whether an id exists.
- **AI**: Anthropic Claude API via httpx. Knowledge engine caches strategy frameworks, failure patterns, measurement tools into system prompts. Falls back gracefully when `ANTHROPIC_API_KEY` is unset.
- **WebSocket**: Connection manager with per-org broadcast at `/ws/{org_id}/{user_id}`.
- **Frontend state**: All state lives in `StairsApp.jsx`. No external state management library. API classes in `api.js` wrap fetch calls. `ConvStore` and `NotesStore` persist to localStorage.
- **Styling**: Tailwind CSS v4 via Vite plugin. Glass-morphism theme with `glass()` helper in `constants.js`.

## Testing

- **Backend**: pytest with asyncio support. Tests cover helpers (row conversion, health computation, code generation, password hashing, JWT), Pydantic schemas, and main app logic. No database required — tests mock the connection pool.
- **Frontend**: vitest with jsdom + @testing-library/react. Tests cover constants validation, API/store classes (localStorage mocking), and component rendering.

## Code Style

- Python: No linter config — follow existing patterns (no type stubs on internal functions, minimal docstrings).
- JavaScript: No ESLint/Prettier config — follow existing patterns (functional components, arrow functions, concise JSX).
- Commit messages: imperative mood, summary line under 72 chars.
