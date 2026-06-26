# System Architecture

Detailed architecture diagrams for Sous Chef. For narrative walkthroughs see [How-It-Works.md](./How-It-Works.md).

## Platform overview

Sous Chef is a restaurant operations app: pantry, menu (dishes and add-ons), recipes, bill uploads, and a conversational **Sous Chef** that orchestrates specialist agents. The stack is a **monorepo** with a Next.js web app, shared TypeScript server logic, a Python **agent-service-v1** (primary), and MongoDB as the system of record.

```mermaid
flowchart TB
  subgraph Browser["Chef browser"]
    UI["Next.js pages\nDashboard · Kitchen · Recipes · Upload"]
    Dock["Sous Chef chat dock\nAgentChatDock / DashboardChefChat"]
  end

  subgraph Web["apps/web + backend/api"]
    API["API routes\n/api/dashboard/chat · /api/bills/* · /api/catalog/*"]
    Gates["Deterministic chat gates\nprice · reorder · upload confirm · recipe finalize"]
    Exec["Write executors\nagent-pending-actions · inventory · menu helpers"]
    Models["Mongoose models\nConversation · Ingredient · Dish · BillUpload"]
  end

  subgraph AgentV1["backend/agent-service-v1 (FastAPI :8000)"]
    ChatRoute["POST /chat"]
    Supervisor["Supervisor\ngraph.py"]
    WFE["Workflow engine\nYAML catalog + FSM"]
    Specialists["Specialists\ninventory · business · create"]
    Tools["tools/core\nDB reads/writes · bills · recipe build"]
    Workers["Background workers\nbills · images · recipe linker"]
  end

  subgraph External["External services"]
    Mongo["MongoDB Atlas / local"]
    OpenAI["OpenAI\nchat · vision · bill parsing"]
    R2["Cloudflare R2 / storage/r2\nimages · bill PDFs"]
  end

  UI --> API
  Dock --> API
  API --> Gates
  Gates -->|"no gate matched"| ChatRoute
  Gates --> Exec
  ChatRoute --> Supervisor
  Supervisor --> WFE
  WFE --> Specialists
  Specialists --> Tools
  API --> Workers
  Tools --> Mongo
  Exec --> Mongo
  Models --> Mongo
  Workers --> Mongo
  Workers --> OpenAI
  Supervisor --> OpenAI
  Specialists --> OpenAI
  API --> R2
```

## Repository layout

```mermaid
flowchart LR
  subgraph Root["Repo root"]
    Web["apps/web/\nNext.js 14 UI"]
    API["backend/api/\nShared TS services + models"]
    V1["backend/agent-service-v1/\nAgent stack"]
    Docs["docs/\nProduct + architecture"]
    Test["test/\nFixtures · seed images · bill PDFs"]
    Infra["infra/\nDocker Compose · scripts"]
  end

  Web --> API
  Web -->|"AGENT_SERVICE_URL"| V1
```

| Path | Responsibility |
|------|----------------|
| `apps/web/` | Pages, React components, thin API route handlers |
| `backend/api/` | Domain services, Mongoose models, chat intent parsers, agent HTTP client |
| `backend/agent-service-v1/` | **Workflow-first** Python orchestrator — triage, YAML workflows, specialists, tools |
| `docs/` | Architecture, agents, DB schemas, UI notes |
| `test/` | Committed catalog JSON, bill fixtures, seed images |
| `infra/` | MongoDB via Docker Compose, dev start scripts |

## Chat request path (dual path)

Every chef message to Sous Chef goes through **Next.js first**. Structured intents are handled deterministically in TypeScript; everything else is proxied to agent-service-v1.

```mermaid
sequenceDiagram
  participant Chef
  participant Next as Next.js chat route
  participant DB as MongoDB
  participant Agent as agent-service-v1

  Chef->>Next: POST /api/dashboard/chat
  Next->>DB: Load Conversation + restaurant context

  alt Deterministic gate (price, reorder, upload confirm, link confirm, recipe finalize)
    Next->>DB: Read / preview / write
    Next->>Chef: Reply + choices (no LLM)
  else LangChain path
    Next->>Agent: POST /chat (workflowState, history, confirms)
    Agent->>Agent: triage → workflow step → consult → synthesize
    Agent-->>Next: reply, workflowState, pendingAction, recipeBuild
    opt pendingAction or recipe finalize
      Next->>DB: Execute write on chef confirm
    end
    Next->>DB: Persist messages + workflowState
    Next->>Chef: Reply + activity metadata
  end
```

