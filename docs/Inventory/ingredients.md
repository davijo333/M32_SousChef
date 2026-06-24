# Ingredients

A **ingredient** is a pantry SKU: what you buy on purchase orders and consume in dish and add-on recipes.

## Kitchen Control (manual add)

Typical fields you enter in **+ Ingredient**:

| Field | Example |
|-------|---------|
| Name | `Multigrain Bagels` |
| Category | `Bakery` |
| Brand | `Thomas'` |
| Inventory unit | `dozen` |

After first **Save**, the item appears in Pantry immediately. Use **Generate Image** for catalog photos, then **Save** again.

## Runtime fields (MongoDB)

| Field | Description |
|-------|-------------|
| `slug` | Stable id, e.g. `ing-multigrain-bagel` |
| `sku` | Brand + name + unit identity (auto on PO ingest) |
| `name` | Display name |
| `category` | Pantry group — `bakery`, `dairy`, `protein`, `produce`, `coffee`, `tea`, `juice`, `syrup`, `misc` |
| `brandName` | Product brand |
| `inventoryUnit` | How stock is counted (`lb`, `dozen`, `gallon`, …) |
| `currentQty` | On-hand quantity |
| `reorderThreshold` | Low-stock alert level |
| `label` | `new` \| `used` \| `unused` \| `missing` (after recipe linker runs) |
| `source` | `seed`, `bill_upload`, `manual_add`, … |
| `imageGenerationAttempted` | Must be true to show in Pantry list |

## Sample entries (like manual / demo seed)

These match [`test/inventory/ingredients.json`](../../test/inventory/ingredients.json):

```json
{
  "slug": "ing-multigrain-bagel",
  "name": "Multigrain Bagels",
  "brand": "Thomas'",
  "inventoryUnit": "dozen",
  "category": "bakery",
  "currentQty": 7,
  "reorderThreshold": 3,
  "lastPurchasePrice": 7.1
}
```

```json
{
  "slug": "ing-bacon",
  "name": "Applewood Smoked Bacon",
  "brand": "Tyson",
  "inventoryUnit": "lb",
  "category": "protein",
  "currentQty": 2,
  "reorderThreshold": 4,
  "lastPurchasePrice": 6.49
}
```

```json
{
  "slug": "ing-spinach",
  "name": "Organic Baby Spinach",
  "brand": "Earthbound Farm",
  "inventoryUnit": "lb",
  "category": "produce",
  "currentQty": 3,
  "reorderThreshold": 2,
  "lastPurchasePrice": 2.7,
  "expiryDate": "2026-06-25"
}
```

```json
{
  "slug": "ing-espresso",
  "name": "Super Crema Espresso Beans",
  "brand": "Lavazza",
  "inventoryUnit": "lb",
  "category": "coffee"
}
```

## Purchase order ingest

Supplier bill lines create or update ingredients with `category` inferred from the invoice text (e.g. “Thomas' Multigrain Bagels” → `bakery`). Brand names on PO lines align with `brandName` for image search.

## Categories in test data

| Category | Examples |
|----------|----------|
| bakery | Croissant, Plain Bagels, Multigrain Bagels, Sourdough Loaf |
| protein | Bacon, Sausage, Eggs |
| dairy | Cheddar, American, Whole Milk, Heavy Cream |
| produce | Spinach, Roma Tomato, Avocado |
| coffee | Pike Place Beans, Lavazza Espresso |
| tea | English Breakfast, Green Tea |
| juice | Orange, Apple, Cranberry |
| syrup | Monin Vanilla, Caramel, Mocha |
