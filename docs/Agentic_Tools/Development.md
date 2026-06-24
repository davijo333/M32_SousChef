# Development — Agents & Deployment

How to develop the agentic chat layer locally and deploy to production.

## Stack split

| Component | Location | Host (prod) |
|-----------|----------|-------------|
| Web UI + auth + chat API | `apps/web` (Next.js) | **Vercel** |
| Bill parse + image workers | `services/agent` (FastAPI) | **Railway** |
| Database | MongoDB | **MongoDB Atlas** |
| LLM (chat) | OpenAI | `OPENAI_API_KEY` in Next.js |

```
Browser → Vercel (Next.js)
            ↓ AGENT_SERVICE_URL (bills only today)
          Railway (FastAPI)
            ↓
          MongoDB Atlas + OpenAI
```

**Chat orchestration** runs in Next.js (`POST /api/dashboard/chat`). Python agents handle bill parsing and image suggestion — not the dashboard chat loop yet.

## Local development

### Prerequisites

- Node.js, Python 3.12+, Docker (for local MongoDB)
- `.env` from `.env.example` (repo root; web app loads via `scripts/start-web.sh`)

### Start services

```bash
# Terminal 1 — MongoDB
npm run connect:mongodb

# Terminal 2 — Python agent (:8000)
npm run start:agents

# Terminal 3 — Next.js (:3000)
npm run start:schef
```

### Environment (local)

```env
MONGODB_URI=mongodb://localhost:27017/sous_chef
OPENAI_API_KEY=sk-...
AGENT_SERVICE_URL=http://localhost:8000
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
```

### Key chat files

```
apps/web/src/
├── app/api/dashboard/chat/route.ts   # Chat API, handoff, connectAgent
├── components/
│   ├── SousChefChatDock.tsx
│   └── DashboardChefChat.tsx
└── lib/
    ├── chat-handoff.ts
    ├── dashboard-chat.ts
    └── dashboard-chat-context.ts
```

### Health check

```bash
curl http://localhost:8000/health
```

---

## LangGraph (planned)

Target layout in `services/agent/`:

```
services/agent/
├── main.py
├── graph/
│   ├── head_chef.py
│   ├── inventory.py
│   ├── business.py
│   └── creative.py
└── tools/
```

Next.js would proxy `POST /api/dashboard/chat` → `AGENT_SERVICE_URL/chat` when migrated.

Optional tracing:

```env
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_...
LANGCHAIN_PROJECT=sous-chef-dev
```

---

## Railway (agent service)

1. New Railway project → deploy from GitHub
2. Root directory: `services/agent`
3. Env: `OPENAI_API_KEY`, `MONGODB_URI` (if Python hits DB)
4. Start: `uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}`

Raise HTTP timeout for `/parse-bill-pipeline` (bills can take ~180s).

---

## Vercel (web app)

1. Root directory: `apps/web`
2. Env: `MONGODB_URI`, `NEXTAUTH_*`, `OPENAI_API_KEY`, `AGENT_SERVICE_URL`

---

## Implementation status

| Item | Status |
|------|--------|
| Sous Chef dock + 5 sessions | Shipped |
| Connect handoff + section sync | Shipped |
| Specialist prompts + context | Shipped |
| Upload orders (10-file queue) | Shipped |
| Chat upload handoff | Planned |
| Consultation transcript blocks | Planned |
| LangGraph in Python | Planned |

---

## Related

- [README.md](./README.md) — architecture
- [../Agents/README.md](../Agents/README.md) — Python workers
- [../../README.md](../../README.md) — project quick start
