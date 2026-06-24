# Ingredients — data model

Stock items for a restaurant. User-facing label: **ingredient**. Code model: `RawMaterial`.

## Core fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Stable slug |
| `name` | string | Display name |
| `category` | enum | bakery, protein, dairy, produce, beverage |
| `inventoryUnit` | string | lb, dozen, loaf, gallon, bottle, box, each, oz |
| `currentQty` | number | On-hand quantity in `inventoryUnit` |
| `reorderThreshold` | number | Alert when `currentQty` falls below |
| `expiryDate` | ISO date \| null | |
| `lastPurchasePrice` | number | Per `inventoryUnit` from last bill |
| `source` | enum | seed, bill_upload, manual |
| `usageUnits` | array | Kitchen-unit conversions — see [unit-conversions.md](./unit-conversions.md) |
| `manualOverrides` | object | Fields user locked from auto-ingest |

## usageUnits

```ts
type UsageUnit = {
  unit: string;                  // slice, link, oz, cup, each, bag, lb
  countPerInventoryUnit: number; // how many `unit` in 1 inventoryUnit
  notes?: string;
};
```

## Menu item links

`ingredientLinks` on menu items use **kitchen units** only:

```json
{ "ingredientId": "ing-bacon", "qtyPerServing": 2, "unit": "slice" }
```

Inventory math converts to `inventoryUnit` before deducting from `currentQty` (see [2a Ingredient Normalizer](../agents/2a-ingredient-normalizer/README.md)).

## Related tables

| Table | Doc |
|-------|-----|
| Purchase_Order | [purchase-order.md](./purchase-order.md) |
| Dish_Inventory | [dish-inventory.md](./dish-inventory.md) |
| Sales_Order | [sales-order.md](./sales-order.md) |

## Test data

[`test/ingredients.json`](../../test/ingredients.json)
