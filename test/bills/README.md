# Test bills

Generated fixtures for upload/parse testing under `customer/` and `supplier/`.

Regenerate with:

```bash
python3 -m pip install -r test/scripts/requirements.txt
python3 test/scripts/recalculate-pricing.py   # optional
npm run regenerate:bills
```

| Folder | Files | Purpose |
|--------|-------|---------|
| `supplier/` | 18 | Wholesaler invoices (PDF + PNG pairs) |
| `customer/` | 16 | POS receipts (PDF + PNG pairs) |

See [`manifest.json`](./manifest.json) for coverage per file and [`test/scripts/README.md`](../scripts/README.md) for vendor mapping.
