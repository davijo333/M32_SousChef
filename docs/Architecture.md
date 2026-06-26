# Architecture

Sous Chef splits the **web app** (Next.js) from the **agent service** (FastAPI). Both share MongoDB and call OpenAI where needed.

> **Detailed docs:** [System-Architecture.md](./System-Architecture.md) (diagrams) · [How-It-Works.md](./How-It-Works.md) (full narrative, especially **agent-service-v1**)

## High-level diagram

```
Browser
   │
   ▼
Next.js (apps/web)                    FastAPI (backend/agent-service-v1)
   │  Pages + API routes                  │  POST /chat (supervisor)
   │  NextAuth sessions                   │  Bill parse / image / link workers
   │  Deterministic chat gates            │  YAML workflow engine + specialists
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
| `backend/agent-service-v1/` | **Primary** Python FastAPI — workflow-first supervisor, specialist workers, tools |
| `agents/` | Agent **specs** (profiles, overview docs) |
| `tools/` | Tool **specs** — manifest, per-tool markdown, development notes |
| `test/` | Committed catalog JSON, bill fixtures, seed images |
| `infra/` | Docker Compose (MongoDB), dev start scripts |
| `storage/r2/` | Local mirror of catalog images and uploaded bills |

## Request paths

### Manual UI (always available)

Chefs use pages directly — Upload orders, Kitchen control, Recipes. API routes in `apps/web/src/app/api/*` call `backend/api/services/*` and MongoDB. No agent required.

### Chat (dual path)

1. **Deterministic gates** — `apps/web/src/app/api/dashboard/chat/route.ts` handles structured intents before LLM: sell-price updates, ingredient reorder level, recipe finalize confirm, catalog lookup, bill upload confirm, link-workflow confirms. Reads/writes go straight to MongoDB via `agent-pending-actions.ts` / `agent-inventory-actions.ts`.

2. **agent-service-v1** — When no gate matches, Next.js proxies to `AGENT_SERVICE_URL/chat`. The v1 supervisor runs YAML workflows, delegates to specialist workers, and returns `pending_action` for Next.js to execute on chef confirm.

```
POST /api/dashboard/chat
   ├─ intent matched? → DB lookup → preview → confirm → execute
   └─ else → POST /chat (agent-service-v1) → reply + optional pending_action
```

## Agent orchestration (agent-service-v1)

When `context: head`, `supervisor/graph.py` runs each turn:

```
TurnContext → triage (LLM) → workflow step resolve → specialist consult → synthesize → reply_policy
```

- **Workflows** — YAML in `backend/agent-service-v1/workflows/catalog/` loaded at runtime
- **State** — `conversation.workflowState` (`workflowId`, `stepId`, `lockedName`, `baggage`) in MongoDB
- **Workers** — `inventory`, `business`, `create` (ReAct or direct tool calls)
- **Writes** — staged as `pending_action`; Next.js executes on confirm

Direct specialist mode (dashboard section tabs or **Connect to … Agent**) can bypass the supervisor depending on context.

See [How-It-Works.md](./How-It-Works.md) for the full agent-service-v1 walkthrough.

## Data model (summary)

MongoDB collections: users, restaurants, ingredients, dishes, add-ons, bill uploads, conversations (including optional `workflowState` for multi-turn write flows), suggestions. See [DB/README.md](./DB/README.md).

Images use an R2-compatible key layout (`storage/r2/` locally; Cloudflare R2 in production via `R2_STORAGE_ROOT`).

## Deployment (production)

| Component | Target |
|-----------|--------|
| Agent service | **Railway** — `backend/agent-service-v1` |
| Web app | **Railway** (or Vercel) — `apps/web` |
| Database | **MongoDB Atlas** |
| Object storage | Cloudflare R2 (optional; local mirror for dev) |

Details: [Technologies.md](./Technologies.md).

## Related

- [System-Architecture.md](./System-Architecture.md) — detailed Mermaid diagrams
- [How-It-Works.md](./How-It-Works.md) — end-to-end guide
- [Agents.md](./Agents.md) — chat agents and workers
- [backend/agent-service-v1/ARCHITECTURE.md](../backend/agent-service-v1/ARCHITECTURE.md) — v1 module map
