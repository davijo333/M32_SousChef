# How It Works

A detailed guide to how Sous Chef fits together — from the chef's browser through Next.js, MongoDB, and **agent-service-v1**. For diagrams see [System-Architecture.md](./System-Architecture.md).

---

## What Sous Chef does

Sous Chef helps restaurant operators manage:

- **Pantry** — ingredients, stock levels, expiry, reorder thresholds
- **Menu** — dishes, add-ons, sell prices, recipe links
- **Bills** — purchase orders (supplier) and sales orders (customer) from uploaded PDFs/images
- **Chat** — a conversational **Sous Chef** that routes to specialist workers (Inventory, Business, Creative) behind the scenes

Manual pages (Kitchen control, Upload orders, Recipes) always work without chat. Agents augment the dashboard; they do not replace direct UI.

---

## Monorepo structure

```
M32_SousChef/
├── apps/web/                    # Next.js 14 — UI + API routes
├── backend/api/                 # Shared TypeScript — models, services, chat helpers
├── backend/agent-service-v1/    # Primary Python agent stack (FastAPI)
├── docs/                        # You are here
├── test/                        # Fixtures, seed data, bill generators
└── infra/                       # Docker Compose, dev scripts
```

**Key idea:** `apps/web` is thin. Heavy business logic lives in `backend/api/services/*`. Conversational orchestration lives in `backend/agent-service-v1`. Both share MongoDB.

---

## The web application layer

### Pages and navigation

| Page | Path | Role |
|------|------|------|
| Dashboard | `/dashboard` | Overview stats, floating Sous Chef chat dock |
| Kitchen control | `/kitchen-control` | Dishes and add-ons CRUD |
| Recipes | `/recipes` | Recipe editing, suggested dishes |
| Upload orders | `/upload-orders` | Bill upload and confirm |
| Inventory sections | Dashboard tabs | Inventory / Business / Create specialist contexts |

The chat dock (`AgentChatDock`, `DashboardChefChat`) posts to `POST /api/dashboard/chat`. It passes session context (`head` for Sous Chef, or `inventory` / `business` / `create` when connected to a specialist tab).

### API routes

Next.js route handlers under `apps/web/src/app/api/*` import from `@backend/services/*` (aliased to `backend/api/services`). Examples:

- `/api/dashboard/chat` — main chat orchestration (largest route)
- `/api/bills/parse`, `/api/bills/confirm` — bill pipeline
- `/api/catalog/*` — dish/ingredient/add-on CRUD
- `/api/seed` — load test restaurant data

### Shared server logic (`backend/api/`)

| Area | Location | Purpose |
|------|----------|---------|
| Models | `backend/api/models/` | Mongoose schemas: `Conversation`, `Dish`, `Ingredient`, `BillUpload`, … |
| Chat intents | `backend/api/services/chat/` | Deterministic parsers: price confirm, upload intent, workflow state, catalog lookup |
| Agent client | `backend/api/services/agents/agent-chat.ts` | HTTP client to `AGENT_SERVICE_URL/chat` |
| Write execution | `backend/api/services/agents/agent-pending-actions.ts` | Runs `pending_action` payloads after chef confirm |
| Dashboard context | `backend/api/services/agents/dashboard-chat-context.ts` | System prompts and cues for each agent context |

### Conversation persistence

Each chat session is a `Conversation` document:

- `messages[]` — user/assistant history
- `workflowState` — active YAML workflow position (see below)
- `agentContext` — current specialist handoff target
- Optional drafts: catalog image draft, recipe build plan

`workflowState` is the bridge between turns. It is written by both Next.js (when gates clear it) and agent-service-v1 (after each agent turn).

---

## Chat: the dual path

When a chef sends a message, `apps/web/src/app/api/dashboard/chat/route.ts` runs a **decision tree** before calling Python.

### Path 1 — Deterministic gates (TypeScript only)

These intents are parsed with regex and thread context — no LLM:

