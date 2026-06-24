# Inventory Agent — Tools

**Role:** Pantry manager — stock, expiry, reorder, **purchase bill** queue.

**Direct mode:** User selected Inventory tab — full tool loop, no Sous Chef.

**Consult mode:** Sous Chef calls `consult_inventory`; same tools, internal transcript.

**Upload ownership:** Purchase orders (`billType: supplier`) hand off here after Sous Chef classify. Files appear on **Upload orders → Purchase orders** only — not in Sous Chef chat.

---

## Read tools

| Tool | Args | Returns | Existing code |
|------|------|---------|---------------|
| `get_pantry_summary` | — | Totals by category | `buildInventoryChatContext` |
| `get_low_stock` | `limit?` | Below reorder threshold | `isIngredientRequired`, `Ingredient` |
| `get_expiring_ingredients` | `withinDays?` (default 7) | Name, qty, unit, expiry | `isIngredientExpiring` |
| `search_ingredient` | `query` | Matching slugs, names | `Ingredient.find` |
| `get_ingredient_detail` | `slug` | Full row | `Ingredient` |
| `get_ingredients_by_category` | `category` | List in category | `Ingredient` |
| `get_unused_ingredients` | — | label `unused` | `ingredient-labels` |
| `get_last_purchase_date` | `slug?` | Last PO date | `ingredient-purchase-stats` |
| `list_recent_purchase_orders` | `limit?` | PO headers | `PurchaseOrder` |

---

## Purchase bill queue (after chat handoff)

| Tool | Args | Effect |
|------|------|--------|
| `get_purchase_parse_queue` | — | Pending `supplier` bills from `BillUpload` / session |
| `get_purchase_bill_summary` | `billId` | Vendor, lines, new ingredients |
| `summarize_new_ingredients_from_bills` | `billIds?` | Catalog review preview |

Files are **not** re-attached in chat — agent references `billId` / filename; UI on Upload orders.

---

## Write tools (confirm required)

| Tool | Args | Effect | Confirm |
|------|------|--------|---------|
| `update_reorder_threshold` | `slug`, `reorderThreshold` | Patch ingredient | Yes |
| `process_purchase_bills` | `billIds?` | Wraps `/api/bills/confirm` supplier | Yes |

**Phase 2:** avoid direct `currentQty` edits (bill-driven inventory).

---

## Cross-domain requests

| Tool | Args | Behavior |
|------|------|----------|
| `request_business_context` | `question` | Via Sous Chef — e.g. "do low items sell well?" |
| `request_creative_context` | `question` | Via Sous Chef — "what to make with X" |

Wrong-domain nudge: *"For margins, switch to Business or ask Sous Chef."*

---

## Cannot use

- `add_suggested_dish`
- `process_sales_bills`
- `handoff_*` (Sous Chef only)

---

## MVP tools (Inventory)

1. `get_low_stock`, `get_expiring_ingredients`, `search_ingredient`
2. `get_pantry_summary`, `get_purchase_parse_queue`
3. `get_purchase_bill_summary`
4. `process_purchase_bills` (with confirm)

---

## Demo queries

- "What's low stock?"
- "What expires in 3 days?"
- "Status of the Sysco bill I uploaded?"
- "Process the purchase orders" (**Confirm**)
