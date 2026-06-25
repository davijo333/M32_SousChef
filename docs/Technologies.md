# Technologies

Stack used across Sous Chef and where each piece runs in production (**Railway** deployment).

## Summary

| Layer | Technology | Production |
|-------|------------|------------|
| Web app | Next.js 14, React 18, TypeScript | Railway |
| Styling | Tailwind CSS | — |
| API / auth | Next.js Route Handlers, NextAuth | Railway |
| Shared server code | Mongoose, Zod, OpenAI SDK (Node) | Railway |
| Agent service | FastAPI, Uvicorn, Python 3.12+ | **Railway** |
| Agent framework | LangChain, LangGraph, LangChain-OpenAI | Railway |
| LLM | OpenAI (`gpt-4o-mini` and tool calls) | API key on both services |
| Database | MongoDB 7 | MongoDB Atlas |
| Object storage | R2-compatible layout (local `storage/r2/`) | Cloudflare R2 (optional) |
| Bill parsing | PyMuPDF, OpenAI vision/text | Railway |
| Containers (local) | Docker Compose — MongoDB | — |
| Monorepo | npm workspaces (`apps/web`, `packages/types`) | — |

## Frontend & web (`apps/web`)

- **Next.js 14** — App Router, server and client components
- **React 18**
- **TypeScript 5**
- **Tailwind CSS 3**
- **NextAuth 4** — email/password (+ optional Google OAuth)
- **Lucide React** — icons
- **Mongoose 9** — MongoDB from API routes (shared with `backend/api`)

## Backend API (`backend/api`)

- **TypeScript** services imported by Next.js via `@backend/*` path alias
- **Mongoose** models — ingredients, dishes, add-ons, bills, conversations, users
- **OpenAI Node SDK** — fallback inline chat when agent service is unavailable
- Chat intent modules — price adjustment, reorder threshold, recipe build, catalog lookup

## Agent service (`backend/agent-service`)

- **FastAPI** + **Uvicorn** — HTTP API (`main.py`)
- **LangChain / LangGraph** — supervisor graph + specialist ReAct agents
- **LangChain-OpenAI** — chat models and structured routing
- **Pydantic 2** — request/response models
- **PyMongo** — tool reads/writes against MongoDB
- **PyMuPDF** — PDF bill extraction
- **PyYAML** — agent profiles, tasks, golden workflows
- **httpx** — outbound HTTP
- **ddgs** — optional web search for creative cues

See `backend/agent-service/requirements.txt` for pinned dependencies.

## Data & storage

- **MongoDB** — primary datastore (local Docker or Atlas)
- **Local / R2 mirror** — catalog images and bill files under `storage/r2/`; keys compatible with Cloudflare R2 (`R2_STORAGE_ROOT`)

## AI & observability

- **OpenAI API** — chat assistants, bill line extraction, image generation hooks
- **LangSmith** (optional) — `LANGCHAIN_TRACING_V2`, `LANGCHAIN_API_KEY`

## Local development

| Tool | Purpose |
|------|---------|
| Node.js + npm | Web app and root scripts |
| Python 3.12+ | Agent service |
| Docker Compose | MongoDB (`infra/docker-compose.yml`) |
| Bash scripts | `infra/scripts/` — start web, connect Mongo, seed retest |

Quick start: [../README.md](../README.md)

## Deployment — Railway

Production target is **Railway** for deployable services.

### Agent service (required)

1. Railway project → deploy from GitHub, branch `dev` (or `main`)
2. **Root directory:** `backend/agent-service`
3. **Start command:** `uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}`
4. **Environment variables:**

   | Variable | Required |
   |----------|----------|
   | `OPENAI_API_KEY` | Yes |
   | `MONGODB_URI` | Yes (Atlas connection string) |
   | `PORT` | Set by Railway |

5. Railway assigns `PORT` dynamically (often `8080`) — point the public domain at that port, not `3000`.

### Web app

1. Railway service → root directory `apps/web`
2. **Build:** `npm install && npm run build` (from repo root or configure monorepo install)
3. **Start:** `npm start`
4. **Environment variables:**

   | Variable | Required |
   |----------|----------|
   | `MONGODB_URI` | Yes |
   | `NEXTAUTH_SECRET` | Yes |
   | `NEXTAUTH_URL` | Yes (public Railway URL) |
   | `OPENAI_API_KEY` | Yes |
   | `AGENT_SERVICE_URL` | Yes (Railway agent service URL) |
   | `USE_LANGCHAIN_AGENTS` | `true` |
   | `R2_STORAGE_ROOT` | Optional (persistent volume or external R2) |

### MongoDB Atlas

- Create cluster; allow Railway egress IPs (or `0.0.0.0/0` for early dev)
- Use same database name as local (`sous_chef`) or update `MONGODB_URI`

### Optional — Cloudflare R2

- Map `R2_STORAGE_ROOT` or wire R2 API credentials when moving off local disk storage

## Test & fixtures

- **Python scripts** — `test/scripts/` (bill generation, pricing recalc)
- **Committed fixtures** — `test/inventory/`, `test/bills/`, `test/storage/r2/`

## Related

- [Architecture.md](./Architecture.md) — how services connect
- [../tools/Development.md](../tools/Development.md) — LangGraph layout and local dev details
