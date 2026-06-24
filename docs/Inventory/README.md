# Inventory

What the kitchen sells (menu) and what it stocks (pantry). Live data is in MongoDB; [`test/inventory/`](../../test/inventory/) is the Panera Cafe fixture catalog used for demo seed, bill generation, and upload tests.

| Doc | Contents |
|-----|----------|
| [ingredients.md](./ingredients.md) | Pantry items — manual add and PO ingest |
| [dishes.md](./dishes.md) | Menu dishes — manual add and sales-order ingest |
| [add-ons.md](./add-ons.md) | POS modifiers — manual add and sales-order ingest |

## How data gets in

| Source | Creates / updates |
|--------|-------------------|
| **Kitchen Control** → + Ingredient / + Dish / + Add-on | Manual catalog rows with class, description, images |
| **Dashboard** → Load Panera Cafe demo | Full catalog from `test/inventory/*.json` |
| **Purchase orders** (supplier bills) | Ingredients — category inferred from line text |
| **Sales orders** (POS bills) | Dishes and add-ons — classification and description from line text |

Recipe linking and status (`new` → `active`) are covered in [Recipes workflow](../Recipes/workflow.md).
