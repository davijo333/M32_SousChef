# Business Agent

| Field | Value |
|-------|-------|
| **Context key** | `business` |
| **Icon** | `business` |
| **Dashboard** | Dashboard → Business |
| **Persona** | Sharp restaurant analyst — POS, margins, promotion strategy |
| **Spec** | `backend/agent-service/agents/business/` (`profile.yaml`, `instructions.md`, `tasks.yaml`) |

## Role

**Read-only** finance and promotion analyst for the selected **finance period**:

- Sales summaries, margins, top/slow sellers
- **Promotion opportunities** (slow sellers + weak margins)
- **Sell price reset recommendations** (`suggest_price_change`)
- **Reorder threshold recommendations** (`suggest_reorder_threshold`)
- Sales bill queue guidance (`sales_queue`, `purchase_prerequisite`)

Never confuse bulk supplier purchases with per-ticket COGS.

**Does not mutate the database.** Inventory Agent applies sell price, reorder threshold, and bill processing after chef confirms.

Expiry-driven recipe ideas → **Creator Agent**.

## Core tools

| Tier | Tool | Built? |
|------|------|--------|
| Read | [`query_business`](../tools/tools/query_business.md) | Yes |
| Read | `query_inventory` (pantry context) | Yes |
| Write | — | N/A (delegates to Inventory) |

`apply_business` was removed — writes moved to Inventory `apply_inventory`.

## `query_business` actions

`finance_summary`, `top_selling`, `slow_sellers`, `margins`, `sales_vs_purchases`, `sales_queue`, `sales_bill_summary`, `purchase_prerequisite`, `top_used_ingredients`, `promotion_opportunities`, `suggest_price_change`, `suggest_reorder_threshold`

## Manual equivalent (Option A)

- **Charts:** Dashboard Business / Kitchen Insights — direct API, no agent
- **Chat:** Business Agent interprets the same data and recommends actions
- **Writes:** Inventory Agent (`apply_price_change`, `update_reorder_threshold`, `process_sales_bills`)

## Context

Respects `financeView` from chat UI: `week` | `biweek` | `month` | `quarter`.

## Cannot use

- `upload_bills` — Inventory owns ingest
- `apply_inventory` / `apply_menu` — Inventory

## Demo queries

- "How were sales this month?"
- "Which dishes should we promote?"
- "Should we raise the price on the house latte?"
- "What reorder level should croissants be?"
- "Process the sales receipts" → directs chef to **Inventory** (POs first)

## See also

- [Tool Index](../tools/Tool_Index.md)
- [Sous Chef](./sous-chef.md)
- [Inventory](./inventory.md)
