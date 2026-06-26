# 2a — Item Normalizer

**File:** `backend/agent-service-v1/workers/item_normalizer.py`

Runs inside `/parse-bill-pipeline` for each new ingredient line on a **purchase order**.

## Per-line enrichment

| Field | Description |
|-------|-------------|
| `key` | Stable id matching web `ingredient-{normalized-raw-name}` |
| `normalized_name` | Clean display name (abbrev expansion, title case) |
| `sku` | `{brand}-{name}-{packQty}-{unit}` e.g. `sysco-large-eggs-1-dz` |
| `images` | **Two** static product photos — see [image-suggestions.md](./image-suggestions.md) |

## Web persistence

On **Process**, `ingestSupplierLine` matches by SKU / brand+name+unit and **updates existing inventory** when the same product is found (no duplicate rows).

- `Ingredient.sku`, `imageCandidates[]` (up to 2, R2-backed)
- `lastPurchasePrice`, `lastOrderedQty` from order line
- Default card image from `selectedImageIndex` (default `0`)

User can change default image in Kitchen Control modal → `PATCH /api/catalog/ingredients/[slug]`.

## Sales orders

**Sales order** parsing uses `billType: "customer"`. Customer bill fixtures use `.c_bill.` in the filename (e.g. `3.c_bill.pdf`).
