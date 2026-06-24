# Dish

Collection: `dishes`

Model: `apps/web/src/models/Dish.ts`

| Field | Type | Notes |
|-------|------|-------|
| `restaurantId` | ObjectId | Tenant |
| `slug` | string | Unique per restaurant |
| `name` | string | Display name |
| `category` | string | Legacy; prefer `classification` |
| `classification` | string | `sandwich`, `byo-sandwich`, `coffee`, `tea`, `juice`, `beverage`, … |
| `description` | string? | POS / image context; supplier brands OK here |
| `sellPrice` | number | POS price |
| `ingredientLinks[]` | subdoc | Recipe lines |
| `recipeStatus` | string | `new`, `active`, `inactive`, `suggested` |
| `suggestionNotes[]` | subdoc? | Rationale when `suggested` |
| `source` | string | e.g. `bill_upload`, `agent_create`, `seed` |
| `imageUrl` | string? | Optional |

## Classification labels (UI)

| Value | Label |
|-------|--------|
| `sandwich` | Signature Sandwich |
| `byo-sandwich` | BYO Sandwich |

Normalized via `normalizeDishClassification()` in `catalog-classification.ts`. Legacy `BYO-Sandwich` values map to `byo-sandwich`.

## Indexes

`{ restaurantId, slug }` unique.

## Related docs

- [Inventory: dishes](../Inventory/dishes.md)
- [Recipes classifications](../Recipes/classifications.md)
- [Recipes workflow](../Recipes/workflow.md)
