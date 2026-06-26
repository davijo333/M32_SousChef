# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# # Golden update workflows
#
# Plain step flows for catalog **updates**. Template: [golden-workflow-template.md](./golden-workflow-template.md)  
# Shared rules: [golden-shared-rules.md](./golden-shared-rules.md) · Head protocol: [golden-head-delegation.md](./golden-head-delegation.md)
#
# **Inventory Agent only** for all updates — never Creator.
#
# Workflows compose — **Dish** / **Add-on** link changes may call **{Recipe Link}** or **{Add-on Link}**.
#
# ---
#
# ## Ingredient Update Golden Workflow
#
# `update_ingredient` · **Inventory Agent** only · mode: **write**
#
# **Trigger:** change ingredient name, category, brand (description), reorder level, or on-hand qty.  
# **Not this:** new pantry row → [Ingredient Addition](./golden-addition-workflows.md).
#
# Step 1 LOOKUP — Ask **Inventory Agent** for ingredient (`query_inventory` `ingredient_detail` / search).
#
# Step 2 BRANCH — If not found → say not in pantry; offer **{Ingredient Addition Golden Workflow}** or correct name. Stop.
#
# Step 3 PREVIEW — Head shows current vs requested (category, reorder level, qty, name).
#
# Step 4 CONFIRM — Chef yes / no / edit (one question). If category changes → confirm class per [shared rules](./golden-shared-rules.md).
#
# Step 5 PERSIST — **Inventory Agent** `update_ingredient` or `update_reorder_threshold` as needed.
#
# Step 6 SUMMARIZE — Head quotes updated values from tool output.
#
# ---
#
# ## Add-on Update Golden Workflow
#
# `update_addon` · **Inventory Agent** only · mode: **write**
#
# **Trigger:** change add-on sell price, name, description, or classification.  
# **Not this:** new add-on → [Add-on Addition](./golden-addition-workflows.md); link ingredients only → **{Add-on Link Golden Workflow}**.
#
# Step 1 LOOKUP — Ask **Inventory Agent** (`query_menu` addons / search).
#
# Step 2 BRANCH — If not found → offer **{Add-on Addition Golden Workflow}**. Stop.
#
# Step 3 PREVIEW — Head shows current sell price, name, description, classification vs requested.
#
# Step 4 CONFIRM — Chef yes / no / edit (one question).
#
# Step 5 PERSIST — **Inventory Agent** `update_addon` (or `apply_price_change` when only sell price changes).
#
# Step 6 SUMMARIZE — Head confirms slug and Kitchen control link.
#
# ---
#
# ## Recipe Link Golden Workflow
#
# `link_dish_ingredients` · **Inventory Agent** · mode: **write**
#
# **Trigger:** add/remove/link ingredients on an **existing** dish; update recipe lines without new dish row.  
# **Not this:** new dish + full build → [Dish Addition](./golden-addition-workflows.md).
#
# Step 1 LOOKUP — **Inventory Agent** `search_dishes` + `query_inventory` search per ingredient.
#
# Step 2 BRANCH — If dish not found → stop or **{Dish Addition Golden Workflow}**.
#
# Step 3 PREVIEW — Head lists ingredient links and recipe instruction changes (no write).
#
# Step 4 CONFIRM — Chef yes / no / edit (one question).
#
# Step 5 PERSIST — **Inventory Agent** `link_dish_ingredients` (+ recipe instruction update if provided).
#
# Step 6 SUMMARIZE — Head reports linked slugs and dish name.
#
# **Add-on ingredient links:** `link_addon_ingredients` — same steps; LOOKUP on add-on slug instead of dish.
#
# ---
#
# ## Dish Update Golden Workflow
#
# `update_dish` · **Inventory Agent** only · mode: **write**
#
# **Trigger:** change dish sell price, name, description, classification, linked add-ons, or linked ingredients.  
# **Not this:** new dish → [Dish Addition](./golden-addition-workflows.md).
#
# Step 1 LOOKUP — Ask **Inventory Agent** (`query_menu` `search_dishes` / `dish_detail`).
#
# Step 2 BRANCH — If not found → offer **{Dish Addition Golden Workflow}**. Stop.
#
# Step 3 PREVIEW — Head shows current name, description, classification, sell price vs requested.
#
# - Sell-price-only: show **Update sell price to $X?** (Business may have been consulted for margin read earlier — Inventory still performs write).
# - Linked add-ons / ingredients → **{Recipe Link Golden Workflow}** or add-on link sub-step after field update.
#
# Step 4 CONFIRM — Chef yes / no / edit (one question). Classification change → confirm class.
#
# Step 5 PERSIST — **Inventory Agent** `update_dish` and/or `apply_price_change`.
#
# Step 6 SUMMARIZE — Head quotes updated dish fields from tool output.
#
# ---
#
# ## Recipe Update Golden Workflow
#
# `link_dish_ingredients` (+ recipe record) · **Inventory Agent** · mode: **write**
#
# **Trigger:** change prep steps or ingredient list on existing dish recipe without renaming dish.  
# **Not this:** full rebuild → [Dish Addition](./golden-addition-workflows.md); new dish from scratch → [Recipe Addition](./golden-addition-workflows.md).
#
# Step 1 LOOKUP — **Inventory Agent** fetch dish + current recipe.
#
# Step 2 BRANCH — If no dish → **{Dish Addition Golden Workflow}**. If chef only meant metadata → **{Dish Update Golden Workflow}**.
#
# Step 3 PREVIEW — Head shows new ingredients (qty/unit) and/or instruction steps.
#
# Step 4 CONFIRM — Chef yes / no / edit (one question).
#
# Step 5 PERSIST — **{Recipe Link Golden Workflow}** Steps 5–6 (link + recipe write).
#
# Step 6 SUMMARIZE — Head confirms recipe ready / food cost scheduled.