**Deterministic gates** live in `apps/web/src/app/api/dashboard/chat/route.ts` and `backend/api/services/chat/*`. They exist so common confirms (sell price, reorder level, bill processing, kitchen save) do not depend on LLM reliability.

**Agent path** is used when no gate matches. Next.js calls `callLangChainAgentChat()` in `backend/api/services/agents/agent-chat.ts`, which POSTs to `AGENT_SERVICE_URL/chat` (default `http://localhost:8000`).

## agent-service-v1 internal architecture

agent-service-v1 is the rebuilt agent stack. **YAML workflows are the source of truth** — they are loaded at startup and drive routing, confirm gates, and which specialist runs on each step.

```mermaid
flowchart TB
  subgraph HTTP["api/"]
    RChat["routes/chat.py"]
    RBills["routes/bills.py"]
    RImages["routes/images.py"]
    Schemas["schemas/chat.py\nChatRequest · ChatResponse"]
  end

  subgraph Domain["domain/"]
    TC["context.py\nTurnContext"]
    WS["workflows/engine/state.py\nWorkflowState"]
  end

  subgraph Supervisor["supervisor/"]
    Graph["graph.py\nrun_supervisor_turn"]
    Triage["triage.py\nLLM + regex workflow pick"]
    Router["router.py\nRouteDecision"]
    HeadLLM["head_llm.py\nSous Chef voice"]
    Reply["reply_policy.py\nconfirm gates · one question"]
  end

  subgraph Engine["workflows/engine/"]
    Loader["loader.py\ncatalog/*.yaml"]
    Executor["executor.py\nresolve + advance"]
    Intent["intent.py\nregex triggers · confirms"]
    Trans["transitions.py\nbranches · sub-workflows"]
  end

  subgraph Workers["specialists/"]
    Reg["registry.py"]
    DirectLink["direct_link.py\nlink workflows"]
    DirectRead["direct_read.py\nmenu lookup"]
    React["react_runner.py\nReAct when needed"]
    Inv["inventory/agent.py"]
    Biz["business/agent.py"]
    Cre["creative/agent.py"]
  end

  subgraph Tools["tools/core/"]
    Factory["factory.py\nLangChain tool bindings"]
    Reads["reads.py · catalog_reads.py"]
    Writes["writes.py\npending_action"]
    Bills["bills.py"]
    Recipe["recipe_build.py"]
  end

  RChat --> Graph
  Graph --> TC
  Graph --> Triage
  Triage --> Router
  Router --> Executor
  Executor --> Loader
  Graph --> Reg
  Reg --> DirectLink
  Reg --> DirectRead
  Reg --> React
  React --> Inv
  React --> Biz
  React --> Cre
  React --> Factory
  DirectLink --> Factory
  DirectRead --> Reads
  Graph --> HeadLLM
  Graph --> Reply
  Factory --> Reads
  Factory --> Writes
  Reads --> Mongo[(MongoDB)]
  Writes --> Mongo
```

### Layer rules

| Layer | Owns | Must not |
|-------|------|----------|
| `api/` | HTTP validation, serialization | Business logic, LLM calls |
| `workflows/` | Step definitions, gates, delegation targets | Persona wording |
| `supervisor/` | Triage, synthesis, reply policy, Sous Chef tone | Direct DB writes |
| `specialists/` | Worker contracts, ReAct runs, direct tool shortcuts | User-facing confirm copy (supervisor owns that) |
| `tools/` | MongoDB reads/writes, bill pipeline, recipe planning | Chat reply phrasing |
| `prompts/` | System prompt assembly from YAML + markdown specs | Workflow transitions |

## Single chat turn inside agent-service-v1

