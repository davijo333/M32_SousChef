# PurchaseOrder

**Model:** `apps/web/src/models/PurchaseOrder.ts`  
**Collection:** `purchaseorders`

One document per **uploaded purchase order** (linked 1:1 to `BillUpload`).

## Fields

| Field | Type | Notes |
|-------|------|-------|
| `restaurantId` | ObjectId | Tenant |
| `userId` | ObjectId | Uploader |
| `billUploadId` | ObjectId | FK → BillUpload (unique) |
| `poId` | string | e.g. `PO-20260623-A1B2C3` |
| `filename` | string | Original upload filename |
| `storeName` | string? | Wholesaler / store name (from parsed order) |
| `vendor` | string? | Same as storeName (legacy alias) |
| `purchaseDate` | Date? | **Purchase date from bill** (`billDate`) |
| `uploadDate` | Date | When bill was uploaded |
| `status` | string | `parsed` (after upload) → `processed` (after Process) |
| `items` | array | Line items (see below) |

### Item shape

```json
{
  "name": "Large Eggs",
  "price": 3.10,
  "qty": 5,
  "unit": "dozen",
  "ingredientSlug": "ing-large-eggs"
}
```

## Lifecycle

1. **Upload / parse** — `upsertPurchaseOrderFromBill(..., "parsed")` in `POST /api/bills/parse`
2. **Process** — re-upsert with `status: processed` and updated `ingredientSlug` on items in `ingestBill`

**Lib:** `apps/web/src/lib/purchase-order.ts`

## Indexes

- Unique: `{ restaurantId, poId }`
- Unique: `{ billUploadId }`
