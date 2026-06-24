# Development — Agents & Deployment

How to develop the agentic chat layer locally and deploy to production.

## Stack split

| Component | Location | Host (prod) |
|-----------|----------|-------------|
| Web UI + auth + chat API | `apps/web` (Next.js) | **Vercel** |
| Bill parse + chat agents | `services/agent` (FastAPI) | **Railway** |
| Database | MongoDB | **MongoDB Atlas** |
| LLM (chat) | OpenAI | `OPENAI_API_KEY` (both services) |

```
Browser → Vercel (Next.js)
            ↓ AGENT_SERVICE_URL (/chat + bill parse workers)
          Railway (FastAPI)
            ↓
          MongoDB Atlas + OpenAI
```

**Chat orchestration** runs in **LangChain/LangGraph** (`services/agent`, `POST /chat`). Next.js proxies `POST /api/dashboard/chat` → `AGENT_SERVICE_URL/chat` when `USE_LANGCHAIN_AGENTS=true` (default). Falls back to inline OpenAI if the agent service is unreachable.

**Writes from chat** return `pending_action` or `suggestion_action` from Python; Next.js executes them via `agent-pending-actions.ts` and `create-suggestion.ts` (same pattern as manual Upload orders / Recipes).

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

## LangChain agents (shipped)

Layout in `services/agent/`:

```
services/agent/
├── main.py                 # FastAPI — /chat + bill parse endpoints
├── agents/
│   ├── supervisor.py       # LangGraph supervisor graph (Sous Chef)
│   ├── state.py            # Shared graph state
│   ├── specialists.py      # ReAct agent builders
│   ├── runner.py           # Routes supervisor vs direct specialist
│   ├── handoff.py          # Handoff regex (mirrors chat-handoff.ts)
│   └── prompts.py          # System prompts
├── chat/
│   └── service.py          # POST /chat request/response models
├── context/
│   └── builders.py         # MongoDB kitchen context snapshots
├── tools/core/
│   ├── factory.py          # 9 consolidated @tools
│   ├── reads.py            # query_* internal actions
│   ├── bills.py            # Bill queue reads + upload_bills
│   ├── writes.py           # CoreToolContext + PendingAction sink
│   └── models.py           # SuggestedDishDraft, etc.
└── db/mongo.py             # MongoDB for tool reads/writes
```

### Core tools (9)

| Agent | Tools |
|-------|-------|
| Sous Chef | `query_kitchen`, `orchestrate` |
| Inventory | `query_inventory`, `apply_inventory`, `upload_bills` |
| Business | `query_business`, `apply_business` |
| Creative | `query_menu`, `apply_menu` |

See [Tool_Index.md](./Tool_Index.md) for Built? status and internal actions.

### Supervisor graph flow (Sous Chef / `context: head`)

```
START → classify_intent (structured LLM)
          ├─ answer      → head_answer (ReAct) → END
          ├─ consult     → consult_specialist × N → synthesize → END
          └─ handoff     → handoff_specialist (ReAct) → END
```

Direct specialist mode (dashboard section tabs or Connect handoff) bypasses the supervisor and runs a single ReAct agent with that agent's core tools.

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

## Railway (agent service)

1. New Railway project → deploy from GitHub
2. Root directory: `services/agent`
3. Env: `OPENAI_API_KEY`, `MONGODB_URI`
4. Start: `uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}`

Raise HTTP timeout for `/parse-bill-pipeline` (bills can take ~180s).

---

## Vercel (web app)

1. Root directory: `apps/web`
2. Env: `MONGODB_URI`, `NEXTAUTH_*`, `OPENAI_API_KEY`, `AGENT_SERVICE_URL`, `USE_LANGCHAIN_AGENTS=true`

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
- [../Agents/README.md](../Agents/README.md) — chat agents and workers
- [../../README.md](../../README.md) — project quick start
