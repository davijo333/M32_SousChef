# Agentic Tools

Multi-agent chat for Sous Chef: **Sous Chef** (supervisor) plus **Inventory**, **Business**, and **Creative** specialists.

See also: [User flows](./User_Flows.md), [User queries](./User_Queries.md), [Development](./Development.md), and per-agent tool catalogs.

## Architecture

```
User (dashboard + floating Sous Chef dock)
  ↓
Sous Chef (context: head) — routes or delegates to specialists
  ↓
┌─────────────┬──────────────┬─────────────┐
│ Inventory   │ Business     │ Creative    │
│ section tab │ section tab  │ section tab │
└─────────────┴──────────────┴─────────────┘
  ↓
MongoDB · apps/web/lib/* · services/agent (FastAPI bill parse)
  ↓
Upload orders (/upload-orders) — system of record for bill files
```

## UI (shipped)

| Piece | Behavior |
|-------|----------|
| **Dashboard sections** | Inventory · Business · Create — each with agent header and stats |
| **Sous Chef dock** | Fixed bottom center on dashboard; one shared chat (`context: head`) |
| **Connect handoff** | When Sous Chef suggests a specialist, assistant messages show **Connect to … Agent**; switches section + `agentContext` with full history |
| **Connect back** | Below dock avatar — restores Sous Chef routing |
| **Avatar** | Dock logo follows active agent (`head_chef`, `inventory`, `business`, `creative`) |
| **Sessions** | Up to **5** saved chats per user |
| **Attachments** | Up to **5** PDF/image files per message in Sous Chef chat |

Specialists can also be reached by switching dashboard section directly (direct mode).

## Delegation modes

### Consultation (implemented via prompts)

Sous Chef answers cross-domain questions in one reply, using dashboard context builders. Specialist “kitchen discussion” blocks are **planned** (not in UI yet).

### Handoff (implemented)

Sous Chef suggests a specialist → user taps **Connect to … Agent** → dashboard section changes, dock avatar updates, subsequent messages route to that specialist until **Connect back to Sous Chef**.

Implementation: `chat-handoff.ts`, `POST /api/dashboard/chat` (`connectAgent`, `agentContext`), `DashboardChefChat.tsx`, `SousChefChatDock.tsx`.

## Upload handoff (planned)

**Today:** attach files in Sous Chef chat or use **Upload orders** (`/upload-orders`, max **10** files in queue).

**Planned:** Sous Chef classifies attachments → parse → files appear only on Upload orders tabs; chat stores delegation text only.

**Order:** process purchase orders before sales so dish recipes link to pantry stock.

## Tool tiers

| Tier | Who | Purpose |
|------|-----|---------|
| **Orchestration** | Sous Chef | Route, suggest handoff, synthesize |
| **Read** | Specialists | Query live kitchen data |
| **Write** | Specialists | Mutate catalog/recipes (confirm for destructive) |
| **Bridge** | Sous Chef | UI navigation hints |
| **Worker** | Background | FastAPI parsers, recipe pipeline |

## Inter-agent matrix

| From → To | Mechanism (today) |
|-----------|-------------------|
| Sous Chef → specialist | `connectAgent` + dashboard section switch |
| User → specialist | Dashboard section tab (direct mode) |
| Specialist → Sous Chef | **Connect back to Sous Chef** |
| Specialist → another domain | Prompt nudge to switch section or ask Sous Chef |

## Security

- Every API call scoped by `restaurantId` from session
- Writes require explicit user confirmation where noted
- No hallucinated figures — tools and context builders only

## Implementation map

| Area | Code |
|------|------|
| Chat API | `apps/web/src/app/api/dashboard/chat/route.ts` |
| Handoff detection | `apps/web/src/lib/chat-handoff.ts` |
| Prompts / context | `dashboard-chat.ts`, `dashboard-chat-context.ts` |
| Dock UI | `SousChefChatDock.tsx`, `DashboardChefChat.tsx` |
| Creative writes | `create-suggestion.ts` |
| Bills | `/api/bills/*`, `services/agent` parse pipeline |

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
| **MVP (shipped)** | Dock, Connect handoff, section tabs, 5 sessions, 5 chat attachments, specialist prompts + context |
| **Next** | Consultation blocks in transcript, upload handoff from chat, full tool loop in Python |
| **Later** | LangGraph checkpointing, Composio (email reorder list) |

## LangGraph

Chat today runs in **Next.js** (`/api/dashboard/chat`) with OpenAI and context builders. Python `services/agent` handles bill parse and image workers. LangGraph orchestration is **planned** in `services/agent/` — see [Development.md](./Development.md).

| [Icon_Prompts.md](./Icon_Prompts.md) | App and agent avatar prompts + `public/brand/` |

- [Agents/](../Agents/) — Python workers (bill parser, normalizer, images)
- [UI/](../UI/) — pages and routes
- [DB/bill-upload.md](../DB/bill-upload.md) — `BillUpload` model
