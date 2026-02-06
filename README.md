# 🪜 ST.AIRS — Strategy AI Interactive Real-time System

> **"Human IS the Loop"** — AI suggests, Human decides.

A strategic planning platform that visualizes organizational strategy as a **staircase** — each step represents a strategic element climbing from Vision to Victory.

Built by **Tee** | **DEVONEERS** | Part of the **RootRise** ecosystem

---

## 🏗️ Architecture

```
stairs/
├── backend/          # FastAPI + PostgreSQL (→ Railway)
│   ├── app/          # Application code
│   │   ├── main.py   # 30+ REST endpoints, WebSocket, AI engine
│   │   ├── db/       # Database connection & pooling
│   │   └── models/   # Pydantic schemas
│   ├── schema.sql    # Database schema + seed data
│   ├── Dockerfile    # Container config
│   └── railway.toml  # Railway deployment config
├── frontend/         # React UI (→ Vercel)
│   └── stairs_v2.jsx # Full frontend component
└── .env.example      # Environment variables template
```

## ✨ Features

- **Hierarchical Strategy Tree** — Vision → Pillar → Objective → Key Result → Initiative → Task
- **AI-Powered Risk Analysis** — Pattern detection for hockey stick projections, resource starvation, communication gaps
- **Real-time Collaboration** — WebSocket-driven live updates
- **Multi-tenant Isolation** — Organization-based data separation
- **Bilingual** — English / Arabic with RTL support
- **Framework Library** — OKR, Balanced Scorecard, Hoshin Kanri, EFQM
- **Staircase Visualization** — The signature "climb your strategy" view

## 🚀 Deploy

### Backend → Railway

1. Push this repo to GitHub
2. Create new project on [Railway](https://railway.app)
3. Add **PostgreSQL** service (Railway provisions it)
4. Add **New Service → GitHub Repo** → select this repo
5. Set **Root Directory** to `backend`
6. Add environment variables:
   - `JWT_SECRET` → generate a secure random string
   - `DATABASE_URL` → Railway auto-injects from PostgreSQL addon
7. Deploy — schema auto-initializes on first boot

### Frontend → Vercel (coming soon)

Frontend is currently a single React JSX component. Vite project scaffold coming in next sprint.

### Local Development

```bash
# Backend
cd backend
cp ../.env.example .env  # edit with your values
docker-compose up -d     # starts PostgreSQL + API
# API → http://localhost:8000
# Docs → http://localhost:8000/docs
```

## 🔐 Seed User

```
Email:    tee@devoneers.com
Password: stairs2026
```

## 📡 API Endpoints

| Group | Endpoints |
|-------|-----------|
| Auth | `/auth/register`, `/auth/login`, `/auth/me`, `/auth/refresh` |
| Stairs | CRUD + `/stairs/tree`, `/stairs/{id}/children`, `/stairs/{id}/progress` |
| Dashboard | `/dashboard` (aggregated stats) |
| AI | `/ai/analyze/{id}`, `/ai/strategy`, `/ai/chat` |
| Alerts | `/alerts`, `/alerts/{id}/dismiss` |
| Frameworks | `/frameworks` |
| Teams | `/teams`, `/teams/{id}/members` |
| KPIs | `/kpis`, `/kpis/summary` |
| Export | `/export/csv`, `/export/json` |
| Health | `/health` |
| WebSocket | `/ws/{org_id}/{user_id}?token=JWT` |

## 📋 Roadmap

- [x] Backend v2.0 — 30+ endpoints, JWT, WebSocket, multi-tenant
- [x] Frontend v2.0 — Dashboard, Staircase, Tree, AI Chat, Alerts
- [ ] Railway deployment
- [ ] Real Claude AI integration (replace mock engine)
- [ ] Vite frontend build
- [ ] PDF/PPTX strategy reports
- [ ] Gantt chart & dependency graph
- [ ] Role-based permissions
- [ ] Mobile app (React Native)

---

**ST.AIRS v2.0** • Made with 🧗 by Tee • DEVONEERS • *"Climb Your Strategy"*
