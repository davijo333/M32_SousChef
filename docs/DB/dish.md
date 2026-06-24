# Dish

Collection: `dishes`

Model: `apps/web/src/models/Dish.ts`

| Field | Type | Notes |
|-------|------|-------|
| `restaurantId` | ObjectId | Tenant |
| `slug` | string | Unique per restaurant |
| `name` | string | Display name |
| `category` | string | Legacy; prefer `classification` |
| `classification` | string | `sandwich`, `coffee`, `tea`, `juice`, `beverage`, … |
| `sellPrice` | number | POS price |
| `ingredientLinks[]` | subdoc | Recipe lines |
| `recipeStatus` | string | `new`, `active`, `inactive`, `suggested` |
| `source` | string | e.g. `bill_upload` |
| `imageUrl` | string? | Optional |

## Indexes

`{ restaurantId, slug }` unique.

## Related docs

- [Inventory: dishes](../Inventory/dishes.md)
- [Recipes workflow](../Recipes/workflow.md)
