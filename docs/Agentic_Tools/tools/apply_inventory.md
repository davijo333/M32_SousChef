# `apply_inventory`

| Field | Value |
|-------|-------|
| **Primary agent** | Inventory |
| **Used by** | **Inventory** |
| **Tier** | Write |
| **Built?** | Yes |
| **Confirm required?** | Yes |

## Summary

Mutate pantry: reorder thresholds, process purchase bills, catalog patches.

## Dual path

**Manual:** Kitchen control modals; Upload orders → Process purchase bills

**Chat:** Chef invokes `apply_inventory` with an `action` parameter (see internal actions).

## Wraps

`agent-pending-actions.ts; PATCH /api/catalog/ingredients/[slug]; POST /api/bills/confirm supplier`

## Internal actions

The LLM sees **one** tool; the backend routes to:

- `update_reorder_threshold`
- `process_purchase_bills`
- `create_ingredient`
- `update_ingredient`

## Build status

**Yes** — consolidated `@tool` shipped in `services/agent/tools/core/`.

Destructive or persistent changes require chef confirmation (`confirm_inventory`, `confirm_business`, or `confirm_suggestion` in chat).

## See also

- [Tool Index](../Tool_Index.md)
- [Inventory agent](../../Agents/inventory.md)
