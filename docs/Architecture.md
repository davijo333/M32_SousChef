# Architecture

Sous Chef splits the **web app** (Next.js) from the **agent service** (FastAPI + LangGraph). Both share MongoDB and call OpenAI where needed.

## High-level diagram

```
Browser
   │
   ▼
Next.js (apps/web)                    FastAPI (backend/agent-service)
   │  Pages + API routes                  │  POST /chat (LangGraph)
   │  NextAuth sessions                   │  Bill parse / image / link workers
   │  Deterministic chat gates            │  9 consolidated @tools
   │  pending_action execution            │
   └──────────────┬───────────────────────┘
                  ▼
            MongoDB (+ local/R2 image mirror)
                  ▼
            OpenAI (chat + bill parsing)
```

## Repository layout

| Path | Role |
|------|------|
| `apps/web/` | Next.js 14 UI, thin API route handlers |
| `backend/api/` | Shared server logic — Mongoose models, domain services, chat intent parsers |
| `backend/agent-service/` | Python FastAPI — LangGraph supervisor, specialist ReAct agents, bill workers |
| `agents/` | Agent **specs** (profiles, golden workflows, eval notes) |
| `tools/` | Tool **specs** — manifest, per-tool markdown, development notes |
| `test/` | Committed catalog JSON, bill fixtures, seed images |
| `infra/` | Docker Compose (MongoDB), dev start scripts |
| `storage/r2/` | Local mirror of catalog images and uploaded bills |

## Request paths

### Manual UI (always available)

Chefs use pages directly — Upload orders, Kitchen control, Recipes. API routes in `apps/web/src/app/api/*` call `backend/api/services/*` and MongoDB. No agent required.

### Chat (dual path)

1. **Deterministic gates** — `apps/web/src/app/api/dashboard/chat/route.ts` handles structured intents before LLM: sell-price updates, ingredient reorder level, recipe finalize confirm, catalog lookup, bill upload confirm. Reads/writes go straight to MongoDB via `agent-pending-actions.ts` / `agent-inventory-actions.ts`.

2. **LangChain agents** — When no gate matches, Next.js proxies to `AGENT_SERVICE_URL/chat`. The Python service runs the Sous Chef supervisor graph or a specialist ReAct agent. Writes return `pending_action`; Next.js executes them on chef confirm (same helpers as manual UI).

```
POST /api/dashboard/chat
   ├─ intent matched? → DB lookup → preview → confirm → execute
   └─ else → POST /chat (FastAPI) → reply + optional pending_action
```

### Bill upload pipeline

```
Upload orders UI or chat attachment
   → POST /api/bills/parse → agent-service /parse-bill-pipeline
   → chef reviews → POST /api/bills/confirm → stock / sales applied in Next.js
```

Process **purchase orders before sales orders** so dish recipes link to pantry stock.

## Agent orchestration (Sous Chef)

When `context: head`, the supervisor graph in `backend/agent-service/agents/head/graph.py`:

```
START → classify_intent
          ├─ answer   → head ReAct → END
          ├─ consult  → specialist(s) → synthesize → END
          └─ handoff  → specialist ReAct → END
```

Workflow routing (before LLM classifier) lives in `orchestration.py` and `workflow_engine.py` — persisted `workflowState` on each conversation drives add-dish / add-ingredient / add-addon steps; other intents fall back to regex (e.g. reorder → **Inventory**, pricing → **Business**, new dishes → **Creative**).

Direct specialist mode (dashboard section tabs or **Connect to … Agent**) bypasses the supervisor and runs one ReAct agent with that agent's tools.

## Data model (summary)

MongoDB collections: users, restaurants, ingredients, dishes, add-ons, bill uploads, conversations (including optional `workflowState` for multi-turn write flows), suggestions. See [DB/README.md](./DB/README.md).

Images use an R2-compatible key layout (`storage/r2/` locally; Cloudflare R2 in production via `R2_STORAGE_ROOT`).

## Deployment (production)

| Component | Target |
|-----------|--------|
| Agent service | **Railway** — `backend/agent-service` |
| Web app | **Railway** (or Vercel) — `apps/web` |
| Database | **MongoDB Atlas** |
| Object storage | Cloudflare R2 (optional; local mirror for dev) |

Details: [Technologies.md](./Technologies.md).

## Related

- [Agents.md](./Agents.md) — chat agents and workers
- [../tools/Development.md](../tools/Development.md) — local dev and LangGraph file map
- [../agents/README.md](../agents/README.md) — per-agent specs
