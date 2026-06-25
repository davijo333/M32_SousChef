# Documentation

Reference docs for UI, database schemas, inventory, and recipes. Agent and tool **specs** live at the repo root.

| Folder | Contents |
|--------|----------|
| [../agents/](../agents/) | **4 chat agents** — profiles, handoff, workers |
| [../tools/](../tools/) | [Tool index](../tools/Tool_Index.md), [9 core tools](../tools/tools/), [development](../tools/Development.md) |
| [UI/](./UI/) | Pages and routes |
| [DB/](./DB/) | MongoDB collections |
| [Inventory/](./Inventory/) | Catalog reference (dishes, ingredients, add-ons) |
| [Recipes/](./Recipes/) | Workflow and classifications |

## Terminology

| User-facing | Internal |
|-------------|----------|
| Purchase order | `billType: "supplier"` |
| Sales order | `billType: "customer"` |
| Upload orders | `/upload-orders`, `/api/bills/*` |
| Sous Chef | Chat context `head` |
| Creative Agent | Chat context `create` |

## Test data

- `python3 test/scripts/recalculate-pricing.py` — refresh costs
- `npm run regenerate:bills` — bill fixtures
- Dashboard → Load test data, or `POST /api/seed?force=1`

Catalog source: `test/inventory/` (committed — optional `npm run regenerate:bills` after editing fixtures)
