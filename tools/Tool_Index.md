# Tool Index

Nine **core chat tools** (4 read · 4 write/orchestrate · 1 upload). Each wraps many internal actions — not 92 separate LLM tools.

**Built?**
- **Yes** — consolidated `@tool` in `backend/agent-service/tools/core/`
- **Partial** — tool shipped; some actions still manual/UI-only
- **No** — not implemented

**Totals:** 9 core tools — Yes: 9 · Partial: 0 · No: 0

| Tool | Primary agent | Also used by | Tier | Built? | Confirm? |
|------|---------------|--------------|------|--------|----------|
| [`query_kitchen`](./tools/query_kitchen.md) | Sous Chef | Sous Chef | Read | Yes | No |
| [`orchestrate`](./tools/orchestrate.md) | Sous Chef | Sous Chef | Orchestrate | Yes | No |
| [`query_inventory`](./tools/query_inventory.md) | Inventory | Inventory, Sous Chef (via consult) | Read | Yes | No |
| [`apply_inventory`](./tools/apply_inventory.md) | Inventory | Inventory | Write | Yes | Yes |
| [`upload_bills`](./tools/upload_bills.md) | Inventory | Inventory | Upload | Yes | No |
| [`query_business`](./tools/query_business.md) | Business | Business, Sous Chef (via consult) | Read | Yes | No |
| [`apply_business`](./tools/apply_business.md) | Business | Business | Write | Yes | Yes |
| [`query_menu`](./tools/query_menu.md) | Creative | Creative, Sous Chef (via consult) | Read | Yes | No |
| [`apply_menu`](./tools/apply_menu.md) | Creative | Creative | Write | Yes | Yes |

## By agent

### Sous Chef
- Read: [`query_kitchen`](./tools/query_kitchen.md)
- Orchestrate: [`orchestrate`](./tools/orchestrate.md)

### Inventory
- Read: [`query_inventory`](./tools/query_inventory.md)
- Write: [`apply_inventory`](./tools/apply_inventory.md)
- Upload: [`upload_bills`](./tools/upload_bills.md)

### Business
- Read: [`query_business`](./tools/query_business.md)
- Write: [`apply_business`](./tools/apply_business.md)

### Creative
- Read: [`query_menu`](./tools/query_menu.md)
- Write: [`apply_menu`](./tools/apply_menu.md)

## Code

- Factory: `backend/agent-service/tools/core/factory.py`
- Reads: `backend/agent-service/tools/core/reads.py`
- Writes / pending actions: `backend/agent-service/tools/core/writes.py`, `backend/api/services/agents/agent-pending-actions.ts`

Agent profiles: [agents/](../../agents/README.md)
