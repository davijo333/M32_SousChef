# 1a — Supplier Bill Parser

**Stage 1a** · Wholesale / supplier invoices

Vision parser for **supplier bills only**. Accepts **PDF** or **PNG/JPEG**.

## Purpose

Extract ingredient purchase lines from wholesaler invoices (Sysco, Costco, US Foods, etc.).

## When it runs

- User uploads on [Upload Bills → Suppliers](../../pages/upload-bills.md)
- `POST /parse-supplier-bill` or `POST /parse-bill-pipeline` with `bill_type=supplier`
- Up to **5 files** parsed concurrently per batch

## Two-phase parse (parallel)

| Phase | Output |
|-------|--------|
| **Quick scan** | Line `rawName` list — fast |
| **Detail parse** | qty, unit, unitPrice, lineTotal, vendor, invoice metadata |

While detail parse runs, the orchestrator dedupes quick-scan names and passes the unique ingredient list to **2a Ingredient Normalizer** (names + 2 images per line).

## Input formats

| Format | Handling |
|--------|----------|
| PDF | First page rendered to PNG (`bill_parser_common.load_bill_image`) |
| PNG / JPEG | Direct vision input |

Filename convention: `.s_bill.` in name (upload zone validation).

## Output

`ParsedBill` with `suggestedCategory: "ingredient"` on every line, plus pipeline `enriched[]` for **2a**:

```json
{
  "key": "ingredient-large-eggs",
  "normalized_name": "Large Eggs",
  "images": [{ "url": "…", "score": 0.9 }, { "url": "…", "score": 0.7 }]
}
```

## Does not do

- Write to database (→ **2a** after user **Process**)
- Customer receipts (→ **1b**)
- Recipe or dish logic (→ **2b**)

## Code

- `services/agent/supplier_bill_parser.py`
- `services/agent/bill_pipeline.py` → `run_supplier_pipeline`
