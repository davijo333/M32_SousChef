# Dishes

A **dish** is a sellable menu item: sandwiches, coffee drinks, tea, juice, and custom classes you define in Kitchen Control.

## Kitchen Control (manual add)

Typical fields you enter in **+ Dish**:

| Field | Example |
|-------|---------|
| Name | `Multigrain Bagel` |
| Class | `BYO-Sandwich` (preset or custom class) |
| Description | `Thomas' multigrain bagel — build your own toppings` |
| Sell price | `4.99` |
| Ingredient links | `Multigrain Bagels` → 1 each |

Use **Generate Image** → **Save**. Description drives image context together with name and class.

## Runtime fields (MongoDB)

| Field | Description |
|-------|-------------|
| `slug` | Stable id, e.g. `dish-multigrain-bagel` |
| `name` | Display name |
| `classification` | Menu class — `sandwich`, `BYO-Sandwich`, `coffee`, `tea`, `juice`, or custom |
| `category` | Same as `classification` for grouping |
| `description` | POS / image context |
| `sellPrice` | Unit price |
| `ingredientLinks[]` | Recipe lines (`ingredientSlug`, `qtyPerServing`, `unit`) |
| `recipeStatus` | `new` \| `active` \| `inactive` \| `suggested` |
| `source` | `seed`, `bill_upload`, `manual_add`, … |

## Sample entries (like manual add)

### BYO-Sandwich class (custom menu group)

```json
{
  "slug": "dish-classic-bagel",
  "name": "Classic Bagel",
  "classification": "BYO-Sandwich",
  "description": "Plain Thomas' bagel — build your own toppings",
  "sellPrice": 4.49,
  "posName": "Classic Bagel — Thomas' Plain",
  "ingredientSlugs": ["ing-bagel"]
}
```

```json
{
  "slug": "dish-multigrain-bagel",
  "name": "Multigrain Bagel",
  "classification": "BYO-Sandwich",
  "description": "Thomas' multigrain bagel — build your own toppings",
  "sellPrice": 4.99,
  "posName": "Multigrain Bagel — Thomas' 12 Grain",
  "ingredientSlugs": ["ing-multigrain-bagel"]
}
```

### Signature sandwich

```json
{
  "slug": "dish-sunrise-stack",
  "name": "The Sunrise Stack",
  "classification": "sandwich",
  "sellPrice": 11.49,
  "posName": "Sunrise Stack™ — Tyson Bacon, Eggland's Egg, Tillamook Cheddar on Vie de France Croissant",
  "ingredientSlugs": ["ing-croissant", "ing-bacon", "ing-egg", "ing-cheddar", "ing-bagel", "ing-butter"]
}
```

### Coffee drink

```json
{
  "slug": "dish-hazelnut-mocha",
  "name": "Hazelnut Mocha",
  "classification": "coffee",
  "sellPrice": 6.49,
  "posName": "Monin Dark Chocolate Mocha 16oz — Whole Milk + Monin Hazelnut",
  "ingredientSlugs": ["ing-espresso", "ing-mocha-syrup", "ing-whole-milk", "ing-hazelnut-syrup"]
}
```

## Classifications in test data

| Classification | Example dishes |
|----------------|----------------|
| sandwich | Sunrise Stack, Build-Your-Own Croissant, Loaded Bagel |
| BYO-Sandwich | Classic Bagel, Multigrain Bagel |
| coffee | Hot Coffee, Hazelnut Mocha, Oat Vanilla Coffee |
| tea | English Breakfast Tea, Green Tea |
| juice | Orange Juice, Cranberry Juice |

On the **Menu** tab, beverages group under **Beverages** with subclass `coffee`, `tea`, or `juice`.

## Sales order ingest

POS lines create or update dishes with `classification` and `description` from the parser (or inferred from line text). `posName` in [`test/inventory/dishes.json`](../../test/inventory/dishes.json) is the receipt text used in generated customer bills.

## Retirement

Set **Inactive** on the Recipes page when a dish leaves the menu but you want history. Inactive dishes may reappear as **Suggested** when the Recipe Agent proposes an update.
