# Sales_Order — data model

One row per **customer bill line** confirmed on Process. Tracks what was sold and when.

## Core fields

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `restaurantId` | ObjectId | Tenant scope |
| `dishName` | string | Normalized menu item name at time of sale |
| `dishId` | string | FK → `Dish_Inventory.dishId` / `MenuItem.slug` |
| `price` | number | Unit sell price from receipt |
| `quantity` | number | Items sold on this line |
| `lineTotal` | number | Optional: qty × price |
| `date` | Date | Receipt date or `createdAt` fallback |
| `billId` | ObjectId | FK → `BillUpload` (customer) |

## Example

```json
{
  "restaurantId": "…",
  "dishName": "Western Omelette",
  "dishId": "mi-western-omelette",
  "price": 14.00,
  "quantity": 2,
  "lineTotal": 28.00,
  "date": "2026-06-21T18:30:00.000Z",
  "billId": "…"
}
```

## Written by

**2b Dish Inventory Agent** on customer bill **Process** (`applyCustomerLineDeduction` + future dedicated `SalesOrder.create`).

## Used for

- `totalSold` / `totalRevenue` aggregates on Kitchen dish cards
- Sales trends (future dashboard)
- Inventory depletion audit (linked recipe deduction)

## Implementation status

Target collection `SalesOrder`. Today, sales data lives on `BillUpload.lines` and aggregated in `aggregateMenuSales()`; dedicated table migration planned.
