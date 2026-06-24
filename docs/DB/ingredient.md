# Ingredient

**Model:** `apps/web/src/models/Ingredient.ts`  
**Collection:** `ingredients`

One row per pantry item per restaurant.

## Fields

| Field | Type | Notes |
|-------|------|-------|
| `restaurantId` | ObjectId | Tenant |
| `slug` | string | Unique per restaurant; shown as internal UID |
| `sku` | string? | Stable id: `{brand}-{name}-{packQty}-{unit}` |
| `name` | string | Display name |
| `brandName` | string? | Product brand (manufacturer on package) |
| `category` | string | e.g. `misc` |
| `inventoryUnit` | string | dozen, lb, each, … |
| `currentQty` | number | On-hand stock |
| `reorderThreshold` | number | Low-stock alert |
| `lastPurchasePrice` | number? | Last ordered unit price |
| `lastOrderedQty` | number? | Qty from last matching bill line |
| `imageUrl` | string? | Selected default image (public URL) |
| `imageR2Key` | string? | R2 object key for default image |
| `imageCandidates` | array? | Up to 2 `{ url, label?, source?, score?, r2Key? }` |
| `selectedImageIndex` | number | Index into `imageCandidates` (default `0`) |
| `imageGenerationAttempted` | boolean | `true` after Process enrichment or manual Generate; required for Pantry listing |
| `source` | string | `bill_upload`, `manual_add`, `seed`, … |
| `usageUnits` | array | Unit conversion helpers |

## Pantry visibility

`GET /api/kitchen` returns only ingredients where `imageGenerationAttempted === true`. New bill lines are ingested on Process, but stay hidden until the agent image step runs (even if no photos are found).

## Written by

- `ingestSupplierLine` on bill **Process**
- `POST /api/catalog/ingredients` (manual add)
- `PATCH /api/catalog/ingredients/[slug]` (Kitchen modal)

## Indexes

- Unique: `{ restaurantId, slug }`
- Unique: `{ restaurantId, sku }` (sparse)

## Deduplication

On Process and manual add, ingredients match by **SKU** first, then brand + name + unit. Existing rows get **qty added** instead of creating duplicates.
