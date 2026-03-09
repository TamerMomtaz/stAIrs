# Platform DNA Report — Stairs (stAIrs)

> **Generated**: 2026-03-09
> **Purpose**: ArchTeeStrator v2 Knowledge Base — comprehensive platform blueprint for replication, adaptation, and learning.

---

## 1. Platform Identity

| Field | Value |
|---|---|
| **Name** | Stairs (Strategy AI Interactive Real-time System) |
| **Tagline** | "Where big ideas become actionable steps" |
| **Core Problem** | Strategic planning is fragmented across spreadsheets, slide decks, and meetings — no single tool connects vision to execution with AI-driven analysis and real-time tracking. |
| **Target User** | Strategic planners, executives, consultants, and SME founders in the MENA region who need to translate high-level strategy into tracked, executable action plans. |
| **Value Proposition** | A staircase metaphor that visualizes strategy as hierarchical steps (Vision → Objectives → Key Results → Initiatives → Tasks), with AI agents that analyze, advise, plan, execute, and validate at every level. Bilingual EN/AR. |
| **Build Period** | Feb 25 – Mar 1, 2026 (~5 days, 48 merged PRs) |
| **Version at Report Time** | v3.7.0 |
| **Live URLs** | Backend: Railway (`stairs-production.up.railway.app`), Frontend: Vercel |

---

## 2. Architecture Overview

### High-Level Diagram (Text)

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND (Vercel)                 │
│  React 18.3 + Vite 6 + Tailwind v4                  │
│  Single-page app, no router library                  │
│  State in StairsApp.jsx (useState/useRef)            │
│  localStorage stores: ConvStore, ManifestStore,      │
│    NotesStore, MatrixResultsStore                    │
│  WebSocket client for real-time events               │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS + WSS
┌──────────────────────▼──────────────────────────────┐
│                   BACKEND (Railway)                  │
│  FastAPI 0.115.6 + Python 3.12                       │
│  Routers: auth, stairs, strategies, ai, dashboard,   │
│    sources, data_qa, knowledge, websocket, admin     │
│  Multi-Agent Ensemble (6 agents)                     │
│  Multi-AI Fallback (Claude → GPT-4o → Gemini)       │
│  Rate Limiter (in-memory, per-IP)                    │
│  JWT Auth (python-jose + bcrypt)                     │
└──────────────────────┬──────────────────────────────┘
                       │ asyncpg
