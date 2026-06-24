# Agentic Tools

Multi-agent chat architecture for Sous Chef: **Sous Chef** (supervisor) plus **Inventory**, **Business**, and **Creative** specialists.

See also: [User flows](./User_Flows.md), [User queries](./User_Queries.md), [Development](./Development.md), and per-agent tool catalogs.

## Architecture

```
User (floating chat dock, bottom center)
  ↓
Sous Chef (supervisor) — OR direct tab: Inventory | Business | Creative
  ↓
┌─────────────┬──────────────┬─────────────┐
│ Inventory   │ Business     │ Creative    │
│ + tools     │ + tools      │ + tools     │
└─────────────┴──────────────┴─────────────┘
  ↓
MongoDB · existing apps/web/lib/* · services/agent (FastAPI)
  ↓
Upload orders tabs (purchase / sales) — system of record for bill files
```

## UI

| Piece | Behavior |
|-------|----------|
| **Floating dock** | Fixed bottom center on all authenticated pages; page content scrolls behind |
| **4 tabs** | Sous Chef · Inventory · Business · Creative (manual override) |
| **Collapsed / expanded** | Compact bar vs full chat with messages |
| **Transcript kinds** | User message, agent message, consultation block, delegation banner, system switch |

## Two delegation modes

### Consultation (user stays with Sous Chef)

Sous Chef consults one or more specialists internally, then synthesizes one answer. Specialist dialogue appears in a collapsible **Kitchen discussion** block.

### Handoff (specialist talks to user)

Sous Chef delegates; `activeAgent` switches; tab bar syncs; user messages go to that specialist until **Return to Sous Chef**.

## Upload handoff rule

When user attaches files (max 10) in Sous Chef chat:

1. Sous Chef classifies each file → purchase (`supplier`) or sales (`customer`)
2. Parse dispatches to **Inventory** (purchase) or **Business** (sales)
3. Files persist in **`BillUpload`** → visible on **Upload orders** (correct tab only)
4. Sous Chef composer **clears attachments**; thread stores **delegation text only** (no file chips)
5. Parse/review/Process UI lives on Upload orders; specialists discuss bills by `billId` / filename

**Order:** process purchase orders before sales so dish recipes link to pantry stock.

## Tool tiers

| Tier | Who | Purpose |
|------|-----|---------|
| **Orchestration** | Sous Chef only | Route, consult, handoff, synthesize, classify uploads |
| **Read** | Specialists (+ Sous Chef via consult) | Query live kitchen data |
| **Write** | Specialists | Mutate catalog/recipes (confirm for destructive) |
| **Bridge** | Sous Chef (+ some specialists) | UI navigation, pipeline triggers |
| **Worker** | Sous Chef or specialists | Call existing FastAPI parsers/linkers |

## Inter-agent matrix

| From → To | Mechanism |
|-----------|-----------|
| Sous Chef → Inventory | `consult_inventory`, `handoff_to_inventory`, purchase upload handoff |
| Sous Chef → Business | `consult_business`, `handoff_to_business`, sales upload handoff |
| Sous Chef → Creative | `consult_creative`, `handoff_to_creative` |
| Specialist → another domain | `request_*_context` (via Sous Chef) or user switches tab |
| User → any | 4-tab override (`selectedAgent`) |

**Rule:** Specialists do not call each other directly — only Sous Chef consults or chains them (unless user is in direct tab mode).

## Security

- Every tool receives `restaurantId` from session — never from LLM args
- Writes require `userConfirmed: true` where noted
- No hallucinated figures — tools only

## Implementation map

| Tool family | Wraps |
|-------------|--------|
| Inventory reads | `dashboard-chat-context`, `Ingredient`, `kitchen-inventory` |
| Business reads | `dashboard-stats`, `dashboard-margins`, `dashboard-sales-analytics` |
| Creative reads | `create-cues`, `create-weather`, `Dish` / `Ingredient` |
| Creative writes | `create-suggestion.ts` |
| Recipe ops | `recipe-pipeline.ts`, `recipe-builder.ts`, `/api/recipes/status` |
| Bills | `/api/bills/*`, `services/agent` parse pipeline |
| Images | `services/agent/suggest-images` |

## Agent tool catalogs

| Agent | Doc |
|-------|-----|
| Sous Chef | [head-chef.md](./head-chef.md) |
| Inventory | [inventory-agent.md](./inventory-agent.md) |
| Business | [business-agent.md](./business-agent.md) |
| Creative | [creative-agent.md](./creative-agent.md) |

## Phasing

| Phase | Scope |
|-------|--------|
| **MVP** | Floating dock, 4 tabs, Sous Chef consult/handoff, 5–6 read tools per specialist, `add_suggested_dish`, upload handoff to Upload orders |
| **Phase 2** | Full write tools, bill Process from chat, Composio (email reorder list) |
| **Phase 3** | LangGraph checkpointing, advanced cross-agent chains |

## LangGraph

Orchestration lives in **`services/agent/`** (Python FastAPI). Next.js proxies chat to `AGENT_SERVICE_URL/chat`. See [Development.md](./Development.md).

| [Icon_Prompts.md](./Icon_Prompts.md) | App and agent avatar prompts + `public/brand/` |

- [Agents/](../Agents/) — existing Python workers (bill parser, normalizer, images)
- [UI/](../UI/) — pages and routes
- [DB/bill-upload.md](../DB/bill-upload.md) — `BillUpload` model
