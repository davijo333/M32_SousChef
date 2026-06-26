# Development — Agents & Deployment

How to develop the agentic chat layer locally and deploy to production.

## Stack split

| Component | Location | Host (prod) |
|-----------|----------|-------------|
| Web UI + auth + chat API | `apps/web` (Next.js) | **Railway** |
| Bill parse + chat agents | `backend/agent-service-v1` (FastAPI) | **Railway** |
| Database | MongoDB | **MongoDB Atlas** |
| LLM (chat) | OpenAI | `OPENAI_API_KEY` (both services) |

Full stack and env vars: [../docs/Technologies.md](../docs/Technologies.md).

```
Browser → Railway (Next.js)
            ↓ AGENT_SERVICE_URL (/chat + bill parse workers)
          Railway (FastAPI)
            ↓
          MongoDB Atlas + OpenAI
```

**Chat orchestration** runs in **LangChain/LangGraph** (`backend/agent-service-v1`, `POST /chat`). Next.js proxies `POST /api/dashboard/chat` → `AGENT_SERVICE_URL/chat` when `USE_LANGCHAIN_AGENTS=true` (default). Falls back to inline OpenAI if the agent service is unreachable.

**Writes from chat** return `pending_action` or `suggestion_action` from Python; Next.js executes them via `agent-pending-actions.ts` and `create-suggestion.ts` (same pattern as manual Upload orders / Recipes).

## Local development

### Prerequisites

- Node.js, Python 3.12+, Docker (for local MongoDB)
- `.env` from `.env.example` (repo root; web app loads via `infra/scripts/start-web.sh`)

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
USE_LANGCHAIN_AGENTS=true
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
```

### Key chat files

```
apps/web/src/
├── app/api/dashboard/chat/route.ts   # Proxies to agent service; executes pending actions
├── components/
│   ├── SousChefChatDock.tsx
│   └── DashboardChefChat.tsx
└── lib/
    ├── agent-chat.ts                 # POST /chat client
    ├── agent-pending-actions.ts      # Bill process + reorder threshold writes
    ├── chat-handoff.ts
    ├── create-suggestion.ts          # apply_menu → Suggested dish
    └── dashboard-chat-context.ts
```

### Health check

```bash
curl http://localhost:8000/health
```

---

## Agent service (shipped)

Layout in `backend/agent-service-v1/`:

```
backend/agent-service-v1/
├── main.py                 # FastAPI — /chat + bill parse endpoints
├── api/routes/             # chat, bills, images, health
├── supervisor/             # Sous Chef — triage, graph, reply policy
├── workflows/
│   ├── catalog/            # YAML workflow definitions (source of truth)
│   └── engine/             # Loader, FSM executor, transitions
├── specialists/            # inventory, business, create ReAct workers
├── tools/core/             # 9 consolidated @tools + DB reads/writes
├── workers/                # Bill parse, images, recipe linker
└── db/mongo.py             # MongoDB for tool reads/writes
```

### Supervisor turn flow (Sous Chef / `context: head`)

```
POST /chat → TurnContext → triage (LLM) → workflow step resolve
  → specialist consult (ReAct or direct tools) → synthesize → reply_policy
```

Direct specialist mode (dashboard section tabs or Connect handoff) can bypass the supervisor depending on context.

### Write confirmation flow

1. Agent calls `apply_inventory`, `apply_business`, or `apply_menu` with preview text.
2. Chef confirms ("yes", "process them", …) → request includes `confirm_inventory` / `confirm_business` / `confirm_suggestion`.
3. Python returns `pending_action` or `suggestion_action`.
4. Next.js executes via existing ingest / catalog helpers.

Optional tracing:

```env
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_...
LANGCHAIN_PROJECT=sous-chef-dev
```

---

## LangGraph checkpointing (later)

Persist graph state across turns and sessions (MongoDB or Redis checkpointer). Not implemented yet.

---

## Railway deployment

See [../docs/Technologies.md](../docs/Technologies.md) for Railway setup (agent service + web app, MongoDB Atlas, env vars).

Raise HTTP timeout for `/parse-bill-pipeline` on the agent service (bills can take ~180s).

---

## Implementation status

| Item | Status |
|------|--------|
| Sous Chef dock + 5 sessions | Shipped |
| Connect handoff + section sync | Shipped |
| 9 consolidated core tools | Shipped (9 Yes) |
| Write confirm + pending_action | Shipped |
| LangGraph supervisor graph | Shipped |
| Upload orders (10-file queue) | Shipped |
| Chat attachment batch upload | Shipped |
| Pass bill IDs from chat attachments | N/A (queue-based, no chef-facing IDs) |
| Consultation transcript blocks | Planned |
| LangGraph checkpointing | Planned |

---

## Related

- [README.md](./README.md) — Agentic Tools overview
- [Tool_Index.md](./Tool_Index.md) — core tools and Built? column
- [../docs/Architecture.md](../docs/Architecture.md) — system design
- [../docs/Agents.md](../docs/Agents.md) — chat agents overview
- [../docs/Technologies.md](../docs/Technologies.md) — stack and Railway deployment
- [../agents/README.md](../agents/README.md) — per-agent specs
- [../README.md](../README.md) — project quick start
