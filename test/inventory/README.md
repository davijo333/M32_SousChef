# Test inventory (Panera Cafe)

Canonical catalog for **test purchase orders** and **test sales orders**. The bill generator (`test/scripts/generate-bills.py`) reads these files so PO/SO line text stays in sync with dishes, add-ons, and ingredients.

| File | Purpose |
|------|---------|
| [dishes.json](./dishes.json) | Menu dishes with `classification`, `posName`, `ingredientSlugs` |
| [add-ons.json](./add-ons.json) | POS modifiers with `classification`, `description`, `linkedDishClassifications` |
| [ingredients.json](./ingredients.json) | Pantry items (brand names appear on supplier invoices) |
| [purchase-orders.json](./purchase-orders.json) | Five wholesaler invoices → `test/bills/supplier/` |
| [sales-orders.json](./sales-orders.json) | Four POS receipts → `test/bills/customer/` |

## PO → supplier bills

| Bill files | Source PO | Vendor |
|------------|-----------|--------|
| Bill-1, Bill-2 | SYSCO-4821 | Sysco |
| Bill-3, Bill-4 | SYSCO-4822 | Sysco |
| Bill-5, Bill-6 | COSTCO-90614 | Costco |
| Bill-7, Bill-8 | USF-77102 | US Foods |
| Bill-9, Bill-10 | SYSCO-4823 | Sysco |

Each logical invoice is split into a PDF half and a PNG half.

## SO → customer bills

| Files | Source SO |
|-------|-----------|
| `1.c_bill.pdf`, `2.c_bill.png` | SQ-20260622-AM |
| `3.c_bill.pdf`, `4.c_bill.png` | SQ-20260622-COF |
| `5.c_bill.pdf`, `6.c_bill.png` | TST-20260622-BEV |
| `7.c_bill.pdf`, `8.c_bill.png` | SQ-20260623-MIX |

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
