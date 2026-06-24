# Sous Chef — Agents

Four pipeline agents plus deterministic inventory math in the web app. Python **FastAPI** service (`services/agent/`) orchestrates parse and enrich; Next.js persists to MongoDB and R2.

## Pipeline overview

Supplier bills **must** be processed before customer bills.

```
SUPPLIER BILL (.s_bill.) — PDF or PNG
  1a Supplier Bill Parser
         │  quick scan + detail parse (parallel, batches of 5)
         ▼
  2a Ingredient Normalizer
         │  match/create in DB · 2 images → R2 · default image path
         │  write Purchase_Order rows · update Kitchen ingredients
         ▼
  User clicks Process → stock qty updated

CUSTOMER BILL (.c_bill.) — after supplier processed
  1b Customer Bill Parser
         │  quick scan + detail parse (parallel)
         ▼
  2b Dish Inventory Agent
         │  match/create Dish_Inventory · Recipe Agent → active recipe
         │  link ingredients to dish · write Sales_Order rows
         ▼
  User clicks Process → deduct inventory · update availability
```

## Agent index

| Stage | Agent | Type | Doc | Code (today) |
|-------|-------|------|-----|--------------|
| **1a** | Supplier Bill Parser | LLM + vision | [1a-supplier-bill-parser](./1a-supplier-bill-parser/README.md) | `supplier_bill_parser.py` |
| **1b** | Customer Bill Parser | LLM + vision | [1b-customer-bill-parser](./1b-customer-bill-parser/README.md) | `customer_bill_parser.py` |
| **2a** | Ingredient Normalizer | Heuristics + images + DB | [2a-ingredient-normalizer](./2a-ingredient-normalizer/README.md) | `item_normalizer.py`, `kitchen-inventory.ts` |
| **2b** | Dish Inventory | LLM recipe + DB | [2b-dish-inventory](./2b-dish-inventory/README.md) | `recipe_researcher.py`, `recipe_linker.py` |

Orchestration: `bill_pipeline.py`, `catalog_prepare.py`

## Data tables

| Table | Doc | Purpose |
|-------|-----|---------|
| **Purchase_Order** | [purchase-order.md](../db/purchase-order.md) | Supplier line history: date, price, ingredient name |
| **Dish_Inventory** | [dish-inventory.md](../db/dish-inventory.md) | Menu catalog: dish id, name, price, addon flag, availability |
| **Sales_Order** | [sales-order.md](../db/sales-order.md) | Customer receipt lines: date, dish name, price |

Ingredient stock fields remain on the **Ingredient** collection — see [ingredients.md](../db/ingredients.md).

## API endpoints (agent service)

| Endpoint | Agent |
|----------|-------|
| `POST /parse-supplier-bill` | 1a |
| `POST /parse-customer-bill` | 1b |
| `POST /parse-bill-pipeline` | 1a or 1b via `bill_type` |
| `POST /prepare-catalog-batch` | 2a / 2b batch enrich |
| `POST /link-recipe` | 2b recipe + link |

## Design rules

1. **Bill parsers (1a, 1b) never write inventory** — they return structured lines only.
2. **Normalizers (2a, 2b) own catalog upserts** — names, images, purchase/sales rows, recipe links.
3. **Supplier before customer** — pantry must exist before sales depletion.
4. **Batch of 5** — web and agent parse up to five files concurrently.
5. **Two images per item** — agent finds two; highest-scored URL stored as default in DB / R2.
6. **Human Process step** — upload parses; user confirms batch Process to apply stock changes.

## Related

- [Product overview](../product/overview.md)
- [Upload Bills](../pages/upload-bills.md)
- [Kitchen Control](../pages/kitchen-control.md)
- [Agent docs in service tree](../../services/agent/docs/README.md)
