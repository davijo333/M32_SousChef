# Test scripts

## Generate bill fixtures

Creates PDF/PNG purchase and sales order files under `test/bills/` from [`test/inventory/`](../inventory/) JSON (dishes, add-ons, ingredients, purchase-orders, sales-orders).

Bill **dates** are stamped at generation time: `billDay` 0 = today through `billDay` 7 = today − 7 days (see [inventory README](../inventory/README.md#date-windows-relative-to-load--generate-day)).

```bash
python3 -m pip install -r test/scripts/requirements.txt
python3 test/scripts/generate-bills.py
```

### Supplier files (10)

| Files | Invoice |
|-------|---------|
| `Bill-1_Sysco.pdf`, `Bill-2_Sysco.png` | Sysco #4821 — bakery, proteins, cheese, produce |
| `Bill-3_Sysco.pdf`, `Bill-4_Sysco.png` | Sysco #4822 — dairy, coffee, syrups, ice |
| `Bill-5_Costco.pdf`, `Bill-6_Costco.png` | Costco #90614 — tea, juice & pantry |
| `Bill-7_US-Foods.pdf`, `Bill-8_US-Foods.png` | US Foods #77102 — proteins & dairy |
| `Bill-9_Sysco.pdf`, `Bill-10_Sysco.png` | Sysco #4823 — mixed restock |

Purchase order lines use **real brand/product names** (Tyson, Land O Lakes, Monin, etc.) for image search, with **bulk quantities** so inventory remains after customer bills are processed.

Customer files use `N.c_bill.pdf` / `N.c_bill.png` naming (8 files).

See `test/bills/manifest.json` for ingredient/dish coverage.
