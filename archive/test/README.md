# Test data — Sunrise Diner

Sample **menu items** and **ingredients** for the breakfast diner / café MVP.

## Terminology

| Code / DB | User-facing label |
|-----------|-------------------|
| `Dish` | **Menu item** |
| `RawMaterial` | **Ingredient** |

## Files

| File | Contents |
|------|----------|
| `menu-items.json` | Full catalog: sandwiches, coffee, tea, juice |
| `ingredients.json` | Pantry stock with qty, unit, expiry, **usageUnits** conversions |
| `add-ons.json` | Sandwich add-ons, coffee milk options, flavor shots |
| `sizes.json` | S / M / L definitions with `scalePercent` and `priceMultiplier` |
| `convert-usage.ts` | Reference: kitchen unit → inventory unit math |
| `bills/` | Sample customer + supplier bill PNG/PDF files — see [bills/README.md](bills/README.md) |

## Unit conversions

Ingredients are stocked in **purchase units** (`inventoryUnit`: lb, dozen, loaf, gallon). Menu links use **kitchen units** (slice, link, oz, cup).

Each ingredient stores `usageUnits` — how many kitchen units fit in one purchase unit:

```json
{
  "id": "ing-bacon",
  "inventoryUnit": "lb",
  "currentQty": 8,
  "usageUnits": [
    { "unit": "slice", "countPerInventoryUnit": 16 }
  ]
}
```

2 slices sold → deduct `2 / 16 = 0.125` lb.

See [`docs/db/unit-conversions.md`](../docs/db/unit-conversions.md).

## Beverage sizes (percentage scaling)

Recipes store **base qty at Medium (100%)**. Sizes multiply by `scalePercent`:

| Size | scalePercent | priceMultiplier |
|------|--------------|-----------------|
| Small | 75 | 0.85 |
| Medium | 100 | 1.0 |
| Large | 125 | 1.25 |

`effectiveQty = baseQty × (scalePercent / 100)` when `scalesWithSize: true`.

Flavor shots and tea bags use `scalesWithSize: false` (fixed per cup).

See [`docs/db/sizes.md`](../docs/db/sizes.md).

## Menu catalog (Sunrise Diner)

### Breakfast sandwiches

**Customizable** — pick a base, then add-ons:

| Base | Menu item | Starting price |
|------|-----------|----------------|
| Croissant | Custom Croissant Sandwich | $8.99 |
| Bread | Custom Bread Sandwich | $7.99 |
| Bagel | Custom Bagel Sandwich | $8.49 |

**Add-ons** (any combination): bacon, sausage, egg, cheese, veggies

**3 signatures** (fixed recipes, not customizable):

| Signature | Base | Build |
|-----------|------|-------|
| The Sunrise Stack | Bagel | Bacon, fried egg, cheddar |
| Garden Morning Croissant | Croissant | Scrambled egg, swiss, spinach, tomato |
| The Farmer's Double | Bread | Bacon, sausage, fried egg, american cheese |

### Coffee (4)

All coffee menu items are **customizable** — pick milk type and an optional flavor shot.

| Drink | Starting price |
|-------|----------------|
| Hot Coffee | $3.49 |
| Frappe | $5.49 |
| Mocha | $5.99 |
| Cappuccino | $4.99 |

**Milk options:** whole (default), skim, oat, almond, soy, half & half. Hot coffee also offers black / no milk.

**Flavor shots:** vanilla, caramel, hazelnut (+$0.50 each). Mocha includes chocolate syrup; flavors stack on top.

**Coffee prep:** ice, heavy cream, frothing milk (see menu catalog).

### Tea (2)

English Breakfast, Green Tea

### Juice (3)

Orange Juice, Apple Juice, Cranberry Juice

## Usage

Load into seed scripts, Storybook fixtures, or integration tests. Link menu items to ingredients via `ingredientLinks` on each item (signatures and beverages) or via add-on rules (custom sandwiches).

**Bill fixtures:** use `bills/customer/*.png` for sales receipt parser tests and `bills/supplier/*.pdf` for supplier invoice tests. See `bills/manifest.json` for coverage mapping.
