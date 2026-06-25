# Business Agent — spec complete

## Policy

**Read-only** for database mutations. Inventory Agent owns all catalog/stock writes.

## Tools

| Tool | Purpose |
|------|---------|
| `query_business` | Finance reads, promotion opportunities, price & reorder recommendations |
| `query_inventory` | Pantry context for reorder analysis |

## Spec files

- [x] `profile.yaml` — analyst persona, promotion/reorder advisory role
- [x] `instructions.md` — delegate writes to Inventory; expiry recipes to Creative
- [x] `tasks.yaml` — finance read workflows and tool_instructions
- [x] `evals/README.md` — placeholder for golden conversations
- [x] Synced `dashboard-chat.ts` + `dashboard-chat-context.ts` business block
- [x] Updated repo `agents/business.md`

## Analytics

Python helpers in `tools/core/business_analytics.py` mirror dashboard formulas (`dashboard-sales-analytics.ts`).

## Chef-facing behavior

When chef confirms sales bill processing, price updates, or reorder changes on Business tab, runner **coerces to Inventory** automatically.
