# Business Agent

| Field | Value |
|-------|-------|
| **Context key** | `business` |
| **Icon** | `business` |
| **Dashboard** | Dashboard → Business |
| **Persona** | Sharp restaurant analyst — POS, food cost, profitability |

## Role

Restaurant analyst. Answers sales, COGS, gross profit, margins, and supplier purchases for the selected **finance period**. Manages **sales bill** queue and processes POS receipts (with confirm).

Never confuse bulk supplier purchases with per-ticket COGS.

## Core tools

| Tier | Tool | Built? |
|------|------|--------|
| Read | [`query_business`](../Agentic_Tools/tools/query_business.md) | Yes |
| Write | [`apply_business`](../Agentic_Tools/tools/apply_business.md) | Yes |

Sales receipts ingested via Inventory's [`upload_bills`](../Agentic_Tools/tools/upload_bills.md) (classify → customer → SO queue).

## Manual equivalent

- **Read:** Dashboard Business charts and finance toggle
- **Write:** Upload orders → **Process sales bills** (after purchase bills processed)

## Context

Respects `financeView` from chat UI: `week` | `biweek` | `month` | `quarter`.

## Cannot use

- `upload_bills` — Inventory owns ingest (routes SO internally)
- `apply_inventory` — Inventory
- `apply_menu` — Creative

## Demo queries

- "How were sales this month?"
- "Which dishes have the worst margins?"
- "Process the sales receipts" (**confirm** — POs first)

## See also

- [Tool Index](../Agentic_Tools/Tool_Index.md)
- [Sous Chef](./sous-chef.md)
- [Inventory](./inventory.md)
