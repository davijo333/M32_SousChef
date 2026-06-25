# Agents

Four **chat agents** chefs talk to, plus **background workers** for bills, images, and recipe linking.

Manual UI always works in parallel — agents augment chat; they do not replace Kitchen control or Upload orders.

## Chat agents

| Agent | Context | Where | Writes |
|-------|---------|-------|--------|
| **Sous Chef** | `head` | Dashboard floating chat dock | Routes only — confirms before delegating writes |
| **Inventory Agent** | `inventory` | Dashboard → Inventory tab | Pantry, dishes, add-ons, bills, reorder level |
| **Business Agent** | `business` | Dashboard → Business tab | Read-only — advises on margins, pricing, reorder |
| **Creative Agent** | `create` | Dashboard → Create tab | Suggested dishes, recipe drafts, add-on ideas |

**No fifth chat agent.** New capabilities = new **actions** inside existing tools, not new personas.

### Sous Chef (supervisor)

- Runs golden workflows (`backend/agent-service/agents/head/golden-workflows.yaml`)
- Consults specialists sequentially; synthesizes tool output
- Does **not** invent stock figures or claim writes completed
- Deterministic chat gates in Next.js handle common confirms (price, reorder, recipe save) without LLM

### Inventory Agent

- **Pantry** — stock, expiry, reorder level, ingredient search
- **Catalog writes** — create/update/delete ingredients, dishes, add-ons; link recipes
- **Bills** — process purchase and sales uploads after chef confirm
- Reorder level applies to **ingredients only** — search pantry, preview, confirm, persist

### Business Agent

- Sales, margins, food cost, promotion opportunities
- Recommends sell price and reorder threshold; **Inventory Agent applies** after confirm

### Creative Agent

- Daily cues, specials, suggested dishes
- Drafts recipes and visual briefs; Inventory persists on confirm

## Handoff

From Sous Chef chat, **Connect to … Agent** switches dashboard section and specialist context while keeping conversation history. **Connect back to Sous Chef** restores supervisor routing.

## Core tools (9)

| Agent | Tools |
|-------|-------|
| Sous Chef | `query_kitchen`, `orchestrate` |
| Inventory | `query_inventory`, `apply_inventory`, `upload_bills` |
| Business | `query_business`, `apply_business` |
| Creative | `query_menu`, `apply_menu` |

Full tool list: [../tools/Tool_Index.md](../tools/Tool_Index.md)

## Write confirmation flow

1. Agent previews a change (price, reorder, bill process, catalog create, …)
2. Chef confirms (`confirm`, `yes`, …)
3. Python returns `pending_action` (or deterministic route executes directly)
4. Next.js runs the write via `agent-pending-actions.ts` / inventory or menu helpers

## Background workers

Python FastAPI workers at `backend/agent-service/` — invoked by tools and UI, not conversational:

| Worker | Endpoint |
|--------|----------|
| Bill parse pipeline | `POST /parse-bill-pipeline` |
| Image suggestions | `POST /suggest-images` |
| Recipe linker | `POST /link-recipe` |
| Catalog batch prep | `POST /prepare-catalog-batch` |
| Chat orchestration | `POST /chat` |

## Per-agent specs

Detailed profiles, tasks, and eval notes:

| Agent | Spec folder | Overview doc |
|-------|-------------|--------------|
| Sous Chef | `backend/agent-service/agents/head/` | [../agents/sous-chef.md](../agents/sous-chef.md) |
| Inventory | `backend/agent-service/agents/inventory/` | [../agents/inventory.md](../agents/inventory.md) |
| Business | `backend/agent-service/agents/business/` | [../agents/business.md](../agents/business.md) |
| Creative | `backend/agent-service/agents/creative/` | [../agents/creative.md](../agents/creative.md) |

Index: [../agents/README.md](../agents/README.md)

## Related

- [Architecture.md](./Architecture.md) — system diagram and chat dual path
- [../tools/Development.md](../tools/Development.md) — LangGraph supervisor flow
