# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# # Golden business query workflows
#
# Read-only sales, margin, and promotion questions. Same shape as [inventory queries](./golden-inventory-query-workflows.md).  
# Template: [golden-workflow-template.md](./golden-workflow-template.md) · Head: [golden-head-delegation.md](./golden-head-delegation.md)
#
# **Business Agent** read only — **Inventory** applies price/reorder after confirm via [update workflows](./golden-update-workflows.md).
#
# ---
#
# ## Sales Summary Query Golden Workflow
#
# `business_sales_summary` · mode: **read**
#
# **Trigger:** “sales this week”, “how did we do”, “POS totals”, finance period questions
#
# Step 1 PARSE — Period (week / month / default from dashboard).
#
# Step 2 CONSULT — **Business Agent** `query_business` `finance_summary`.
#
# Step 3 ANSWER — Quote sales, tickets, COGS, gross profit from tool (not margin dollars as sell price).
#
# Step 4 OPTIONAL — One question if period unclear.
#
# ---
#
# ## Dish Margin / Sell Price Query Golden Workflow
#
# `business_dish_pricing` · mode: **read**
#
# **Trigger:** “margin on …”, “sell price of …”, “food cost for …”
#
# Step 1 PARSE — Dish or add-on name.
#
# Step 2 CONSULT — **Business Agent** `suggest_price_change` or `dish_pricing` / `addon_pricing`.
#
# Step 3 ANSWER — Quote **sell price (menu)** and margin $ from DB; distinguish from bulk supplier purchases.
#
# Step 4 OPTIONAL — Disambiguate dish name (one question).
#
# **Escalate:** “set price to $X” → [Dish Update](./golden-update-workflows.md) after preview confirm.
#
# ---
#
# ## Margin Ranking Query Golden Workflow
#
# `business_margin_rank` · mode: **read**
#
# **Trigger:** “best margins”, “worst sellers”, “top dishes by profit”
#
# Step 1 PARSE — Rank direction (top / bottom) or limit.
#
# Step 2 CONSULT — **Business Agent** `query_business` `margins` or `top_selling` / `slow_sellers`.
#
# Step 3 ANSWER — List with sell $ and margin $ per line.
#
# Step 4 OPTIONAL — “Promote one?” → Creative promotion query.
#
# ---
#
# ## Promotion Opportunities Query Golden Workflow
#
# `business_promotion_read` · mode: **read**
#
# **Trigger:** “what to promote”, “slow sellers”, “feature this week”
#
# Step 1 PARSE — Optional focus (margin vs velocity).
#
# Step 2 CONSULT — **Business Agent** `promotion_opportunities`.
#
# Step 3 ANSWER — Recommended dishes and rationale from tool.
#
# Step 4 OPTIONAL — “Draft a special?” → [Creative query](./golden-creative-query-workflows.md).
#
# ---
#
# ## Reorder Advice Query Golden Workflow
#
# `business_reorder_advice` · mode: **read**
#
# **Trigger:** “what reorder level should … be”, “how much to stock”
#
# Step 1 PARSE — Ingredient name.
#
# Step 2 CONSULT — **Business Agent** `suggest_reorder_threshold` (may use sales + pantry context).
#
# Step 3 ANSWER — Recommended threshold with reasoning.
#
# Step 4 OPTIONAL — Disambiguate ingredient (one question).
#
# **Escalate:** “set it to X” → [Ingredient Update](./golden-update-workflows.md).
#
# ---
#
# ## Supplier vs COGS Query Golden Workflow
#
# `business_purchases_vs_cogs` · mode: **read**
#
# **Trigger:** “supplier spend”, “purchases vs sales”, “why is COGS different from POs”
#
# Step 1 PARSE — Period.
#
# Step 2 CONSULT — **Business Agent** `finance_summary` (supplier purchases vs sold COGS).
#
# Step 3 ANSWER — Explain bulk restock vs per-ticket COGS in plain language.
#
# Step 4 OPTIONAL — None unless period unclear.