┌──────────────────────▼──────────────────────────────┐
│              PostgreSQL 16 (Railway)                 │
│  ~25+ tables (core + knowledge engine + QA)          │
│  Closure table for hierarchy traversal               │
│  Full-text search indexes                            │
│  Auto-migration on startup from schema.sql           │
└─────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              External Services                       │
│  Anthropic Claude API (primary AI)                   │
│  OpenAI GPT-4o (fallback #1)                         │
│  Google Gemini 2.0 Flash (fallback #2)               │
│  Supabase Storage (document uploads)                 │
└─────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

1. **No frontend routing library** — View state managed by a single `activeView` string in StairsApp.jsx. Fast to build, zero routing complexity, but means no browser back-button or deep-linking.
2. **No external state management** — All state lives in the root component via useState/useRef. localStorage-backed stores handle persistence for conversations, notes, manifests, matrix results.
3. **Direct asyncpg, no ORM** — Raw SQL throughout. Fast, explicit, but no migration framework — schema changes are additive SQL in `schema.sql` + runtime `ALTER TABLE IF NOT EXISTS` in `main.py`.
4. **Multi-agent ensemble over monolithic AI** — Six specialized agents (Document, Strategy, Advisor, Execution, Validation, Orchestrator) each with scoped prompts and routing logic.
5. **Multi-AI provider fallback** — Automatic cascade: Claude → GPT-4o → Gemini with per-provider retry (2 retries, 3s delay). Provider-specific prompt adaptation.

---

## 3. Tech Stack — Complete Bill of Materials

### Backend (Python 3.12)

| Package | Version | Purpose |
|---|---|---|
| fastapi | 0.115.6 | Web framework |
| uvicorn | 0.34.0 | ASGI server |
| asyncpg | 0.30.0 | PostgreSQL async driver |
| pydantic | 2.10.4 | Request/response validation |
| httpx | 0.28.1 | HTTP client for AI APIs |
| python-jose | 3.3.0 | JWT token handling |
| passlib | 1.7.4 | Password hashing framework |
| bcrypt | 4.0.1 | bcrypt backend for passlib |
| python-multipart | 0.0.17 | File upload parsing |
| pdfplumber | 0.11.4 | PDF text extraction |
| python-docx | 1.1.2 | DOCX text extraction |
| openpyxl | 3.1.5 | XLSX text extraction |

### Frontend (Node.js)

| Package | Version | Purpose |
|---|---|---|
| react | 18.3.1 | UI library |
| react-dom | 18.3.1 | React DOM renderer |
| vite | 6.0.x | Build tool / dev server |
| @tailwindcss/vite | 4.1.18 | Tailwind CSS v4 Vite plugin |
| tailwindcss | 4.1.18 | Utility-first CSS |
| vitest | 2.1.8 | Test runner |
| @testing-library/react | 16.1.0 | Component testing |
| jsdom | 25.0.1 | DOM environment for tests |

### Infrastructure

| Service | Purpose |
|---|---|
| Railway | Backend hosting + PostgreSQL 16 |
| Vercel | Frontend hosting + CDN |
| Supabase Storage | Document file uploads |
| Docker | Local dev (docker-compose with PostgreSQL 16-alpine) |

---

## 4. Data Model

### Core Tables (from schema.sql — 572 lines)

```
organizations
  └── users (organization_id FK)
       └── teams → team_members (M2M)

strategies (organization_id, owner_id)
  └── stairs (strategy_id) — polymorphic: vision|objective|key_result|initiative|task
       ├── stair_relationships (from_stair_id, to_stair_id, type)
       ├── stair_closure (ancestor_id, descendant_id, depth) — closure table
       ├── stair_progress (stair_id, date, value)
       └── kpi_measurements (stair_id, date, actual, target)

ai_conversations (strategy_id, user_id)
  └── ai_messages (conversation_id)

ai_alerts (strategy_id)
ai_feedback (stair_id)
activity_log (organization_id, user_id)
ai_usage_logs (organization_id, user_id)
integrations (organization_id)

strategy_sources (strategy_id) — Source of Truth
agent_logs (strategy_id) — Agent transparency
```

### Knowledge Engine Tables (from run_migration.py — 11 tables)

```
kb_authors, kb_books, kb_book_authors (M2M)
kb_frameworks (17 seeded)
kb_failure_patterns (8 seeded)
kb_ontology_terms
kb_review_cadences
kb_leading_lagging_kpis
kb_mena_market_intel
stair_versions (audit trail)
realtime_events
```

### The `stairs` Table — The Core Polymorphic Entity

The `stairs` table is the heart of the platform. A single table stores all hierarchy levels:

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| strategy_id | UUID | FK to strategies |
| organization_id | UUID | FK to organizations |
| parent_id | UUID | Self-referential FK |
| type | VARCHAR | vision, objective, key_result, initiative, task |
| level | INT | Depth in hierarchy (0-4) |
| title, title_ar | VARCHAR | Bilingual |
| description, description_ar | TEXT | Bilingual |
| progress_percent | DECIMAL | 0-100 |
| health_status | VARCHAR | on_track, at_risk, off_track, achieved |
| owner_id | UUID | Assignee |
| start_date, end_date | TIMESTAMP | Timeline |
| sort_order | INT | Ordering within parent |
| tags | JSONB | Flexible metadata |
| deleted_at | TIMESTAMP | Soft delete |

**Key insight**: The polymorphic single-table approach with a `type` discriminator + closure table for traversal was the fastest path to a working hierarchy. Trade-off: no per-type column constraints, but the Pydantic schemas enforce structure at the API boundary.

---

## 5. API Design

### Route Structure

```
/api/v1/auth/
  POST /register          — Create org + admin user
  POST /signup            — Join existing org
  POST /login             — Get JWT token
  GET  /me                — Current user profile
  POST /refresh           — Refresh JWT

/api/v1/strategies/
  GET    /                — List user's strategies
  POST   /                — Create strategy
  GET    /{id}            — Get strategy
  PUT    /{id}            — Update strategy
  DELETE /{id}            — Archive strategy
  POST   /{id}/restore    — Restore archived
  DELETE /{id}/permanent  — Permanently delete
  GET    /{id}/tree       — Full hierarchy tree

/api/v1/stairs/
  GET    /                — List stairs (by strategy_id query param)
  POST   /                — Create stair element
  GET    /{id}            — Get single stair
  PUT    /{id}            — Update stair
  DELETE /{id}            — Soft delete
  POST   /{id}/progress   — Record progress
  GET    /{id}/progress   — Get progress history
  POST   /relationships   — Create stair relationship
  GET    /{id}/relationships — Get relationships
  POST   /{id}/kpi        — Record KPI measurement
  GET    /{id}/kpi        — Get KPI history
  GET    /action-plans/{strategy_id} — Get all action plans
  PUT    /action-plans/{stair_id}/{plan_id}/tasks/{task_idx} — Toggle task

/api/v1/ai/
  POST /chat              — AI chat (routed through orchestrator)
  POST /analyze           — Strategic analysis
  POST /generate          — Generate elements
  POST /questionnaire     — Generate questionnaire
  POST /extract-document-text — Extract text from doc
  POST /prefill-questionnaire — AI prefill from document
  POST /action-plan       — Generate action plan
  POST /customized-plan   — Customized plan from assessment
  POST /explain-action    — Explain an action item
  POST /implementation-guide — Full implementation guide

/api/v1/dashboard/
  GET  /stats             — Executive metrics
  GET  /alerts            — Active alerts
  POST /alerts            — Create alert
  PUT  /alerts/{id}/dismiss — Dismiss alert
  GET  /frameworks        — Loaded frameworks list
  GET  /teams             — Team list
  GET  /export/csv        — CSV export
  GET  /onboarding/quickstart — Quickstart data

/api/v1/sources/
  Full CRUD + document upload + AI analysis + extraction approval

/api/v1/data-qa/
  6-layer quality pipeline: relevance, contradictions, conflicts,
  confidence scores, quarantine, impact tracing

/api/v1/knowledge/
  GET /frameworks, /books, /failure-patterns, /measurement-tools

/ws/{org_id}/{user_id}  — WebSocket for real-time events
```

### Auth Pattern

- JWT tokens in `Authorization: Bearer <token>` header
- 72-hour expiry (configurable via `JWT_EXPIRY_HOURS`)
- `get_auth()` dependency extracts org_id + user_id from token
- Dev fallback: when no token present, uses default org/user IDs (convenience for local dev)
- Frontend: 401 interceptor on `api._fetch()` calls `_handleUnauthorized()` → logout + redirect

### Error Handling Pattern

- FastAPI `HTTPException` for expected errors (400, 401, 404)
- Global exception handler catches unhandled errors, logs traceback, returns 500 with CORS headers
- Frontend: `api._fetch()` wraps all calls with try/catch, specific handlers for 401 (auth) and 529 (AI overloaded with retry)

---

## 6. Frontend Architecture

### Component Hierarchy

```
main.jsx
└── StairsApp.jsx (333 lines) — THE root component
    ├── LoginScreen.jsx — Auth gate
    ├── StrategyLanding.jsx — Strategy list/selection
    ├── StrategyWizard.jsx — AI-assisted strategy creation
    ├── [Active view based on activeView state]:
    │   ├── DashboardView.jsx (151 lines) — Executive KPIs + agent activity
    │   ├── StaircaseView.jsx (63 lines) — Recursive tree visualization
    │   ├── AIChatView.jsx (139 lines) — Multi-turn AI chat
    │   ├── StrategyToolsPanel.jsx (74 lines) — 5 matrix frameworks
    │   ├── ActionPlansView.jsx (411 lines) — Plan aggregation + progress
    │   ├── ExecutionRoom.jsx (1,724 lines) — 4-phase execution pipeline ★ LARGEST
    │   ├── ManifestRoom.jsx (596 lines) — Manifest aggregation + PDF
    │   ├── SourceOfTruthView.jsx (1,108 lines) — Evidence management + QA
    │   ├── KnowledgeLibrary.jsx — Framework browser
    │   ├── NotesView.jsx — Notes with pin/search/export
    │   ├── AlertsView.jsx — Alert notifications
    │   └── DataHealthView (embedded in dashboard)
    └── SharedUI.jsx (156 lines) — HealthBadge, ProgressRing, Modal, ConfidenceBadge
```

### State Management Pattern

**No Redux, no Zustand, no Context API for global state.** Everything flows from StairsApp.jsx:

```javascript
// StairsApp.jsx — all major state
const [user, setUser] = useState(null);           // Auth
const [strategies, setStrategies] = useState([]); // Strategy list
const [activeStrategy, setActiveStrategy] = useState(null);
const [activeView, setActiveView] = useState("dashboard");
const [stairs, setStairs] = useState([]);         // Current hierarchy
const [lang, setLang] = useState("en");           // Bilingual toggle
```

**localStorage-backed persistence** (for data that shouldn't hit the server on every page load):

| Store | Purpose | Key Pattern |
|---|---|---|
| ConvStore | AI conversation history | `stairs_conv_{strategy_id}` |
| NotesStore | User notes | `stairs_notes` |
| ManifestStore | Execution manifests | `stairs_manifest_{stair_id}_{task_name}` |
| MatrixResultsStore | Strategy matrix results | `stairs_matrix_results_{strategy_id}` |

**Cross-component sync**: Custom DOM events (`manifest-updated`, `storage` events) for cross-tab and same-tab synchronization.

### Styling System

- **Tailwind CSS v4** via Vite plugin (no config file — uses CSS-based config)
- **Glass-morphism theme**: `glass(opacity)` helper returns `{ background: rgba(22,37,68,op), border: 1px solid rgba(30,58,95,0.5) }`
- **Color constants**: GOLD (#B8904A), TEAL (#2A5C5C), CHAMPAGNE (#F7E7CE), DEEP (#0a1628)
- **Type-based coloring**: Each stair type has a unique color (vision=gold, objective=blue, KR=green, initiative=purple, task=slate)
- **PDF exports**: Custom HTML generated in `exportUtils.js`, rendered via `window.print()` in a new window

### Bilingual Pattern

```javascript
const isAr = lang === "ar";
// Usage throughout:
<h2>{isAr ? stair.title_ar || stair.title : stair.title}</h2>
```

Every user-facing string has an AR variant. The `lang` toggle is at the app level. Arabic triggers `dir="rtl"` on the container.

---

## 7. Backend Architecture

### Router Organization

| Router | File Lines | Endpoints | Responsibility |
|---|---|---|---|
| auth.py | ~130 | 5 | Registration, login, JWT lifecycle |
| strategies.py | 205 | 7 | Strategy CRUD + tree |
| stairs.py | 371 | 11 | Element CRUD, progress, relationships, KPIs, action plans |
| ai.py | 800 | 10 | All AI interactions (chat, analyze, generate, plans) |
| dashboard.py | ~200 | 7 | Stats, alerts, frameworks, teams, export |
| sources.py | 525 | ~8 | Source of Truth + document upload/analysis |
| data_qa.py | 863 | ~10 | 6-layer data quality pipeline |
| knowledge.py | ~80 | 4 | Knowledge engine browser |
| websocket.py | ~80 | 1 | WebSocket connection manager |
| admin.py | ~50 | 2 | AI monitoring + agent stats |

### Multi-Agent Ensemble

```
Orchestrator (414 lines)
├── DocumentAgent  — Extracts data from uploaded documents
├── StrategyAgent  — Runs 5 frameworks (IFE, EFE, SPACE, BCG, Porter)
├── AdvisorAgent   — Conversational strategy advisor
├── ExecutionAgent — Action plans + implementation guides
└── ValidationAgent — Reviews other agents' outputs (confidence 0-100)
```

**Routing logic**: Orchestrator inspects the request type and keywords:
- Document-related → DocumentAgent
- Framework keywords (IFE, EFE, SPACE, etc.) → StrategyAgent
- Action plan / implementation → ExecutionAgent
- General chat → AdvisorAgent
- All outputs optionally pass through ValidationAgent (regenerates if confidence < 60)

**Base agent pattern**: Each agent extends `BaseAgent` with a `call()` method that:
1. Builds a scoped system prompt
2. Injects Source of Truth context (approved sources for the strategy)
3. Calls the multi-AI fallback provider
4. Logs to `agent_logs` table for transparency

### Knowledge Engine

Loaded once on startup into an in-memory cache (`main.py` lifespan):

```python
knowledge_cache = {
    "frameworks": [...],      # 17 frameworks (IFE, EFE, SPACE, BCG, Porter, SWOT, etc.)
    "books": [...],           # 15 strategy books with authors
    "failure_patterns": [...], # 8 patterns (Strategy-Culture Gap, Analysis Paralysis, etc.)
    "measurement_tools": [...] # KPI pairs, review cadences
}
```

This cache is injected into AI agent system prompts so every response is grounded in established strategy frameworks.

### Database Access Pattern

```python
pool = await get_pool()  # Singleton asyncpg pool
async with pool.acquire() as conn:
    row = await conn.fetchrow("SELECT ...", param1, param2)
    return row_to_dict(row)  # Converts UUID, Decimal, datetime, JSONB
```

No ORM. No query builder. Raw parameterized SQL everywhere. The `row_to_dict()` helper handles type conversion for JSON serialization.

### Auto-Migration Strategy

Two-phase approach:
1. **`schema.sql`** — Full schema loaded on first startup via `connection.py` if tables don't exist
2. **Runtime migrations in `main.py`** — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS` for columns/tables added after initial schema

```python
# main.py lifespan — additive migrations
await conn.execute("ALTER TABLE strategies ADD COLUMN IF NOT EXISTS company VARCHAR(500)")
await conn.execute("CREATE TABLE IF NOT EXISTS notes (...)")
await conn.execute("CREATE TABLE IF NOT EXISTS action_plans (...)")
await conn.execute("CREATE TABLE IF NOT EXISTS strategy_sources (...)")
await conn.execute("CREATE TABLE IF NOT EXISTS agent_logs (...)")
await conn.execute("CREATE TABLE IF NOT EXISTS ai_usage_logs (...)")
```

**What worked**: Zero-downtime additive migrations. No migration files to manage.
**What didn't**: No down migrations, no version tracking, no way to know which migrations have run (relies on `IF NOT EXISTS`).

---

## 8. AI Integration Layer

### Multi-Provider Fallback (`ai_providers.py` — 383 lines)

```
Primary:   Claude claude-sonnet-4-20250514 (ANTHROPIC_API_KEY)
Fallback1: GPT-4o (OPENAI_API_KEY)
Fallback2: Gemini 2.0 Flash (GOOGLE_API_KEY)
```

**Retry logic**: 2 retries per provider with 3-second delay, then cascade to next provider.

**Provider-specific adaptation**:
- Claude: Uses `anthropic.com/v1/messages` with system prompt as top-level field
- OpenAI: Uses `chat/completions` with system message in messages array
- Gemini: Uses `generateContent` with system_instruction field

**Metrics**: In-memory counters per provider (calls, failures, total_latency) exposed via `/api/v1/admin/ai-status`.

### Frontend AI UX Patterns

1. **529 (Overloaded) retry**: Frontend detects 529 status, shows "AI is busy, retrying..." message, auto-retries with user feedback callback
2. **Suggestion chips**: Quick-action buttons in chat for common queries ("Run IFE Matrix", "Analyze my strategy", etc.)
3. **Load into Matrix**: AI responses containing framework tables get a "Load into Matrix Calculator" button that parses the response and prefills the interactive worksheet
4. **Agent activity indicator**: Animated step indicator showing which agent is processing ("Analyzing...", "Validating...", "Completing...")

### Source of Truth Integration

When AI agents generate responses, they receive approved source data as context:

```python
# base_agent.py — Source of Truth injection
sources = await conn.fetch(
    "SELECT * FROM strategy_sources WHERE strategy_id = $1 AND status = 'approved'",
    strategy_id
)
context += f"\n\nApproved Sources:\n{format_sources(sources)}"
```

This ensures AI responses are grounded in the user's actual uploaded evidence, not just general knowledge.

### Data Quality Pipeline (6 Layers)

```
Layer 1: Relevance Check    — Is this data relevant to the strategy?
Layer 2: Contradiction Detection — Does it contradict existing sources?
Layer 3: Conflict Resolution — AI-suggested resolution for conflicts
Layer 4: Confidence Scoring — Per-source confidence (0-100)
Layer 5: Quarantine         — Isolate questionable data
Layer 6: Impact Tracing     — What depends on this data?
```

AI agents weight their recommendations based on data confidence scores. Quarantined data is excluded from AI context.

---

## 9. Auth & Security

### Authentication Flow

```
Register → Create org + admin user → Get JWT
Login → Verify bcrypt hash → Get JWT (72h expiry)
Every request → Authorization: Bearer <token> → get_auth() extracts claims
Token expiry → Frontend 401 interceptor → Logout + redirect to login
```

### Security Measures Implemented

| Measure | Implementation |
|---|---|
| Password hashing | bcrypt via passlib (CryptContext) |
| JWT signing | python-jose with HS256, configurable secret |
| CORS | Explicit origin list + regex for *.vercel.app |
| Rate limiting | In-memory per-IP, 60 req / 60 sec window |
| SQL injection | Parameterized queries (asyncpg $1, $2 placeholders) |
| Soft deletes | `deleted_at` timestamp instead of hard DELETE |
| Owner isolation | All queries filter by `organization_id` AND `owner_id` |
| Input validation | Pydantic v2 models on all request bodies |

### Security Gaps (Honest Assessment)

| Gap | Impact | Notes |
|---|---|---|
| JWT secret fallback | HIGH | Dev fallback warns but doesn't block startup |
| No refresh token rotation | MEDIUM | Token reuse possible within 72h window |
| In-memory rate limiter | MEDIUM | Resets on restart, no distributed support |
| No CSRF protection | LOW | API-only backend, JWT in header (not cookie) |
| No file type validation on upload | MEDIUM | Relies on extension check only, not magic bytes |
| CORS regex could be too broad | LOW | `.*\.vercel\.app` matches any Vercel deployment |
| No request size limits | MEDIUM | Large file uploads could exhaust memory |

---

## 10. Real-time & WebSocket

### Implementation

```python
# websocket.py — Connection Manager
class ConnectionManager:
    active_connections: dict[str, list[WebSocket]]  # org_id → connections

    async def connect(websocket, org_id, user_id)
    async def disconnect(websocket, org_id)
    async def broadcast_to_org(org_id, message)
```

**Endpoint**: `ws://{host}/ws/{org_id}/{user_id}`
**Auth**: JWT validated on connection
**Keepalive**: Client sends ping, server responds with pong
**Events broadcast**:
- `strategy_created`, `strategy_archived`, `strategy_restored`, `strategy_deleted`
- `stair_created`, `stair_updated`, `stair_deleted`
- `progress_recorded`, `kpi_recorded`

### What Worked

- Simple org-based broadcast — every user in the org gets updates
- Lightweight: no external message broker needed
- Immediate feedback when collaborators make changes

### What Didn't

- No reconnection logic on the frontend (connection drops silently)
- No message queuing — if a client is disconnected, they miss events
- No per-strategy filtering — users get all org events even if viewing a different strategy

---

## 11. Testing

### Backend Tests (47 tests)

```bash
cd backend && python -m pytest tests/ -v
```

**Coverage areas**:
- `test_helpers.py`: Row conversion (Decimal, UUID, datetime, JSONB), health computation algorithm, code generation, password hashing, JWT create/decode
- `test_schemas.py`: Pydantic model validation for all request/response schemas
- `test_main.py`: App lifespan, health check, CORS headers

**Pattern**: Mock the asyncpg connection pool. No database required for tests.

### Frontend Tests (39 tests)

```bash
cd frontend && npm test
```

**Coverage areas**:
- `constants.test.js`: Color constants, type mappings, glass helper, CSS classes
- `api.test.js`: StairsAPI, ConvStore, NotesStore, StrategyAPI (localStorage mocking)
- `SharedUI.test.jsx`: HealthBadge, ProgressRing, Modal rendering
- `LoginScreen.test.jsx`: Auth form rendering and submission

**Pattern**: vitest + jsdom + @testing-library/react. localStorage mocked globally.

### Testing Gaps

- No integration tests (API → DB round-trip)
- No E2E tests (Playwright/Cypress)
- No AI response mocking (AI endpoints untested)
- No WebSocket tests
- Frontend component tests are shallow (render + basic interaction, no complex flow testing)
- ExecutionRoom (1,724 lines, the most complex component) has no dedicated tests

---

## 12. Deployment & Infrastructure

### Production Setup

| Component | Platform | Config |
|---|---|---|
| Backend | Railway | Dockerfile (Python 3.12-slim), auto-deploy on push |
| Database | Railway | PostgreSQL 16, auto-provisioned, DATABASE_URL injected |
| Frontend | Vercel | Vite build, auto-deploy on push |
| Documents | Supabase Storage | File uploads (PDF, DOCX, XLSX, CSV) |

### Railway Backend Config (`railway.toml`)

```toml
[build]
builder = "dockerfile"
dockerfilePath = "backend/Dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

### Docker Compose (Local Dev)

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: stairs
      POSTGRES_USER: stairs
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
  api:
    build: .
    depends_on: [db]
    environment:
      DATABASE_URL: postgresql://stairs:${POSTGRES_PASSWORD}@db:5432/stairs
      JWT_SECRET: ${JWT_SECRET}
```

### Environment Variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| DATABASE_URL | Yes (prod) | localhost fallback | PostgreSQL connection string |
| JWT_SECRET | Yes (prod) | dev fallback (warns) | Token signing key |
| ANTHROPIC_API_KEY | No | empty | AI features return mock data without it |
| OPENAI_API_KEY | No | empty | Fallback AI provider |
| GOOGLE_API_KEY | No | empty | Second fallback AI provider |
| CLAUDE_MODEL | No | claude-sonnet-4-20250514 | Anthropic model ID |
| ALLOWED_ORIGINS | No | * (warns) | CORS origins |
| RATE_LIMIT_WINDOW | No | 60 | Seconds |
| RATE_LIMIT_MAX | No | 100 | Requests per window |
| PORT | No | 8000 | Server port |
| SUPABASE_URL | No | empty | Document storage |
| SUPABASE_KEY | No | empty | Document storage auth |

### Deployment Lessons

1. **CORS was the #1 deployment pain point** — PRs #13, #14, #15, #16 were all CORS fixes. The progression: explicit origins → regex for Vercel → expose_headers → global exception handler with CORS headers as safety net.
2. **Railway auto-injects `DATABASE_URL` with `postgres://`** but asyncpg requires `postgresql://` — fixed with string replacement in `connection.py`.
3. **Frontend API URL is hardcoded** in `constants.js` — no build-time env var. This means the frontend always points to production backend, even in dev.

---

## 13. Patterns That Worked

### 1. Staircase Metaphor as Core Data Model
The hierarchical stair model (Vision → Objective → KR → Initiative → Task) with a single polymorphic table + closure table was the right abstraction. It maps naturally to OKR, BSC, and other frameworks. Users intuitively understand "climbing stairs" toward a vision.

### 2. localStorage-Backed Stores for AI Conversations
Persisting AI chat history, manifests, and matrix results in localStorage eliminated the need for server-side conversation storage for most use cases. Instant page loads, offline access to history, zero server cost.

### 3. Multi-Agent Ensemble with Validation Loop
The orchestrator routing requests to specialized agents (each with scoped system prompts and knowledge) produced dramatically better results than a single monolithic AI call. The validation agent catching low-confidence outputs (<60) and triggering regeneration was a quality multiplier.

### 4. Knowledge Engine Cache
Loading strategy frameworks, books, and failure patterns into memory once at startup and injecting them into every AI prompt created a "strategy-literate" AI that references real frameworks (Porter, Mintzberg, etc.) rather than generic advice.

### 5. Source of Truth → AI Context Pipeline
The flow of: upload document → AI extraction → human approval → inject into agent context created a closed loop where AI recommendations are grounded in the user's actual data, not hallucinated.

### 6. 529 Retry with User Feedback
The frontend's handling of AI overload (529 status) with automatic retry + visible feedback ("AI is busy, retrying in 5s...") turned a frustrating failure into a transparent waiting experience.

### 7. Glass-Morphism Design System
The `glass()` helper + consistent color constants + type-based coloring created a visually cohesive dark-theme UI with minimal CSS effort. The frosted glass cards feel premium.

### 8. Additive-Only Database Migrations
`ALTER TABLE ADD COLUMN IF NOT EXISTS` in the startup lifespan meant zero-downtime deployments. New columns and tables appeared automatically on restart.

---

## 14. Patterns That Broke (or Need Work)

### 1. No Frontend Router = No Deep Linking
Without react-router, there's no URL-based navigation. Users can't bookmark a specific view, share a link to a dashboard, or use browser back/forward. The entire app state is ephemeral to the browser tab.

**Fix for next platform**: Use a lightweight router (even just hash-based) from day one. Map `activeView` to URL paths.

### 2. Root Component State Bottleneck
All state in StairsApp.jsx means every state change re-renders the entire component tree. With 15+ views and dozens of state variables, this creates unnecessary re-renders.

**Fix for next platform**: Use React Context or Zustand for domain-separated state (auth, strategy, UI). Keep prop drilling for component-local concerns only.

### 3. Hardcoded API URL
`constants.js` hardcodes the production Railway URL. No environment-based API URL means local development hits production, and there's no staging environment concept.

**Fix for next platform**: Use Vite's `import.meta.env.VITE_API_URL` with `.env.local` for dev overrides.

### 4. CORS Configuration Hell
Four PRs to get CORS working. The final pattern (explicit origins + regex + global exception handler with CORS headers) is a safety net, not a clean solution.

**Fix for next platform**: Use a CORS middleware that handles all cases (including exceptions) out of the box. Define allowed origins via environment variable from the start.

### 5. No Database Migration Framework
Runtime `ALTER TABLE IF NOT EXISTS` works for additive changes but fails for renames, type changes, or data migrations. No way to track what's been applied.

**Fix for next platform**: Use Alembic (or at minimum, numbered SQL migration files) from day one.

### 6. exportUtils.js — 1.9MB Base64 Blob
A base64-encoded logo embedded directly in a JavaScript file. This bloats the frontend bundle and makes the file unreadable/uneditable.

**Fix for next platform**: Store logos as actual image files. Reference via URL in PDF exports. Never embed large base64 strings in source code.

### 7. ExecutionRoom.jsx — 1,724 Lines in One Component
The most complex component handles: main execution chat, action-specific chats, explain chats, assessment chats, implementation room chats, manifest persistence, cross-tab sync, task parsing, and 4 different modal workflows. It's a monolith inside a monolith.

**Fix for next platform**: Break into sub-components: ExecutionChat, AssessmentModal, ImplementationGuide, ManifestSync. Each with its own file and state.

### 8. In-Memory Rate Limiter
Resets on every server restart. Doesn't work with multiple server instances. A bad actor just needs to wait for a deployment.

**Fix for next platform**: Use Redis-backed rate limiting or Railway's built-in rate limiting.

### 9. No Reconnection for WebSocket
If the WebSocket connection drops (network change, server restart), the client silently stops receiving updates. No reconnection logic, no missed-message recovery.

**Fix for next platform**: Implement exponential backoff reconnection + last-event-id for catching up on missed events.

### 10. AI Response Parsing with Regex
Extracting tasks, steps, and structured data from AI responses uses regex pattern matching on markdown. This is inherently fragile — any change in AI output format breaks parsing.

**Fix for next platform**: Use structured output (JSON mode) for any response that needs to be parsed. Reserve markdown for display-only content.

---

## 15. Build Metrics & Timeline

### Code Metrics

| Category | Files | Lines |
|---|---|---|
| Backend Python | ~25 | ~7,821 |
| Frontend JS/JSX/CSS | ~25 | ~10,671 |
| Backend Tests | 3 | ~1,040 |
| Frontend Tests | 4 | ~1,359 |
| SQL Schema | 2 | ~1,113 |
| Config/Docker/Misc | ~15 | ~600 |
| exportUtils.js (base64 blob) | 1 | ~2,236 (1.9MB) |
| **Total** | **~86** | **~24,840** |

### Build Timeline (48 PRs, 5 Days)

| Day | PRs | Focus |
|---|---|---|
| Day 1 (Feb 25) | #1-#7 | Core platform: staircase, AI chat, questionnaire, execution room basics |
| Day 2 (Feb 26) | #8-#16 | Bug fixes (JWT, CORS, action plans), tutorial, notes, export |
| Day 3 (Feb 27) | #17-#26 | AI resilience (retry, multi-provider), strategy matrices, suggestion chips |
| Day 4 (Feb 28) | #27-#37 | Source of Truth, document upload/extraction, execution room expansion, manifest room |
| Day 5 (Mar 1) | #38-#48 | Bug fixes, branding, multi-agent refactor, auth system, data QA system |

### Bug Fix Commits (22 identified)

Key categories:
- **CORS** (4 fixes): The most persistent deployment issue
- **Auth** (2 fixes): JWT expiration blank screen, strategy isolation
- **Data persistence** (3 fixes): Action plans not saving, manifest room not displaying, duplicate strategies
- **AI parsing** (3 fixes): Matrix prefill, load button detection, structured table output
- **UI** (3 fixes): Import deduplication, brand rename, logo embedding
- **General** (7 fixes): Various API 500 errors, advisor source isolation, implementation room bugs

### Velocity Analysis

- **~4,970 lines/day** average (including tests and config)
- **~9.6 PRs/day** average
- Peak complexity on Day 5 (multi-agent refactor + auth system + 6-layer data QA = 3 major architectural changes in one day)
- Bug fix rate: ~46% of days had significant bug fix PRs (Days 2, 3, 5)
- The CORS saga (PRs #13-#16, spanning Days 2-3) was the single most time-consuming debugging effort

### What This Timeline Tells ArchTeeStrator

1. **Core CRUD + AI chat is a 1-day build** when using FastAPI + React with no ORM overhead
2. **Real deployment issues (CORS, auth, persistence) consume Day 2** — plan for it
3. **AI resilience features (retry, fallback, multi-provider) are essential by Day 3** — single-provider AI is a fragility
4. **Document processing + Source of Truth is a Day 4 feature** — it requires extraction libraries, approval workflows, and confidence scoring
5. **Multi-agent architecture is a late-stage refactor** — start monolithic, extract agents once you understand the domain boundaries
6. **Data quality/integrity is the last layer** — you need data flowing through the system before you can validate it

---

## Appendix A: File Index

```
backend/
  app/main.py                    628 lines — App entry, lifespan, CORS, rate limiting, migrations
  app/helpers.py                 173 lines — Auth, JWT, row conversion, health computation
  app/db/connection.py            ~50 lines — asyncpg pool, schema init
  app/models/schemas.py          531 lines — All Pydantic models
  app/ai_providers.py            383 lines — Multi-AI fallback system
  app/extraction.py               ~80 lines — Document text extraction
  app/storage.py                  ~60 lines — Supabase Storage helper
  app/agents/orchestrator.py     414 lines — Agent routing + validation loop
  app/agents/base_agent.py        ~80 lines — Base agent with AI call + logging
  app/agents/advisor_agent.py     ~90 lines — Strategy Advisor agent
  app/agents/strategy_agent.py   ~120 lines — Strategy Analyst agent
  app/agents/document_agent.py   ~100 lines — Document Analyst agent
  app/agents/execution_agent.py  ~150 lines — Execution Planner agent
  app/agents/validation_agent.py  ~80 lines — Validation agent
  app/routers/auth.py            ~130 lines — Auth endpoints
  app/routers/stairs.py          371 lines — Stair CRUD + progress + KPIs
  app/routers/strategies.py      205 lines — Strategy CRUD + tree
  app/routers/ai.py              800 lines — AI endpoints
  app/routers/dashboard.py       ~200 lines — Dashboard + alerts
  app/routers/sources.py         525 lines — Source of Truth
  app/routers/data_qa.py         863 lines — 6-layer data quality
  app/routers/knowledge.py        ~80 lines — Knowledge engine browser
  app/routers/websocket.py        ~80 lines — WebSocket manager
  app/routers/admin.py            ~50 lines — AI monitoring
  schema.sql                     572 lines — Core database schema
  run_migration.py               541 lines — Knowledge engine migration + seed data
  Dockerfile                      ~15 lines
  docker-compose.yml              ~25 lines
  railway.toml                    ~10 lines
  requirements.txt                12 deps

frontend/
  src/main.jsx                    10 lines — React entry
  src/StairsApp.jsx              333 lines — Root component
  src/constants.js                17 lines — Colors, types, helpers
  src/api.js                     312 lines — API classes + stores
  src/tutorialConfig.js          178 lines — Tutorial steps + state
  src/index.css                   ~30 lines — Tailwind imports
  src/components/
    LoginScreen.jsx               ~90 lines
    StrategyLanding.jsx           ~200 lines
    StrategyWizard.jsx            ~300 lines
    StaircaseView.jsx              63 lines
    StairEditor.jsx               ~250 lines
    DashboardView.jsx             151 lines
    AIChatView.jsx                139 lines
    StrategyToolsPanel.jsx         74 lines
    ActionPlansView.jsx           411 lines
    ExecutionRoom.jsx           1,724 lines ★
    ManifestRoom.jsx              596 lines
    SourceOfTruthView.jsx       1,108 lines
    KnowledgeLibrary.jsx         ~150 lines
    NotesView.jsx                ~250 lines
    AlertsView.jsx               ~120 lines
    SharedUI.jsx                  156 lines
    Markdown.jsx                  ~40 lines
    exportUtils.js              2,236 lines (mostly base64 blob)
  package.json
  vite.config.js
  index.html
```

---

## Appendix B: Database Schema Quick Reference

### Core Tables
- **organizations** — Multi-tenant root
- **users** — Auth + profile (org_id, role, full_name, email, password_hash)
- **strategies** — Strategy containers (name, company, industry, framework, status)
- **stairs** — Polymorphic hierarchy elements (the platform's core entity)
- **stair_relationships** — Cross-hierarchy links (depends_on, contributes_to, etc.)
- **stair_closure** — Ancestor-descendant closure table for tree traversal
- **stair_progress** — Time-series progress snapshots
- **kpi_measurements** — KPI actuals vs targets over time

### AI Tables
- **ai_conversations** — Conversation containers per strategy
- **ai_messages** — Individual messages with role + provider metadata
- **ai_alerts** — Strategy health alerts with severity levels
- **ai_feedback** — User feedback on AI outputs
- **ai_usage_logs** — Token usage tracking per provider

### Knowledge Engine Tables (11)
- **kb_frameworks** — 17 strategy frameworks (IFE, EFE, SPACE, BCG, Porter, SWOT, etc.)
- **kb_books** — 15 strategy books with author relationships
- **kb_failure_patterns** — 8 common strategy failure patterns
- **kb_ontology_terms** — Strategy terminology ontology
- **kb_review_cadences** — Recommended review frequencies
- **kb_leading_lagging_kpis** — Paired KPI examples
- **kb_mena_market_intel** — MENA region market intelligence

### Supporting Tables
- **strategy_sources** — Source of Truth documents + extractions
- **agent_logs** — Agent transparency audit trail
- **notes** — User notes (persisted server-side)
- **action_plans** — Execution plans with task arrays (JSONB)
- **activity_log** — User activity audit trail
- **teams / team_members** — Team structure

---

*End of Platform DNA Report. This document is the complete architectural blueprint of Stairs as built over 48 PRs in 5 days. It captures what exists, what works, what broke, and what should be done differently next time. Feed it to ArchTeeStrator v2 and build something better.*