```mermaid
sequenceDiagram
  participant Graph as supervisor/graph.py
  participant Triage as triage.py
  participant Exec as executor.py
  participant Spec as specialists/registry
  participant LLM as head_llm.py
  participant Policy as reply_policy.py

  Graph->>Graph: TurnContext.from_request(req)
  Graph->>Triage: apply_triage (if no active workflow)
  Note over Triage: LLM picks workflow_id<br/>or regex fallback
  Graph->>Exec: resolve_step_for_turn
  Note over Exec: Continue active state<br/>or start from triggers
  alt Step has delegate
    Graph->>Spec: run_specialist_consult
    alt direct_delegate workflow
      Spec->>Spec: direct_link / direct_read
    else ReAct path
      Spec->>Spec: react_runner + tools
    end
    Graph->>Exec: advance_after_turn
    opt direct_delegate chain
      Graph->>Spec: chain lookup → persist (same turn)
    end
  end
  Graph->>LLM: synthesize_reply
  Graph->>Policy: sanitize_reply (confirm gates)
  Graph-->>Graph: ChatResponse dict
```

## Workflow engine (finite state machine)

Workflows are defined in `backend/agent-service-v1/workflows/catalog/*.yaml`. The loader merges all YAML files into one index keyed by `workflow.id`.

```mermaid
stateDiagram-v2
  [*] --> Idle: no workflowState
  Idle --> Active: triage or regex match
  Active --> Gate: step has gate
  Gate --> Active: chef confirms (yes/no/update)
  Active --> Consult: step has delegate
  Consult --> Active: advance_after_turn
  Active --> SubFlow: sub_workflow entry
  SubFlow --> Active: resume parent
  Active --> Idle: clears_workflow_state or read complete
  Gate --> Idle: chef cancels
```

**Persisted state** on each `Conversation` document:

```json
{
  "workflowId": "add_dish_from_chat",
  "stepId": "confirm_recipe",
  "lockedName": "Mango Smoothie",
  "gatesPassed": ["confirm_dish_identity"],
  "baggage": {
    "recipe_draft_raw": "...",
    "dish_idea_names": ["A", "B", "C"]
  }
}
```

Next.js and Python share this shape via `backend/api/services/chat/workflow-state.ts` and `workflows/engine/state.py`.

### Workflow catalog (v1)

| Catalog file | Example workflow IDs | Purpose |
|--------------|---------------------|---------|
| `addition-dish.yaml` | `add_dish_from_chat` | Full dish build: ideas → pick → recipe → kitchen save |
| `addition-ingredient.yaml` | `add_ingredient_from_chat` | New pantry ingredient |
| `addition-addon.yaml` | `add_addon_from_chat` | New menu add-on |
| `update-dish.yaml` | `update_dish` | Price, name, status changes |
| `update-ingredient.yaml` | `update_ingredient` | Pantry field updates |
| `update-addon.yaml` | `update_addon` | Add-on metadata |
| `update-link.yaml` | `link_dish_ingredients`, `link_addons_to_dish` | Embedded link flows inside larger updates |
| `update-link-chat.yaml` | `link_*_chat` | **Direct delegate** link flows from a single chat message |
| `query-inventory.yaml` | `inventory_menu_lookup`, `inventory_on_hand` | Menu catalog and stock reads |
| `query-business.yaml` | `business_margin_query`, … | Margins, sales reads |
| `query-creative.yaml` | `suggest_dish_addons`, … | Creative reads |
| `bills.yaml` | `process_bills`, … | PO/SO upload processing |
| `triage.yaml` | (metadata) | Triage hints for LLM classifier |
| `shared.yaml` | — | Shared step fragments |

Executable workflow definitions live in `backend/agent-service-v1/workflows/catalog/`. Historical golden markdown specs are preserved on the `v0` git branch.

## Specialist delegation model

Three **workers** exist — not four chat personas at the Python layer. The Sous Chef supervisor is the only persona-facing layer.

```mermaid
flowchart LR
  subgraph SousChef["Sous Chef (supervisor)"]
    Voice["head_llm + reply_policy"]
  end

  subgraph Specialists["Delegated workers"]
    Inv["inventory\nquery_inventory · apply_inventory\nupload_bills · query_menu"]
    Biz["business\nquery_business · query_inventory"]
    Cre["create\nquery_menu · query_inventory (read)"]
  end

  Voice -->|"step.delegate"| Inv
  Voice --> Biz
  Voice --> Cre
  Inv -->|"pending_action"| Next["Next.js executes write"]
```

