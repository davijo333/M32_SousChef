# 2b — Dish Inventory Agent

**Stage 2b** · Menu catalog, recipes, sales history

Handles **customer-parsed dish lines**: match or create menu entries, research recipes against current pantry, link ingredients, and record sales.

## Purpose

Connect *what you sell* to *what you use*. When a POS receipt introduces a new dish, **2b** creates the **Dish_Inventory** row, finds an active recipe, and links ingredient slugs from current inventory.

## When it runs

- **During customer bill pipeline** — after **1b** quick scan (parallel with detail parse)
- On **Process** — upsert dishes, persist recipe links, write **Sales_Order**, deduct stock
- **Link recipes** action on Kitchen for unlinked dishes

## Flow

```
For each parsed customer line:
  1. Search Dish_Inventory / MenuItem by name
  2. If EXISTS → update price if changed; record sale
  3. If NEW    → create Dish_Inventory row
                 → Recipe Agent: typical ingredients + qty per serving
                 → resolve ingredient slugs against current Ingredient inventory
                 → store active recipe (ingredientLinks on MenuItem)
                 → 2 dish images → R2, default path in DB
  4. Write Sales_Order row (date, dishName, price)
  5. On Process: deduct linked ingredient qty · recompute Available flag
  6. Kitchen View updates dish cards + availability
```

## Input

| Field | Source |
|-------|--------|
| Parsed dish lines | **1b** output |
| `availableIngredients[]` | Current Ingredient collection |
| `addon_slugs[]` | Existing add-on menu items |
| Enrichment | Pipeline `enriched[]` (images, suggested links) |

## Output

| Target | Fields |
|--------|--------|
| **Dish_Inventory** | `dishId`, `dishName`, `price`, `isAddon`, `available` |
| **MenuItem** (today) | `slug`, `name`, `sellPrice`, `ingredientLinks[]`, `imageUrl`, `addonsEnabled` |
| **Sales_Order** | `date`, `dishName`, `price` (+ qty, billId) |
| **Kitchen UI** | Dish cards, recipe link status, “can make N” availability |

### Available flag

`available` = dish can be made from **current Ingredient** stock given its active recipe. Recomputed after each supplier Process or customer sale.

## Recipe Agent (internal to 2b)

Uses LLM culinary knowledge + pantry list:

1. Propose ingredients and qty per serving
2. Map names → existing ingredient slugs
3. Flag missing pantry items for Kitchen review
4. Respect add-ons and size scaling rules (coffee, customizable sandwiches)

Code today: `recipe_researcher.py` + `recipe_linker.py` — will be unified under **2b**.

## Does not do

- Parse receipt images (→ **1b**)
- Ingredient purchase ingest (→ **2a**)
- Raw stock math without recipe links (deterministic engine in `kitchen-inventory.ts`)

## Code (current)

| Layer | Path |
|-------|------|
| Recipe research | `services/agent/recipe_researcher.py` |
| Slug linking | `services/agent/recipe_linker.py` |
| Web ingest | `apps/web/src/lib/kitchen-inventory.ts` |
| Catalog API | `apps/web/src/app/api/catalog/menu-items/` |

## Related

- [Dish_Inventory table](../../db/dish-inventory.md)
- [Sales_Order table](../../db/sales-order.md)
- [Ingredients model](../../db/ingredients.md)
