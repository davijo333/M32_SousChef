# Business Agent — Tools

**Role:** Restaurant analyst — POS sales, COGS, margins, supplier purchases. Never confuse bulk PO spend with per-ticket food cost.

**Context:** Respect `financeView`: `week` (5 weeks) | `month` (2 months) from chat UI.

**Upload ownership:** Sales orders (`billType: customer`) hand off here after Sous Chef classify. Files on **Upload orders → Sales orders** only.

---

## Read tools

| Tool | Args | Returns | Existing code |
|------|------|---------|---------------|
| `get_finance_summary` | `financeView?` | Sales, purchases, gross profit | `computeFinanceSummary` |
| `get_sales_timeline` | `financeView?` | Period buckets | `buildFinanceTimeline` |
| `get_top_selling_dishes` | `limit?`, `classFilter?` | Ranked dishes | `buildTopSellingDishes` |
| `get_top_used_ingredients` | `limit?` | By sales usage | `buildTopUsedIngredients` |
| `get_dish_margin_rankings` | `view`: highest \| lowest | Margin $ and % | `buildDishMarginRankings` |
| `get_ingredient_profit_rankings` | `limit?` | Profit contribution | `buildIngredientProfitRankings` |
| `get_dish_margin` | `dishSlug` | foodCost, sellPrice, margin | `Recipe` + `Dish` |
| `list_active_menu_prices` | — | Active dishes + sellPrice | `Dish` |
| `get_recent_sales_orders` | `limit?` | Processed POS tickets | `SalesOrder` |
| `get_recent_purchase_orders` | `limit?` | Supplier bills (context) | `PurchaseOrder` |
| `compare_sales_vs_purchases` | `financeView?` | Side-by-side | business chat context |

---

## Sales bill queue (after chat handoff)

| Tool | Args | Effect |
|------|------|--------|
| `get_sales_parse_queue` | — | Pending `customer` bills |
| `get_sales_bill_summary` | `billId` | Ticket lines, new dishes/add-ons |
| `check_purchase_processed_prerequisite` | — | Warn if supplier bills not processed |

---

## Write tools

| Tool | Args | Effect | Confirm |
|------|------|--------|---------|
| `process_sales_bills` | `billIds?` | `/api/bills/confirm` customer | Yes |
| `suggest_price_change` | `dishSlug`, `proposedPrice`, `rationale` | Recommendation only — no auto-write | N/A |

**Phase 2:** `export_margin_report` (markdown/CSV).

---

## Cross-domain requests

| Tool | Args | Behavior |
|------|------|----------|
| `request_inventory_context` | `question` | Low stock on top sellers |
| `request_creative_context` | `question` | Promote underperforming categories |

---

## Cannot use

- `add_suggested_dish`
- `process_purchase_bills` (Inventory)
- `handoff_*`

---

## MVP tools (Business)

1. `get_finance_summary`, `get_top_selling_dishes`, `get_dish_margin_rankings`
2. `get_recent_sales_orders`, `compare_sales_vs_purchases`
3. `get_sales_parse_queue`, `get_sales_bill_summary`
4. `process_sales_bills` (with confirm), `check_purchase_processed_prerequisite`

---

## Demo queries

- "How were sales this month?"
- "Which dishes have the worst margins?"
- "Status of the POS receipt I uploaded?"
- "Process the sales receipts" (**Confirm** — after purchases processed)
