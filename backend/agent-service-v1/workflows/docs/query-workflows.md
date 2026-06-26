# Query workflows (catalog)

Runtime catalogs: `catalog/query-*.yaml`  
Golden sources: `golden-inventory-query-workflows.md`, `golden-business-query-workflows.md`, `golden-creative-query-workflows.md`

**Rule:** queries are **read-only** — no confirm gate except **disambiguate** (one question when multiple DB matches).

## Inventory (`query-inventory.yaml`)

| ID | Trigger examples | Tool |
|----|------------------|------|
| `inventory_on_hand` | how much, on hand, do we have | `ingredient_detail` |
| `inventory_low_stock` | low stock, running out | low / required filter |
| `inventory_expiring` | expiring, spoil this week | expiring list |
| `inventory_reorder_read` | reorder level for | `ingredient_detail` |
| `inventory_search` | find ingredient, search pantry | search |
| `inventory_menu_lookup` | dish on menu, addon lookup | `search_dishes` / addons |
| `inventory_purchase_queue` | bills to process, PO queue | purchase_queue |

**Escalate:** reorder write → `update_ingredient`; add pantry → `add_ingredient_from_chat`.

## Business (`query-business.yaml`)

| ID | Trigger examples | Tool |
|----|------------------|------|
| `business_sales_summary` | sales this week, POS totals | `finance_summary` |
| `business_dish_pricing` | margin on, sell price of | `dish_pricing` / `addon_pricing` |
| `business_margin_rank` | best margins, slow sellers | `margins`, `top_selling` |
| `business_promotion_read` | what to promote | `promotion_opportunities` |
| `business_reorder_advice` | reorder level should be | `suggest_reorder_threshold` |
| `business_purchases_vs_cogs` | supplier spend vs COGS | `sales_vs_purchases` |

**Escalate:** set price → `update_dish` / `update_addon`; set reorder → `update_ingredient`.

## Creative (`query-creative.yaml`)

| ID | Trigger examples | Output |
|----|------------------|--------|
| `creative_cues` | idea for today, weather special | 1–3 ideas, why only |
| `expiry_special` | use up expiring X | chat recipe draft |
| `promotion_special` | promo for slow seller | promo concept |
| `suggest_dish_addons` | modifiers for dish | 1–3 add-on ideas |
| `creative_pantry_recipe` | make with eggs and… | chat recipe draft |

**No DB writes.** "Build one" / "add to kitchen" → `add_dish_from_chat`.

### Creative vs add dish

| Chef intent | Workflow |
|-------------|----------|
| Brainstorm only | `creative_*` query |
| Pick idea + full kitchen build | `add_dish_from_chat` |
| No name, wants 2–3 ideas then build | `add_dish_from_chat` (`neither` / `ideas_request`) |

## Common query shape

```
intake → consult (worker + tool) → answer
       → disambiguate? (one question if multiple matches)
```

## Triage

`route_chef_intent` in `triage.yaml` maps message patterns to workflow families.  
`daily_kitchen_triage` — single `query_kitchen` snapshot for priorities.

Chef only sees **Sous Chef**.