| Specialist | Temperature | Tools (via `tools/registry.py`) | Typical steps |
|------------|-------------|----------------------------------|---------------|
| `inventory` | 0 | Kitchen + pantry + bills + menu apply | Duplicate check, ingredient gaps, persist, link |
| `business` | 0 | Business analytics + pantry read | Margin pass after dish build |
| `create` | 0 | Menu + pantry read | Dish ideas, recipe draft, visual brief |

**Direct paths** (no ReAct loop) for predictable operations:

- `specialists/direct_read.py` — `mode: read` workflows (menu catalog lookup, add-on list)
- `specialists/direct_link.py` — `direct_delegate: true` link workflows (addon→dish, ingredient links)

## Write confirmation flow

Agents never silently write to production collections. Writes surface as `pending_action` or `recipe_build` for Next.js to execute after the chef confirms.

```mermaid
sequenceDiagram
  participant Chef
  participant SC as Sous Chef
  participant Inv as Inventory worker
  participant Next as Next.js
  participant DB as MongoDB

  Chef->>SC: "Set pancakes to $12"
  SC->>Inv: delegate update step
  Inv-->>SC: preview + pending_action
  SC->>Chef: "Ready to apply…? (Yes/No/Update)"
  Chef->>Next: "Yes"
  Next->>DB: executeAgentPendingAction()
  Next->>Chef: "Updated pancakes sell price to $12"
```

The same helpers power **manual UI** (Kitchen control, Upload orders) and **chat** — chat is an alternate front door, not a separate data path.

## Bill and image pipelines

```mermaid
flowchart LR
  Upload["Upload orders UI\nor chat attachment"]
  Parse["POST /parse-bill-pipeline\nworkers/bill_pipeline.py"]
  Review["Chef reviews parsed lines"]
  Confirm["POST /api/bills/confirm\nNext.js applies stock"]
  Mongo[(MongoDB)]

  Upload --> Parse
  Parse --> Review
  Review --> Confirm
  Confirm --> Mongo
```

Image suggestions for new dishes flow through `POST /suggest-images` (`workers/image_suggestions.py`). Recipe linking uses `POST /link-recipe`.

Process **purchase orders before sales orders** so dish recipes resolve against pantry stock.

## Deployment topology

```mermaid
flowchart TB
  subgraph Railway["Railway (production)"]
    WebSvc["Next.js web service"]
    AgentSvc["agent-service-v1 FastAPI"]
  end

  Atlas["MongoDB Atlas"]
  R2["Cloudflare R2"]
  OpenAI["OpenAI API"]

  WebSvc --> AgentSvc
  WebSvc --> Atlas
  AgentSvc --> Atlas
  WebSvc --> R2
  AgentSvc --> OpenAI
  WebSvc --> OpenAI
```

| Variable | Used by | Purpose |
|----------|---------|---------|
| `MONGODB_URI` | Web + agent | Database connection |
| `AGENT_SERVICE_URL` | Web | Points to v1 FastAPI (`/chat`) |
| `OPENAI_API_KEY` | Agent + some Next routes | LLM + vision |
| `USE_LANGCHAIN_AGENTS` | Web chat route | `false` disables agent proxy |
| `R2_STORAGE_ROOT` | Web | Local or R2 image/bill storage |

Local dev: `npm run dev:agent` (port 8000) + `npm run dev:web` (port 3000) + `npm run docker:up` (MongoDB).

## Related docs

- [How-It-Works.md](./How-It-Works.md) — end-to-end narrative, especially agent-service-v1
- [Architecture.md](./Architecture.md) — shorter overview
- [Agents.md](./Agents.md) — chat agents and tool matrix
- [backend/agent-service-v1/ARCHITECTURE.md](../backend/agent-service-v1/ARCHITECTURE.md) — v1 module-level notes
- [backend/agent-service-v1/workflows/README.md](../backend/agent-service-v1/workflows/README.md) — YAML catalog reference
