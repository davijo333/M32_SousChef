# Purchase_Order — data model

One row per **supplier bill line** confirmed on Process. Tracks purchase history for costing and audit.

## Core fields

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `restaurantId` | ObjectId | Tenant scope |
| `ingredientName` | string | Normalized display name at time of purchase |
| `ingredientSlug` | string | FK → `Ingredient.slug` |
| `price` | number | Unit price from bill line |
| `quantity` | number | Qty purchased |
| `unit` | string | dozen, lb, each, … |
| `lineTotal` | number | Optional: qty × price |
| `date` | Date | Bill date or `createdAt` fallback |
| `billId` | ObjectId | FK → `BillUpload` (supplier) |
| `vendor` | string | Optional wholesaler name |

## Example

```json
{
  "restaurantId": "…",
  "ingredientName": "Large Eggs",
  "ingredientSlug": "ing-large-eggs",
  "price": 3.10,
  "quantity": 5,
  "unit": "dozen",
  "lineTotal": 15.50,
  "date": "2026-06-20T00:00:00.000Z",
  "billId": "…",
  "vendor": "Sysco Food Services"
}
```

## Written by

**2a Ingredient Normalizer** on supplier bill **Process** (`ingestSupplierLine` → future dedicated `PurchaseOrder.create`).

## Used for

- Last purchase price on Ingredient (`lastPurchasePrice`)
- Food cost trends and supplier comparison (future dashboard)
- Audit trail per bill line

## Implementation status

Target collection `PurchaseOrder`. Today, purchase data lives on `BillUpload.lines` and `Ingredient.lastPurchasePrice`; dedicated table migration planned.
