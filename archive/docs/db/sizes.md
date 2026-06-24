# Beverage sizes — percentage scaling

Coffee, tea, and juice menu items support **Small / Medium / Large**. Recipes store **base quantities at 100% (Medium)**. Sizes apply a `scalePercent` multiplier — efficient storage, one recipe per drink.

Catalog: [`test/sizes.json`](../../test/sizes.json)

## Size definitions

| Size | scalePercent | priceMultiplier | Example (base $4.99) |
|------|--------------|-----------------|----------------------|
| Small | 75 | 0.85 | $4.24 |
| **Medium** | **100** | **1.0** | **$4.99** (default) |
| Large | 125 | 1.25 | $6.24 |

## Formulas

```
effectiveUsageQty = baseQty * (scalePercent / 100)   // when scalesWithSize: true
effectiveSellPrice = baseSellPrice * priceMultiplier
```

Then pass `effectiveUsageQty` through [unit conversion](./unit-conversions.md) → inventory.

## Menu item fields

```json
{
  "sellPrice": 5.49,
  "defaultSizeId": "size-medium",
  "sizeIds": ["size-small", "size-medium", "size-large"],
  "ingredientLinks": [
    {
      "ingredientId": "ing-espresso",
      "qtyPerServing": 2,
      "unit": "oz",
      "scalesWithSize": true
    }
  ],
  "customization": {
    "milk": { "qtyPerServing": 8, "unit": "oz", "scalesWithSize": true },
    "flavor": { "scalesWithSize": false }
  }
}
```

- `qtyPerServing` = amount at **100% (Medium)**
- `scalesWithSize: false` = fixed per order regardless of size (e.g. 1 tea bag, 1 flavor shot)

## Example — Large Frappe (125%)

Base at medium: 2 oz espresso, 8 oz milk, 6 oz ice, 2 oz cream.

| Ingredient | Base | × 125% | Effective |
|------------|------|--------|-----------|
| Espresso | 2 oz | × 1.25 | 2.5 oz |
| Milk | 8 oz | × 1.25 | 10 oz |
| Ice | 6 oz | × 1.25 | 7.5 oz |
| Heavy cream | 2 oz | × 1.25 | 2.5 oz |
| Flavor shot | 0.5 oz | fixed | 0.5 oz |

## Implementation

See `test/convert-usage.ts` — `scaleQty()`, `resolveUsageQty()`, `deductForOrderLine()`.

## Related

- [Unit conversions](./unit-conversions.md)
- [Menu catalog](../product/menu.md)
