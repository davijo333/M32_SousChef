# `query_business`

| Field | Value |
|-------|-------|
| **Primary agent** | Business |
| **Used by** | **Business**, **Sous Chef (via consult)** |
| **Tier** | Read |
| **Built?** | Yes |
| **Confirm required?** | No |

## Summary

Query sales, margins, finance period summaries, and sales bill queue.

## Dual path

**Manual:** Dashboard Business charts and tables

**Chat:** Chef invokes `query_business` with an `action` parameter (see internal actions).

## Wraps

`tools/core/reads.py + context/builders.py`

## Internal actions

The LLM sees **one** tool; the backend routes to:

- `get_finance_summary`
- `get_top_selling_dishes`
- `get_dish_margin_rankings`
- `compare_sales_vs_purchases`
- `get_sales_timeline`
- `get_sales_parse_queue`
- `get_sales_bill_summary`

## Build status

**Yes** — consolidated `@tool` shipped in `services/agent/tools/core/`.

Read-only or navigation — no confirmation.

## See also

- [Tool Index](../Tool_Index.md)
- [Business agent](../../Agents/business.md)
