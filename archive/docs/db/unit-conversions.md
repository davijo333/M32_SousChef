# Unit conversions — menu usage → inventory

Menu items and add-ons record usage in **kitchen units** (slice, link, oz, cup). Inventory and supplier bills record stock in **purchase units** (lb, dozen, loaf, gallon, bottle). Sous Chef must translate between them for accurate depletion.

## Fields on each ingredient

| Field | Meaning |
|-------|---------|
| `inventoryUnit` | How stock is counted on hand and on vendor bills |
| `currentQty` | Quantity in `inventoryUnit` |
| `usageUnits[]` | Conversion factors from kitchen units → inventory |

Each `usageUnits` entry:

```json
{
  "unit": "slice",
  "countPerInventoryUnit": 16
}
```

**Meaning:** 1 `inventoryUnit` contains 16 `unit`s.

**Example:** Bacon stocked in lb; recipe uses 2 slices. If `countPerInventoryUnit` is 16 slices/lb:

```
inventoryDeduction = usageQty / countPerInventoryUnit
                   = 2 / 16
                   = 0.125 lb
```

## Formula

```
deductInventory(ingredientId, usageQty, usageUnit):
  factor = ingredient.usageUnits.find(u => u.unit === usageUnit).countPerInventoryUnit
  if !factor → error (unsupported unit)
  return usageQty / factor   // result in inventoryUnit
```

Reverse (display stock in kitchen units):

```
kitchenQty = currentQty * countPerInventoryUnit
```

## When inventoryUnit === usage unit

`countPerInventoryUnit: 1` — no conversion (croissants, bagels, avocados).

## Multiple usage units per ingredient

Cheese may be linked as **slices** (add-on) or **oz** (signature recipes). Store both:

```json
"usageUnits": [
  { "unit": "slice", "countPerInventoryUnit": 24 },
  { "unit": "oz", "countPerInventoryUnit": 16 }
]
```

## Standard volume conversions

| Purchase unit | Kitchen unit | countPerInventoryUnit |
|---------------|--------------|------------------------|
| gallon | oz | 128 |
| lb | oz | 16 |
| bottle (syrup) | oz | 25.4 |
| box (tea) | bag | 100 |
| dozen | each | 12 |

## Override behavior

If the user overrides `countPerInventoryUnit` on an ingredient (`manual_override: true`), the Inventory Engine uses their value — e.g. thinner bacon cut = 20 slices/lb instead of 16.

## Bill ingest

Vendor bills arrive in `inventoryUnit`. Menu `ingredientLinks` stay in kitchen `unit`. Conversions happen only at depletion / cost calculation time.

## Beverage sizes

Beverages scale from a **base recipe at 100% (Medium)** using `scalePercent`. See [sizes.md](./sizes.md).

## Related

- [Ingredients schema](./ingredients.md)
- [Beverage sizes](./sizes.md)
- Test fixtures: `test/ingredients.json`, `test/sizes.json`
