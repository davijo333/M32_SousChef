# Agent Service v1

Rebuilt Sous Chef agent stack — **workflow-first**, testable, and predictable.

## Principles

1. **Workflows drive behavior** — YAML in `workflows/catalog/` is loaded at runtime, not documentation-only.
2. **Supervisor is deterministic** — routing, gates, and reply shape live in `supervisor/` + `workflows/engine/`.
3. **Specialists are tools + LLM** — Inventory / Business / Creative run ReAct only when a workflow step delegates.
4. **One question per reply** — enforced in `supervisor/reply_policy.py` only (no duplicate sanitizers).
5. **Evals gate changes** — every workflow has a fixture under `evals/fixtures/`.

## Layout

```
agent-service-v1/
├── main.py                 # FastAPI app entry
├── config/                 # Settings (env)
├── api/                    # HTTP — routes + request/response schemas
├── domain/                 # Shared types (session, turn context, messages)
├── workflows/              # SOURCE OF TRUTH — catalog YAML + engine
├── supervisor/             # LangGraph orchestrator (head / Sous Chef)
├── specialists/            # Per-agent specs + ReAct runners
├── tools/                  # Tool implementations (DB reads/writes)
├── prompts/                # System prompt builder from specs
├── integrations/         # MongoDB, OpenAI clients
├── evals/                  # Golden conversation tests
└── tests/                  # Unit + integration tests
```

## Quick start

```bash
# From repo root
npm run dev:agent          # :8000 — agent-service-v1 (drop-in for legacy)
npm run dev:web            # :3000 — Next.js (AGENT_SERVICE_URL=http://localhost:8000)

# Or directly:
cd backend/agent-service-v1
bash run.sh                # copies ../../.env on first run if missing
```

**Chat** uses this service (`POST /chat`). Bill parse, catalog identify, and image workers will be ported here before `agent-service` is removed.

See [ARCHITECTURE.md](./ARCHITECTURE.md).
