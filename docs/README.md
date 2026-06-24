# Documentation

| Folder | Contents |
|--------|----------|
| [Agents/](./Agents/) | **4 chat agents** — [index](./Agents/README.md), one file each + workers |
| [Agentic_Tools/](./Agentic_Tools/) | [Tool index](./Agentic_Tools/Tool_Index.md), [9 core tools](./Agentic_Tools/tools/), [development](./Agentic_Tools/Development.md) |
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

## Test data

- `python3 test/scripts/recalculate-pricing.py` — refresh costs
- `npm run regenerate:bills` — bill fixtures
- Dashboard → Load test data, or `POST /api/seed?force=1`

Catalog source: [test/inventory/](../test/inventory/)
