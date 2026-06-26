# Architecture

## Request flow

```
POST /chat
  → api/routes/chat.py          validate ChatRequest
  → domain/context.py           build TurnContext (history, workflow_state, drafts)
  → supervisor/graph.py         triage (LLM) → route → consult → synthesize (LLM)
       ├─ supervisor/triage.py    LLM picks workflow when none active; regex fallback
       ├─ workflows/engine/       resolve workflow + step from YAML catalog (FSM)
       ├─ specialists/registry    run delegated specialist for this step
       └─ supervisor/head_llm     persona reply from worker output or step action
  → supervisor/reply_policy.py  confirm gates, strip extra questions
  → api/schemas/chat.py         ChatResponse + updated workflow_state
```

## Layer responsibilities

| Layer | Owns | Must NOT |
|-------|------|----------|
| `api/` | HTTP, auth hooks, serialization | Business logic, LLM calls |
| `workflows/` | Step definitions, gates, consult targets | LLM prompts |
| `supervisor/` | LLM triage + synthesis, reply policy, **Sous Chef persona** | Direct DB writes |
| `specialists/` | Worker contracts, ReAct runners | Persona, user-facing tone |
| `tools/` | DB/API tool handlers | Chat reply wording |
| `prompts/` | Assemble system prompts from YAML/MD | Workflow transitions |

## Workflow engine

Each workflow YAML defines:

- `id`, `trigger` patterns (optional — regex/keywords for router)
- `steps[]` with `id`, `actor` (head \| specialist), `delegate`, `gate`, `tool`
- `on_confirm` / `on_reject` transitions

`workflow_state` persisted per conversation: `{ workflowId, stepId, lockedName, gatesPassed, baggage }`.

`workflows/engine/executor.py` drives each turn:

1. **resolve_step_for_turn** — start from triggers/intent or continue active state; apply gate confirm/reject; auto-route through `next` / `branch` steps until a delegate or gate step is reached.
2. **advance_after_turn** — after specialist consult, follow `on_complete`, `on_success`, `on_clear`, `on_duplicate`, and branch keys; clear state on `clears_workflow_state` or completed read queries.

## Specialist consult

A step with `delegate: inventory` builds a **task prompt** from the workflow step template + locked context, then runs a **ReAct worker** with real tools from `tools/core/` (ported from v0).

| Specialist | Tools |
|------------|-------|
| `inventory` | `query_kitchen`, `query_inventory`, `apply_inventory`, `upload_bills`, `query_menu`, `apply_menu` |
| `business` | `query_business`, `query_inventory` |
| `create` | `query_menu`, `query_inventory` (read-only) |

Writes return `pending_action` / `recipe_build` on `ChatResponse` for Next.js to execute.

Temperature: `0` for workers. Persona applies to **Sous Chef only**.

## Evals

```yaml
# evals/fixtures/add_dish_confirm_recipe.yaml
workflow: add_dish_from_chat
from_step: confirm_recipe
turns:
  - role: user
    content: "Yes, go ahead"
assert:
  consult_order: [inventory]
  workflow_step: confirm_finalize
  single_question: true
```
