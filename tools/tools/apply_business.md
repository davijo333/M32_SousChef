# `apply_business`

| Field | Value |
|-------|-------|
| **Primary agent** | Business |
| **Used by** | **Business** |
| **Tier** | Write |
| **Built?** | Yes |
| **Confirm required?** | Yes |

## Summary

Process sales bills, price recommendations, margin actions.

## Dual path

**Manual:** Upload orders → Process sales bills

**Chat:** Chef invokes `apply_business` with an `action` parameter (see internal actions).

## Wraps

`agent-pending-actions.ts; POST /api/bills/confirm customer`

## Internal actions

The LLM sees **one** tool; the backend routes to:

- `process_sales_bills`
- `suggest_price_change`
- `apply_price_change`

## Build status

**Yes** — consolidated `@tool` shipped in `backend/agent-service-v1/tools/core/`.

Destructive or persistent changes require chef confirmation (`confirm_inventory`, `confirm_business`, or `confirm_suggestion` in chat).

## See also

- [Tool Index](../Tool_Index.md)
- [Business agent](../../../agents/business.md)
