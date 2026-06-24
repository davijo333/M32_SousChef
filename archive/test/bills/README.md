# Test bills — Sunrise Diner

Sample **customer sales receipts** and **supplier wholesaler invoices** for bill-parser testing (Stage 2).

## Structure

```
test/bills/
├── manifest.json          # Coverage map — which bill covers which items/ingredients
├── generate-bills.py      # Regenerate all files
├── requirements.txt       # Pillow + reportlab
├── customer/              # 1.c_bill.pdf, 2.c_bill.png, … (8 files)
└── supplier/              # 1.s_bill.pdf, 2.s_bill.png, … (10 files)
```

## File naming

Each **logical** receipt/invoice is split into **two different files** (not the same bill twice):

| Pattern | Example | Content |
|---------|---------|---------|
| Odd PDF | `1.c_bill.pdf` | First half of receipt #1 |
| Even PNG | `2.c_bill.png` | Second half of receipt #1 |
| Next PDF | `3.c_bill.pdf` | First half of receipt #2 |
| … | `1.s_bill.pdf`, `2.s_bill.png`, … | Same pattern for supplier |

You can select **the whole `customer/` or `supplier/` folder** — all PDFs and PNGs upload as separate bills with unique names and different line items.

## Customer files (8)

| Files | Logical receipt |
|-------|-----------------|
| `1.c_bill.pdf`, `2.c_bill.png` | Breakfast sandwiches — morning shift |
| `3.c_bill.pdf`, `4.c_bill.png` | Coffee bar — specialty drinks |
| `5.c_bill.pdf`, `6.c_bill.png` | Tea, juice & café drinks |
| `7.c_bill.pdf`, `8.c_bill.png` | Afternoon — sandwiches & blended drinks |

## Supplier files (10)

| Files | Logical invoice |
|-------|-----------------|
| `1.s_bill.pdf`, `2.s_bill.png` | Sysco #4821 — bakery, proteins, cheese, produce |
| `3.s_bill.pdf`, `4.s_bill.png` | Sysco #4822 — dairy, coffee, syrups, ice |
| `5.s_bill.pdf`, `6.s_bill.png` | Costco — tea, juice & pantry |
| `7.s_bill.pdf`, `8.s_bill.png` | US Foods #77102 — proteins & dairy |
| `9.s_bill.pdf`, `10.s_bill.png` | Sysco #4823 — mixed restock |

## Regenerate

```bash
cd test/bills
python3 -m pip install -r requirements.txt
python3 generate-bills.py
```

## Usage in app

- Upload the whole `customer/` or `supplier/` folder (mixed PDF + PNG is fine).
- Bill Parser agent (1a) extracts line items; see `manifest.json` for coverage.

## Related

- [test/README.md](../README.md) — menu + ingredient seed data
- [docs/pages/upload-bills.md](../../docs/pages/upload-bills.md)
