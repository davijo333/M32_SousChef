# Test inventory (Panera Cafe)

Canonical catalog for **test purchase orders** and **test sales orders**. The bill generator (`test/scripts/generate-bills.py`) reads these files so PO/SO line text stays in sync with dishes, add-ons, and ingredients.

| File | Purpose |
|------|---------|
| [dishes.json](./dishes.json) | Menu dishes with `classification`, `posName`, `ingredientSlugs` |
| [add-ons.json](./add-ons.json) | POS modifiers with `classification`, `description`, `linkedDishClassifications` |
| [ingredients.json](./ingredients.json) | Pantry items (brand names appear on supplier invoices) |
| [purchase-orders.json](./purchase-orders.json) | Wholesaler invoices → `test/bills/supplier/` |
| [sales-orders.json](./sales-orders.json) | Eight POS receipts → `test/bills/customer/` |

## PO → supplier bills

Five bill-generation POs (`SYSCO-4821` … `SYSCO-4823`) produce **18 supplier files** (PDF + PNG pairs per logical invoice).

See [`test/bills/manifest.json`](../bills/manifest.json) for `Bill-N_Vendor` mapping and line coverage.

## SO → customer bills

Each logical POS receipt is split into a PDF half and a PNG half (`1.c_bill.pdf` / `2.c_bill.png`, …). **16 customer files** cover eight sales orders in `sales-orders.json`.

See [`test/bills/manifest.json`](../bills/manifest.json) for the current file list, dates, and dish coverage per bill.

Regenerate bills after editing inventory:

```bash
python3 test/scripts/recalculate-pricing.py   # cost + margin → dish/add-on sell prices
python3 test/scripts/generate-bills.py
```

**Load test data** also builds **Recipe** documents (recipe number, food cost, margin, sell price) from `ingredientLinks` and wholesale `lastPurchasePrice`.

## Dashboard demo seed

**Load Panera Cafe demo** on the dashboard (`POST /api/seed`) reads the same files and inserts:

- **Ingredients** → `Ingredient` collection (with `currentQty`, `category`, `imageGenerationAttempted`)
- **Dishes** → `Dish` collection (`classification`, `description`, ingredient links)
- **Add-ons** → `AddOn` collection (`classification`, `linkedDishSlugs` from `linkedDishClassifications`)

Use `POST /api/seed?force=1` to replace an existing demo catalog.

## Date windows (relative to load / generate day)

All catalog content (dishes, ingredients, lines, prices) is stable in JSON. Only **dates** are computed at runtime:

| Flow | Range | JSON field |
|------|--------|------------|
| **Load test data** (`POST /api/seed`) — sales & purchase orders in MongoDB | **today − 37d** → **today − 7d** | `seedDay` 0…30 on `sales-orders.json` / `purchase-orders.json` |
| **Generate bills** (`python3 test/scripts/generate-bills.py`) — PDF/PNG fixtures | **today − 7d** → **today** | `billDay` 0…7 on the same order files |
| Ingredient expiry (seed) | **today + N days** | `expiryDaysFromNow` on `ingredients.json` |

`seedDay` 0 = oldest order (37 days ago); `seedDay` 30 = newest seeded order (7 days ago).  
`billDay` 0 = today; `billDay` 7 = seven days ago.
