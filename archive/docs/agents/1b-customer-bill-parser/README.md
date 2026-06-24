# 1b — Customer Bill Parser

**Stage 1b** · POS / customer sales receipts

Vision parser for **customer sales receipts** only. Accepts **PDF** or **PNG/JPEG**.

## Purpose

Extract menu items sold from Square, Toast, Clover-style tickets. Feeds **2b Dish Inventory** while detail parse finishes.

## When it runs

- After supplier bills are processed, user uploads on [Upload Bills → Customer](../../pages/upload-bills.md)
- `POST /parse-customer-bill` or `POST /parse-bill-pipeline` with `bill_type=customer`
- Optional `pantry_json` + `addon_slugs_json` for recipe linking against current inventory

## Two-phase parse (parallel)

| Phase | Output |
|-------|--------|
| **Quick scan** | Dish names sold — fast |
| **Detail parse** | Quantities, prices, receipt date, metadata |

While detail parse runs:

1. Dedupe quick-scan names → unique dish list
2. Pass dishes to **2b Dish Inventory** (match/create, recipe research, images)

## Input formats

| Format | Handling |
|--------|----------|
| PDF | First page → PNG |
| PNG / JPEG | Direct vision input |

Filename convention: `.c_bill.` in name.

## Output

`ParsedBill` with `suggestedCategory: "menu_item"` on every line, plus `enriched[]` rows for Kitchen review cards (2 images, default selected).

## Does not do

- Supplier invoices (→ **1a**)
- Persist sales or deduct stock (→ **2b** + Process on web)
- Ingredient normalization (→ **2a** on supplier path only)

## Code

- `services/agent/customer_bill_parser.py`
- `services/agent/bill_pipeline.py` → `run_customer_pipeline`