| Intent | Example | What happens |
|--------|---------|--------------|
| Sell price update | "Set pancakes to $14" → "Yes" | Preview in thread, confirm, write `Dish.sellPrice` |
| Reorder level | "Reorder tomatoes at 5 kg" | Search pantry, preview, confirm, update ingredient |
| Recipe finalize | "Save to kitchen" after recipe build | `finalizeRecipeBuild()` creates dish + links |
| Catalog lookup | "Do we have mango smoothie?" | Direct DB search, formatted reply |
| Upload confirm | "Yes" with pending bill batch | `executeConfirmedUploadBatch()` |
| Link confirm | "Yes" during `link_*_chat` workflow | Executes link via pending action |
| Kitchen build confirm | Legacy recipe-build thread detection | Bypasses agent when thread already has a build plan |

Gates exist because LLMs are unreliable on structured confirms and numeric writes. The agent proposes; Next.js (or the gate) executes.

### Path 2 — Agent service (Python)

When no gate matches and `USE_LANGCHAIN_AGENTS !== "false"`, Next.js calls:

```ts
callLangChainAgentChat({ ... })  // → POST AGENT_SERVICE_URL/chat
```

The request includes:

- `message`, `history`, `restaurant_id`, `chef_name`
- `workflow_state` — resumed from MongoDB
- `confirm_inventory` / `confirm_business` — set when chef said "yes" on a prior turn
- `catalog_draft` — attached image metadata
- `upload_batch` — pending bill slices
- `recipe_build` — in-progress kitchen build plan

The response may include:

| Field | Meaning |
|-------|---------|
| `reply` | Sous Chef text (already sanitized in Python) |
| `workflow_state` | Updated FSM position for next turn |
| `pending_action` | Structured write for Next.js to run on confirm |
| `recipe_build` | Kitchen build plan (ingredients, instructions, price) |
| `navigation_action` | Optional UI navigation hint |
| `activity` | Debug: workflow_id, step_id, consulted workers |

Next.js may execute `pending_action` immediately when the chef's message is already a confirm, merge the result into the reply, and clear `workflowState`.

### Specialist handoff

From Sous Chef chat, **Connect to Inventory Agent** (etc.) sets `connectAgent` and switches dashboard section. In specialist mode, the same `/chat` endpoint can run a single ReAct agent directly (bypassing supervisor routing) depending on context — but the v1 default path for `head` is always the supervisor.

---

## agent-service-v1 — deep dive

`backend/agent-service-v1` is the **workflow-first** agent stack. The design goals:

1. **YAML workflows drive behavior** — not buried Python routing logic
2. **Supervisor is mostly deterministic** — LLM for triage and voice, not for step transitions
3. **Specialists are workers** — ReAct only when a step delegates
4. **One question per reply** — enforced in one place (`reply_policy.py`)
5. **Tests gate changes** — unit tests per workflow; eval fixtures under `evals/`

### Entry point and HTTP surface

`main.py` mounts FastAPI routers:

| Endpoint | Module | Purpose |
|----------|--------|---------|
| `GET /` | `main.py` | Health metadata |
| `GET /health` | `api/routes/health.py` | Liveness |
| `POST /chat` | `api/routes/chat.py` | **Main chat turn** |
| `POST /v1/chat` | same router | Versioned alias |
| `POST /parse-bill-pipeline` | `api/routes/bills.py` | Bill OCR/classification |
| `POST /suggest-images` | `api/routes/images.py` | Dish image suggestions |

`api/routes/chat.py` is intentionally thin — it validates `ChatRequest` and calls `run_supervisor_turn()`.

### Configuration

`config/settings.py` loads from environment (via `.env` at repo root when using `run.sh`):

- `OPENAI_API_KEY` — required for triage and synthesis; regex fallback when missing
- `MONGODB_URI` — tool reads/writes
- Model names and temperature defaults

### Domain layer

`domain/context.py` defines `TurnContext` — the in-memory object for one turn:

```python
@dataclass
class TurnContext:
    restaurant_id: str
    user_message: str
    history: list[TurnMessage]
    workflow_state: WorkflowState | None
    catalog_draft: dict | None
    upload_batch: dict | None
    confirm_inventory: bool
    consult_results: dict[str, str]      # worker_id → raw consult text
    consult_side_effects: dict[str, dict] # pending_action, recipe_build, …
    triage_decision: TriageDecision | None
```

`TurnContext.from_request()` parses the HTTP body, including `workflow_state` into a `WorkflowState` dataclass (`workflows/engine/state.py`).

### Supervisor turn (`supervisor/graph.py`)

