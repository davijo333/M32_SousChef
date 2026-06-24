# 2a — Ingredient Normalizer

**Stage 2a** · Ingredient catalog + purchase history

Takes each **supplier-parsed ingredient line**, resolves it against the restaurant database, enriches new items, and updates **Kitchen** ingredient view.

## Purpose

Supplier text is messy (`CHKN BRST 5LB`, `LG EGGS 15DZ`). **2a** produces consistent names, photos, and purchase records before stock quantities are applied.

## When it runs

- **During supplier bill pipeline** — immediately after **1a** quick scan (parallel with detail parse)
- On **Process** — upsert ingredient rows, persist images, write **Purchase_Order**, bump `currentQty`
- Post-save via `POST /prepare-catalog-batch` for any lines not enriched during parse

## Flow

```
For each parsed supplier line:
  1. Normalize name (abbrev expand, title case, strip SKU noise)
  2. Search Ingredient collection by slug / fuzzy name
  3. If EXISTS → update last price, qty on Process; add image if missing
  4. If NEW    → create Ingredient row
                 → find 2 product images (web search)
                 → persist best image to R2 (S3-compatible storage)
                 → set imageUrl default path in DB
  5. Write Purchase_Order row (date, price, ingredient name)
  6. Kitchen View refreshes ingredient cards
```

## Input

| Field | Source |
|-------|--------|
| Parsed lines | **1a** output |
| `restaurantId` | Session |
| Existing ingredients | MongoDB `Ingredient` collection |
| Enrichment cache | Bill `pipelineEnriched[]` from parse |

## Output

| Target | Fields |
|--------|--------|
| **Ingredient** | `name`, `slug`, `currentQty`, `inventoryUnit`, `imageUrl`, `imageR2Key`, `lastPurchasePrice` |
| **Purchase_Order** | `date`, `price`, `ingredientName` (+ `restaurantId`, `billId`, `qty`, `unit`) |
| **Kitchen UI** | Ingredient cards with default photo and stock subtitle |

Two images are fetched per item; the highest-scored URL is stored as the default. The second remains available in the review UI before Process.

## Responsibilities

1. **Name normalization** — expand abbreviations, map units (`dz` → `dozen`).
2. **Entity resolution** — fuzzy match existing pantry (>85% → update, not duplicate).
3. **Image pipeline** — 2 candidates → R2 persist → `imageUrl` on Ingredient.
4. **Purchase history** — append **Purchase_Order** per confirmed supplier line.
5. **Stock math** — deterministic qty add on Process (`kitchen-inventory.ts`).

## Does not do

- Parse bill images (→ **1a**)
- Menu items or recipes (→ **2b**)
- Overwrite fields with `manual_override: true`

## Code (current)

| Layer | Path |
|-------|------|
| Agent enrich | `services/agent/item_normalizer.py`, `image_suggestions.py` |
| Web ingest | `apps/web/src/lib/kitchen-inventory.ts` |
| Image persist | `apps/web/src/lib/r2-storage.ts`, `ingredient-enrichment.ts` |

## Related

- [Purchase_Order table](../../db/purchase-order.md)
- [Ingredients model](../../db/ingredients.md)
