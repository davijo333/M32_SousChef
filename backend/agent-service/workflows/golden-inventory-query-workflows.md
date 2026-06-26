# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# # Golden inventory query workflows
#
# Read-only pantry and catalog questions. Template: [golden-workflow-template.md](./golden-workflow-template.md)  
# Business queries: [golden-business-query-workflows.md](./golden-business-query-workflows.md) · Creative: [golden-creative-query-workflows.md](./golden-creative-query-workflows.md)  
# Head protocol: [golden-head-delegation.md](./golden-head-delegation.md)
#
# All queries: **no CONFIRM gate** unless Step 4 disambiguation. **Inventory Agent** only.
#
# ---
#
# ## On-Hand Quantity Query Golden Workflow
#
# `inventory_on_hand` · mode: **read**
#
# **Trigger:** “how much …”, “qty of …”, “do we have …”, “on hand for …”
#
# Step 1 PARSE — Extract ingredient (or dish/add-on) name.
#
# Step 2 CONSULT — **Inventory Agent** `query_inventory` `ingredient_detail` or `catalog_search`.
#
# Step 3 ANSWER — Quote **On hand** and **unit** exactly from DB.
#
# Step 4 OPTIONAL — If multiple matches: one question — “Did you mean **A** or **B**?”
#
# **Escalate:** “reorder …” → Reorder Level Query; “add …” → [Addition](./golden-addition-workflows.md).
#
# ---
#
# ## Low Stock Query Golden Workflow
#
# `inventory_low_stock` · mode: **read**
#
# **Trigger:** “what’s low”, “required items”, “need to reorder”, “running out”
#
# Step 1 PARSE — Optional category or “everything”.
#
# Step 2 CONSULT — **Inventory Agent** `query_inventory` (low / required filter).
#
# Step 3 ANSWER — List items with on-hand vs reorder level.
#
# Step 4 OPTIONAL — One question if chef should narrow (e.g. category).
#
# **Escalate:** “order more” / “set reorder to X” → [Ingredient Update](./golden-update-workflows.md).
#
# ---
#
# ## Expiring Stock Query Golden Workflow
#
# `inventory_expiring` · mode: **read**
#
# **Trigger:** “expiring”, “use before”, “spoil this week”
#
# Step 1 PARSE — Window (default 7 days).
#
# Step 2 CONSULT — **Inventory Agent** expiring ingredients list.
#
# Step 3 ANSWER — Names, qty, expiry context.
#
# Step 4 OPTIONAL — “Want a special using these?” → [Creative query](./golden-creative-query-workflows.md) (Expiry Special).
#
# ---
#
# ## Reorder Level Query Golden Workflow
#
# `inventory_reorder_read` · mode: **read**
#
# **Trigger:** “reorder level for …”, “threshold for …”
#
# Step 1 PARSE — Ingredient name.
#
# Step 2 CONSULT — **Inventory Agent** `ingredient_detail`.
#
# Step 3 ANSWER — Quote **Reorder level** and unit from DB.
#
# Step 4 OPTIONAL — Disambiguate name if needed (one question).
#
# **Escalate:** “set reorder to …” → [Ingredient Update](./golden-update-workflows.md).
#
# ---
#
# ## Pantry Search Query Golden Workflow
#
# `inventory_search` · mode: **read**
#
# **Trigger:** “find ingredient …”, “what’s in pantry”, “search for …”
#
# Step 1 PARSE — Search term or category.
#
# Step 2 CONSULT — **Inventory Agent** `query_inventory` search / catalog_search.
#
# Step 3 ANSWER — Matching rows (name, slug, category, on-hand).
#
# Step 4 OPTIONAL — One clarifier if zero results (typo vs missing → suggest Addition).
#
# ---
#
# ## Dish / Add-on Catalog Lookup Query Golden Workflow
#
# `inventory_menu_lookup` · mode: **read**
#
# **Trigger:** “do we have a dish called …”, “is … on the menu”, add-on lookup
#
# Step 1 PARSE — Dish or add-on name.
#
# Step 2 CONSULT — **Inventory Agent** `query_menu` `search_dishes` or `addons`.
#
# Step 3 ANSWER — Status, sell price, classification from DB.
#
# Step 4 OPTIONAL — Disambiguate similar names (one question).
#
# **Escalate:** “change price” → [Dish Update](./golden-update-workflows.md); “add dish” → [Addition](./golden-addition-workflows.md).
#
# ---
#
# ## Purchase Queue Query Golden Workflow
#
# `inventory_purchase_queue` · mode: **read**
#
# **Trigger:** “bills to process”, “uploaded POs”, “purchase queue”
#
# Step 1 PARSE — Supplier vs sales context.
#
# Step 2 CONSULT — **Inventory Agent** `query_inventory` `purchase_queue` / upload batch status.
#
# Step 3 ANSWER — Counts, filenames, ready state.
#
# Step 4 OPTIONAL — “Process them?” → bill **write** workflow (not in query docs).