`run_supervisor_turn(req)` is the heart of v1. Pseudocode:

```
1. ctx = TurnContext.from_request(req)
2. Prime dish-pick baggage from prior assistant message (numbered ideas)
3. If chef replied "1"/"2"/"3" on pick_dish → force advance to confirm_dish_identity
4. else route = resolve_route(ctx)          # triage + workflow step resolution
5. If step delegates → run_specialist_consult for each target
6. advance_after_turn() → update workflow_state
7. If direct_delegate workflow → chain consults (lookup → persist) in same turn
8. reply = synthesize_reply(ctx)            # Sous Chef voice
9. reply = sanitize_reply(ctx)              # confirm gates, one question
10. Collect pending_action / recipe_build from consult side effects
11. Return dict → ChatResponse
```

There is no LangGraph `StateGraph` yet — v1 uses a linear Python function for predictability. `build_supervisor_graph()` raises `NotImplementedError`.

### Triage (`supervisor/triage.py`)

When **no workflow is active**, triage picks which workflow to start.

1. **LLM triage** (if `OPENAI_API_KEY` set): structured output with `action`, `workflow_id`, `locked_name`, `confidence`
2. **Regex fallback**: `workflows/engine/intent.py` → `match_workflow_start()`

Triage is **skipped** when `workflow_state` already exists — the active workflow owns the turn.

Examples from triage prompt rules:

- "Add a mango smoothie" → `add_dish_from_chat`
- "Link glazed bananas to pancakes" → `link_addons_to_dish_chat`
- "Do we have smoothies on the menu?" → `inventory_menu_lookup`
- "What add-ons do we have?" → `inventory_menu_lookup` (add-on list mode)

Confidence threshold: `>= 0.55` to start a workflow.

### Router (`supervisor/router.py`)

`resolve_route(ctx)`:

1. Calls `apply_triage(ctx)`
2. Calls `resolve_step_for_turn(ctx)` from the workflow engine
3. Returns `RouteDecision(workflow_id, step_id, consult_targets, mode)`

### Workflow engine

The engine is a **finite state machine** backed by YAML.

#### Loading (`workflows/engine/loader.py`)

At startup (lazy, `@lru_cache`), every `workflows/catalog/*.yaml` file is merged:

```python
load_catalog() → { "shared": {...}, "workflows": { id → workflow_def } }
```

#### State (`workflows/engine/state.py`)

```python
WorkflowState(
    workflow_id: str,    # e.g. "add_dish_from_chat"
    step_id: str,        # e.g. "confirm_recipe"
    locked_name: str,    # e.g. "Mango Smoothie"
    gates_passed: list,  # confirm gates cleared this session
    baggage: dict,       # step-specific data (drafts, slugs, idea names)
)
```

Serialized to MongoDB as camelCase (`workflowId`, `stepId`, `lockedName`, `baggage`).

#### Step resolution (`workflows/engine/executor.py`)

**`resolve_step_for_turn(ctx)`**:

- If `workflow_state` exists → continue active workflow (handle gates, branches)
- Else → match triggers via triage + regex (`_resolve_start`)
- Auto-skip routing steps (`next`, `branch`) until a delegate or gate step is reached

**`advance_after_turn(ctx)`**:

- After a delegate consult completes, follow `on_success`, `on_complete`, `on_clear`, branch keys
- Record gate passage when chef confirms (`detect_save_confirm`)
- Return `None` to clear workflow when done

#### Transitions (`workflows/engine/transitions.py`)

Helper logic for:

- `apply_dish_pick` — map "1"/"2"/"3" or name to `locked_name`
- `consult_persist_success` / `consult_indicates_duplicate` — parse worker text for branching
- `enter_sub_workflow` / `resume_parent_workflow` — e.g. missing ingredient sub-flow
- `delegate_worker` — first worker in `step.delegate`

#### Intent matching (`workflows/engine/intent.py`)

Regex and keyword triggers from workflow YAML `trigger` lists, plus helpers:

- `detect_save_confirm` — yes / confirm / go ahead
- `detect_workflow_cancel` — cancel / never mind
- `extract_named_entity` — dish/ingredient name from message
- `normalize_catalog_search_query` — strip filler words for menu search

