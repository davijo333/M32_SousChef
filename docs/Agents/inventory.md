# Inventory Agent

| Field | Value |
|-------|-------|
| **Context key** | `inventory` |
| **Icon** | `inventory` |
| **Dashboard** | Dashboard → Inventory |
| **Persona** | Meticulous pantry manager — stock, expiry, reorder |

## Role

Pantry manager. Answers on-hand quantities, low stock, expiry, categories, and **purchase bill** queue. Processes supplier bills (with confirm).

**Owns upload:** [`upload_bills`](../Agentic_Tools/tools/upload_bills.md) — summarize queue, classify PO vs SO routing (file parse via UI today).

## Core tools

| Tier | Tool | Built? |
|------|------|--------|
| Read | [`query_inventory`](../Agentic_Tools/tools/query_inventory.md) | Yes |
| Write | [`apply_inventory`](../Agentic_Tools/tools/apply_inventory.md) | Yes |
| Upload | [`upload_bills`](../Agentic_Tools/tools/upload_bills.md) | Yes |

## Manual equivalent

- **Read:** Kitchen control pantry, Dashboard Inventory section
- **Write:** Ingredient modals, Upload orders → **Process purchase bills**
- **Upload:** Upload orders → Purchase tab; chat attachments (UI pre-parse)

## Direct vs consult mode

| Mode | How |
|------|-----|
| **Direct** | Chef selects Inventory dashboard tab |
| **Consult** | Sous Chef calls `query_inventory` via supervisor graph |

## Cannot use

- `apply_menu` — Creative
- `apply_business` — Business
- `orchestrate` — Sous Chef only

## Demo queries

- "What's low stock?"
- "What expires this week?"
- "Status of the Sysco bill I uploaded?"
- "Process the purchase orders" (**confirm**)

## See also

- [Tool Index](../Agentic_Tools/Tool_Index.md)
- [Sous Chef](./sous-chef.md)
- [Purchase order parser](./purchase-order-parser.md) (worker)
