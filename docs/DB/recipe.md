# Recipe — data model

A **recipe** is a priced ingredient list for one dish or add-on. Created automatically when ingredients are linked (manually or by Recipe Agent).

## Fields

| Field | Type | Notes |
|-------|------|-------|
| `recipeNumber` | number | Sequential per restaurant (1, 2, 3…) |
| `kind` | `dish` \| `addon` | Target type |
| `targetSlug` | string | Dish or add-on slug |
| `dishName` | string | Display name at build time |
| `servingQty` | number | Portions per recipe (default 1) |
| `ingredients[]` | array | `{ ingredientSlug, ingredientName, qtyUsed, unit }` |
| `instructions[]` | string[] | Ordered step-by-step prep instructions (optional, defaults to `[]`) |
| `foodCost` | number | Sum of ingredient usage × `lastPurchasePrice` |
| `margin` | number | Markup rate (default `3.0` → sell = cost × 4) |
| `sellPrice` | number | Computed sell price; synced to Dish/AddOn |
| `progress` | enum | `linking` → `pricing` → `ready` (or `failed`) |
| `recipeStatus` | enum | Mirrors dish/add-on: `new`, `active`, `inactive`, `suggested` |

## Pricing

See `apps/web/src/lib/recipe-pricing.ts`:

```
foodCost = Σ (qtyUsed / usageFactor) × lastPurchasePrice
sellPrice = max(foodCost × (1 + margin), category price floor)
```

## Triggers

| Event | Behavior |
|-------|----------|
| Process purchase order | `runRecipePipeline()` — agent links empty dishes, then prices all |
| Save dish/add-on with `ingredientLinks` | `scheduleRecipeBuild()` — prices recipe async |
| Load test data | `buildAllRecipesForRestaurant()` after catalog seed |

Instruction steps are preserved on recipe rows and shown in recipe detail views when present.

## API

`GET /api/recipes` — dishes, add-ons, `inProgress[]`, and nested `recipe` metadata per item.