### Example workflow: `add_dish_from_chat`

Defined in `workflows/catalog/addition-dish.yaml`. High-level path:

```
intake → route_intake
  ├─ name_only → duplicate_check
  ├─ image_only → image_context → confirm_name
  ├─ ideas_request → suggest_dish_ideas → pick_dish → …
  └─ neither → gather_preferences → suggest_dish_ideas → …

duplicate_check → (branch: duplicate | clear)
confirm_recipe → confirm_finalize → persist_build
```

Workers:

- **create** — dish idea cards, full recipe draft, visual brief
- **inventory** — duplicate check, ingredient availability, plan/finalize, add-on persist

Confirm gates (`gate: save_confirm`, etc.) block until the chef says Yes/No/Update. `reply_policy.py` appends standardized confirm copy.

### Example workflow: direct link from chat

`workflows/catalog/update-link-chat.yaml` defines `direct_delegate: true` workflows:

- `link_addons_to_dish_chat`
- `link_dish_ingredients_chat`
- `link_addon_ingredients_chat`

These skip ReAct loops. `specialists/direct_link.py`:

1. Parses chef message for entity names (dish, add-on, ingredient)
2. Calls inventory tools directly (`link_addon_to_dish`, etc.)
3. Returns formatted preview text

`supervisor/graph.py` chains multiple delegate steps in one turn (`_chain_direct_delegate_consults`) so lookup + persist can complete without an extra chef message.

### Example workflow: menu catalog read

`inventory_menu_lookup` in `query-inventory.yaml` has `mode: read`.

`specialists/direct_read.py` invokes `read_menu` / `format_catalog_search` directly — no LLM tool loop. `head_llm.py` returns the worker text as the final reply for read-mode `answer` steps.

### Specialists and ReAct

When direct paths do not apply, `specialists/registry.py` builds a **task prompt** from the workflow step's `task_template` and runs a ReAct agent via `specialists/react_runner.py`:

```python
create_react_agent(model, tools)
```

Tools come from `tools/registry.py` → `tools/core/factory.py` → `make_core_tools_for_agent()`.

Each specialist has a **contract** under `specialists/{inventory,business,creative}/`:

- `contract.yaml` — allowed tools
- `instructions.md` — worker behavior
- `profile.yaml` — metadata
- `agent.py` — thin wrapper calling `run_react_specialist`

**Temperature is 0** for workers. Only the Sous Chef supervisor uses persona tone (via `head_llm.py` + `prompts/builder.py`).

### Tools layer (`tools/core/`)

Ported from the pre-v1 stack (preserved on git branch `v0`). Key modules:

| Module | Role |
|--------|------|
| `factory.py` | LangChain `@tool` definitions per agent |
| `reads.py` | Pantry, menu, business analytics reads |
| `catalog_reads.py` | Formatted catalog search results |
| `catalog_lookup.py` | Name normalization, fuzzy search |
| `writes.py` | `CoreToolContext` — collects `pending_action` instead of writing |
| `recipe_build.py` | Build `recipe_build` plan from draft |
| `bills.py` | Bill batch operations |
| `menu_actions.py` | Dish/add-on slug resolution |

**Writes never hit MongoDB directly from chat tools** during preview turns. They populate `pending_action` on `CoreToolContext`. Next.js executes on confirm — same pattern as manual UI.

### Reply policy (`supervisor/reply_policy.py`)

Single place for Sous Chef voice rules:

- Append **Ready to save … to Kitchen? (Yes/No/Update Instructions)** on confirm gates
- Append **Ready to link …?** for link chat workflows
- Append **Which dish — 1, 2, or 3?** on `pick_dish`
- Strip duplicate questions; enforce one ask per turn

Next.js applies a second pass via `chat-reply-sanitizer.ts` for thread-specific cleanup (legacy compatibility).

### Synthesis (`supervisor/head_llm.py`)

After worker consults:

- **Read workflows** — often return worker text verbatim
- **Direct delegate persist** — return worker confirmation text
- **Otherwise** — LLM synthesizes a Sous Chef reply from `consult_results` + step `action` text
- Fallback templates when LLM unavailable

### Background workers

Not conversational — invoked by API routes and tools:

