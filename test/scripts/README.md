# Test scripts

## Generate bill fixtures

Creates PDF/PNG purchase and sales order files under `test/bills/` from [`test/inventory/`](../inventory/) JSON (dishes, add-ons, ingredients, purchase-orders, sales-orders).

Bill **dates** are stamped at generation time: `billDay` 0 = today through `billDay` 7 = today − 7 days (see [inventory README](../inventory/README.md#date-windows-relative-to-load--generate-day)).

```bash
python3 -m pip install -r test/scripts/requirements.txt
python3 test/scripts/recalculate-pricing.py   # refresh food cost + sell prices from PO data
npm run regenerate:bills
```

(Equivalent: `python3 test/scripts/generate-bills.py` from repo root.)

`recalculate-pricing.py` also normalizes dish classifications (e.g. `BYO-Sandwich` → `byo-sandwich`).

### Output

| Folder | Count | Naming |
|--------|-------|--------|
| `test/bills/supplier/` | 18 files | `Bill-N_Vendor.pdf` / `.png` pairs |
| `test/bills/customer/` | 16 files | `N.c_bill.pdf` / `.png` pairs |

Purchase order lines use **real brand/product names** (Tyson, Land O Lakes, Monin, etc.) for image search, with **bulk quantities** so inventory remains after customer bills are processed.

**Authoritative list:** [`test/bills/manifest.json`](../bills/manifest.json) — filenames, vendors, dates, and ingredient/dish coverage per file.
