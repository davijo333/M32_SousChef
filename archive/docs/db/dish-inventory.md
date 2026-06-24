# Dish_Inventory — data model

Menu catalog row for each sellable dish. User-facing label: **menu item**. Maps to MongoDB `MenuItem` today.

## Core fields

| Field | Type | Notes |
|-------|------|-------|
| `dishId` | string | Stable slug, e.g. `mi-western-omelette` |
| `dishName` | string | Display name |
| `price` | number | Current sell price |
| `isAddon` | boolean | `true` for add-on items (extra bacon, milk upgrade) |
| `available` | boolean | Can be made from **current Ingredient** stock given active recipe |
| `imageUrl` | string | Default photo (R2 path) |
| `ingredientLinks` | array | Active recipe — ingredient slug, qty, unit per serving |
| `addonsEnabled` | boolean | Customer can select add-ons |
| `restaurantId` | ObjectId | Tenant scope |

## Example

```json
{
  "dishId": "mi-garden-morning",
  "dishName": "Garden Morning Croissant",
  "price": 12.50,
  "isAddon": false,
  "available": true,
  "imageUrl": "/api/r2/dishes/…/image.jpg",
  "ingredientLinks": [
    { "ingredientSlug": "ing-croissant", "qtyPerServing": 1, "unit": "each" },
    { "ingredientSlug": "ing-egg", "qtyPerServing": 2, "unit": "each" }
  ],
  "addonsEnabled": true
}
```

## Available computation

```
available = ∀ link in ingredientLinks:
  ingredient.currentQty >= usageToInventory(link.qtyPerServing, link.unit)
```

Recomputed after supplier **Process**, customer **Process**, or manual stock edit.

## Written by

**2b Dish Inventory Agent** when:

- Customer bill parsed (new dish)
- User adds dish from Kitchen review
- **Link recipes** batch job

## Related

- [Sales_Order](./sales-order.md) — individual sale lines
- [Ingredients](./ingredients.md) — pantry stock
- [2b Dish Inventory Agent](../agents/2b-dish-inventory/README.md)