| Worker | File | Trigger |
|--------|------|---------|
| Bill pipeline | `workers/bill_pipeline.py` | `/parse-bill-pipeline` |
| Bill classifier | `workers/bill_classifier.py` | Inside pipeline |
| Image suggestions | `workers/image_suggestions.py` | `/suggest-images` |
| Recipe researcher | `workers/recipe_researcher.py` | Recipe draft tools |
| Recipe linker | `workers/recipe_linker.py` | `/link-recipe` |
| Catalog identify | `workers/catalog_identify.py` | Image → proposed dish name |

### Testing and evals

| Location | Purpose |
|----------|---------|
| `tests/unit/` | Workflow executor, triage, reply policy, direct link/read, catalog search |
| `tests/integration/` | HTTP route smoke tests |
| `evals/fixtures/` | Golden multi-turn YAML scenarios |
| `evals/workflow_chat_smoke.py` | Live smoke runner against running service |

Run unit tests:

```bash
cd backend/agent-service-v1
python -m pytest tests/unit -q
```

---

## Data model (summary)

MongoDB collections (see [DB/README.md](./DB/README.md)):

| Collection | Holds |
|------------|-------|
| `users` | Auth accounts |
| `restaurants` | Tenant boundary |
| `ingredients` | Pantry items, stock, reorder level |
| `dishes` | Menu items, sell price, recipe links |
| `addons` | Menu modifiers |
| `billuploads` | Parsed PO/SO batches |
| `conversations` | Chat sessions + `workflowState` |
| `suggestions` | Creative suggested dishes |

Images and bills use R2-compatible keys under `storage/r2/` locally.

---

## Local development workflow

```bash
# Terminal 1 — MongoDB
npm run docker:up

# Terminal 2 — agent-service-v1 on :8000
npm run dev:agent

# Terminal 3 — Next.js on :3000
npm run dev:web
```

Ensure `.env` at repo root has `MONGODB_URI`, `OPENAI_API_KEY`, and optionally `AGENT_SERVICE_URL=http://localhost:8000`.

Load test data: Dashboard → **Load test data**, or `POST /api/seed?force=1`.

---

## Pre-v1 stack (archived)

The original LangGraph-based `backend/agent-service` was removed from `master`. It remains available on git branch **`v0`** for reference.

| | `v0` branch (archived) | `agent-service-v1` (current) |
|--|------------------------|------------------------------|
| Orchestration | LangGraph in `agents/head/graph.py` | Linear `run_supervisor_turn()` |
| Workflow defs | Python `workflow_engine.py` + golden YAML | **Runtime YAML catalog** |
| Routing | `orchestration.py` regex + classifier | `triage.py` + `executor.py` |
| Reply sanitization | Multiple layers | Single `reply_policy.py` |

Executable specs live in `backend/agent-service-v1/workflows/catalog/`.

---

## Mental model for new contributors

1. **Chef message** → Next.js chat route
2. **Can TypeScript handle it deterministically?** → Do it, skip Python
3. **Else** → POST `/chat` with current `workflowState`
4. **Python** picks/continues YAML workflow step
5. **Step delegates?** → Run inventory/business/create (direct or ReAct)
6. **Supervisor** synthesizes reply + confirm gate
7. **Returns** `pending_action` / `recipe_build` if a write is staged
8. **Next.js** persists messages + state; executes writes on confirm
9. **MongoDB** is always the source of truth

When adding a new capability, prefer:

1. Add or extend a workflow in `workflows/catalog/*.yaml`
2. Add transition helpers if branching is novel
3. Add direct specialist shortcut if the step is purely deterministic
4. Add unit tests in `tests/unit/`
5. Wire confirm execution in Next.js if a new `pending_action` type is introduced

---

## Related documentation

| Doc | Contents |
|-----|----------|
| [System-Architecture.md](./System-Architecture.md) | Mermaid diagrams |
| [Architecture.md](./Architecture.md) | Short system overview |
| [Agents.md](./Agents.md) | Four chat personas, tool matrix |
| [Technologies.md](./Technologies.md) | Stack and Railway deployment |
| [backend/agent-service-v1/README.md](../backend/agent-service-v1/README.md) | v1 quick start |
| [backend/agent-service-v1/workflows/docs/](../backend/agent-service-v1/workflows/docs/) | Per-workflow walkthroughs |
