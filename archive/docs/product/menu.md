# Sunrise Diner — Menu catalog

Breakfast diner / café menu for the Sous Chef MVP. Demo restaurant: **Sunrise Diner**.

**Terminology:** user-facing **menu items** (code: `Dish`) and **ingredients** (code: `RawMaterial`).

Test fixtures: [`test/menu-items.json`](../../test/menu-items.json), [`test/ingredients.json`](../../test/ingredients.json), [`test/add-ons.json`](../../test/add-ons.json).

---

## Categories

| Category | Count | Notes |
|----------|-------|-------|
| Breakfast sandwiches | 6 | 3 customizable + 3 signatures |
| Coffee | 4 | Hot, Frappe, Mocha, Cappuccino — customizable milk & flavor |
| Tea | 2 | English Breakfast, Green Tea |
| Juice | 3 | Orange, Apple, Cranberry |

**Total menu items:** 15

---

## Breakfast sandwiches

### Sandwich bases

Every sandwich starts with one base:

| Base | Used in |
|------|---------|
| **Croissant** | Custom Croissant Sandwich, Garden Morning Croissant |
| **Bread** (sourdough) | Custom Bread Sandwich, The Farmer's Double |
| **Bagel** | Custom Bagel Sandwich, The Sunrise Stack |

### Customizable sandwiches

Customer picks a base, then any combination of add-ons. Base price includes the bread only; add-ons charged extra.

| Menu item | Base | Starting price |
|-----------|------|----------------|
| Custom Croissant Sandwich | Croissant | $8.99 |
| Custom Bread Sandwich | Bread | $7.99 |
| Custom Bagel Sandwich | Bagel | $8.49 |

### Add-ons

| Add-on | Extra charge | Ingredient impact |
|--------|--------------|-------------------|
| Bacon | +$1.50 | 2 slices |
| Sausage | +$1.50 | 2 links |
| Egg | +$1.00 | 1 each (fried or scrambled) |
| Cheese | +$0.75 | 1 slice (cheddar default; swiss / american available) |
| Veggies | +$1.00 | Spinach, tomato, bell pepper mix |

Inventory depletion for customizable orders = base ingredients + selected add-ons, converted to purchase units via `usageUnits`.

### Example conversions

| Ingredient | Stocked as | Recipe uses | countPerInventoryUnit |
|------------|------------|-------------|------------------------|
| Bacon | lb | 2 slices | 16 slices / lb |
| Eggs | dozen | 1 each | 12 each / dozen |
| Sourdough | loaf | 2 slices | 20 slices / loaf |
| Whole milk | gallon | 8 oz (frappe) | 128 oz / gallon |
| Heavy cream | half gallon | 2 oz (frappe) | 64 oz / half gallon |
| Frothing milk | gallon | 2 oz (cappuccino foam) | 128 oz / gallon |
| Ice | lb | 6 oz (frappe) | 16 oz / lb |
| Cheddar | lb | 1 slice | 24 slices / lb |

### Signature sandwiches (3)

Fixed recipes — not customizable. Pre-linked ingredients for margin and reorder math.

| Signature | Base | Build | Price |
|-----------|------|-------|-------|
| **The Sunrise Stack** | Bagel | Bacon, fried egg, cheddar | $11.49 |
| **Garden Morning Croissant** | Croissant | Scrambled egg, swiss, spinach, tomato | $10.99 |
| **The Farmer's Double** | Bread | Bacon, sausage, fried egg, american cheese | $12.99 |

---

## Coffee

All four coffee drinks are **customizable** and available in **Small / Medium / Large**. Base price and recipe quantities are stored at **Medium (100%)**; sizes scale by `scalePercent`.

| Menu item | Base price (M) | Base recipe |
|-----------|----------------|-------------|
| Hot Coffee | $3.49 | Coffee beans |
| Frappe | $5.49 | Espresso, ice, heavy cream |
| Mocha | $5.99 | Espresso, mocha syrup |
| Cappuccino | $4.99 | Espresso, frothing milk (foam) |

### Sizes

| Size | scalePercent | Price multiplier | Example (Cappuccino $4.99) |
|------|--------------|------------------|----------------------------|
| Small | 75% | × 0.85 | $4.24 |
| **Medium** | **100%** | **× 1.0** | **$4.99** |
| Large | 125% | × 1.25 | $6.24 |

`qtyPerServing` on every link is the **medium** amount. Large frappe espresso: `2 oz × 125% = 2.5 oz`.

Items with `scalesWithSize: false` stay fixed: flavor shots (0.5 oz), whipped cream topping, tea bags.

### Milk options (pick one)

| Milk | Extra charge | Notes |
|------|--------------|-------|
| Whole milk | — | Default |
| Skim milk | — | |
| Oat milk | +$0.75 | |
| Almond milk | +$0.75 | |
| Soy milk | +$0.75 | |
| Half & half | +$0.50 | |
| No milk (black) | — | Hot Coffee only |

Milk quantity varies by drink and **scales with size** (e.g. 8 oz milk at medium frappe → 10 oz at large). Inventory depletes from the selected milk ingredient.

### Flavor shots (optional, pick one)

| Flavor | Extra charge | Syrup used |
|--------|--------------|------------|
| Vanilla | +$0.50 | Vanilla syrup |
| Caramel | +$0.50 | Caramel syrup |
| Hazelnut | +$0.50 | Hazelnut syrup |

Mocha already includes chocolate syrup; an extra flavor shot stacks on top (e.g. vanilla mocha).

### Coffee prep ingredients

Tracked separately from drink milk — used for blending, foam, and iced drinks:

| Ingredient | Stocked as | Used in | Per serving |
|------------|------------|---------|-------------|
| **Ice** | lb | Frappe | 6 oz (at medium) |
| **Heavy cream** | half gallon | Frappe (blended), optional whipped topping | 2 oz blend / 1.5 oz top |
| **Frothing milk** | gallon | Cappuccino foam (froth machine) | 2 oz foam (at medium) |

Cappuccino split: **2 oz** steamed milk (customer's milk choice) + **2 oz** frothing milk for foam.

Optional **whipped cream topping** (+$0.75) on coffee drinks — deducts from heavy cream.

---

## Tea

| Menu item | Base price (M) | Notes |
|-----------|----------------|-------|
| English Breakfast Tea | $3.29 | 1 tea bag any size (`scalesWithSize: false`) |
| Green Tea | $3.29 | 1 tea bag any size |

## Juice

| Menu item | Base price (M) | Base serving |
|-----------|----------------|--------------|
| Orange Juice | $4.49 | 12 oz at medium |
| Apple Juice | $4.29 | 12 oz at medium |
| Cranberry Juice | $4.49 | 12 oz at medium |

Large orange juice: `12 oz × 125% = 15 oz`.

---

## Inventory notes for demo

Ingredients with near-term expiry (good for chat / dashboard demos):

- **Spinach** — expires Jun 24 (specials prompt)
- **Sourdough bread** — expires Jun 25
- **Croissants** — expires Jun 26
- **Whole milk** — expires Jun 28
- **Oat milk** — expires Jul 2 (alt-milk reorder demo)
- **Hazelnut syrup** — low stock (1 bottle)

Slow mover candidate for margin chat: customize vs signature mix — track sales per `menu-items.json` when seeding sales receipts.

---

## Related

- [Product overview](./overview.md)
- [Kitchen Control](../pages/kitchen-control.md)
