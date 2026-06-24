# `query_inventory`

| Field | Value |
|-------|-------|
| **Primary agent** | Inventory |
| **Used by** | **Inventory**, **Sous Chef (via consult)** |
| **Tier** | Read |
| **Built?** | Yes |
| **Confirm required?** | No |

## Summary

Query pantry stock, expiry, reorder, search, and purchase bill queue.

## Dual path

**Manual:** Dashboard Inventory + Kitchen control pantry

**Chat:** Chef invokes `query_inventory` with an `action` parameter (see internal actions).

## Wraps

`tools/core/reads.py + context/builders.py`

## Internal actions

The LLM sees **one** tool; the backend routes to:

- `get_pantry_summary`
- `get_low_stock`
- `get_expiring_ingredients`
- `search_ingredient`
- `get_ingredient_detail`
- `get_purchase_parse_queue`
- `get_purchase_bill_summary`

## Build status

**Yes** — consolidated `@tool` shipped in `services/agent/tools/core/`.

Read-only or navigation — no confirmation.

## See also

- [Tool Index](../Tool_Index.md)
- [Inventory agent](../../Agents/inventory.md)
