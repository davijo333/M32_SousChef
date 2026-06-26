# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# # Golden addition workflows
#
# Plain step flows for catalog **creates**.  
# Template: [golden-workflow-template.md](./golden-workflow-template.md)  
# Shared rules: [golden-shared-rules.md](./golden-shared-rules.md) · Head: [golden-head-delegation.md](./golden-head-delegation.md)
#
# Workflows compose — **Dish** calls **Recipe** and **Ingredient**; **Add-on** calls **Ingredient**.
#
# ---
#
# ## Ingredient Addition Golden Workflow
#
# `add_ingredient_from_chat` · **Inventory Agent** only · *Runtime: `lookup` → `confirm_create`*
#
# Step 1: Ask **Inventory Agent** to check if ingredient exists (`query_inventory` search).
#
# Step 2: If exists → return ingredient (slug, category, on-hand qty). Stop.
#
# Step 3: Else → Head confirms **category** with chef (bakery, dairy, produce, …).
#
# Step 4: Ask **Inventory Agent** to add ingredient at **qty 0**, label **new** (`create_ingredient`).
#
# Step 5: **Inventory Agent** auto-generates packaging images (`generate_ingredient_image`).
#
# Step 6: Head summarizes — ingredient slug, category, image status.
#
# ---
#
# ## Add-on Addition Golden Workflow
#
# `add_addon_from_chat` · **Inventory Agent** only (no Creative) · *Runtime: `lookup` → `confirm_create`*
#
# Step 1: Ask **Inventory Agent** to check if add-on exists (`query_menu` addons / search).
#
# Step 2: If exists → return add-on. Stop.
#
# Step 3: Else → Head confirms name and **classification** with chef.
#
# Step 4: Ask **Inventory Agent** to create add-on (`create_addon` + auto images).
#
# Step 5: For each pantry item the add-on needs → check ingredient exists.
#
# Step 6: If ingredient missing → **{Ingredient Addition Golden Workflow}**
#
# Step 7: **Inventory Agent** link ingredients to add-on (`link_addon_ingredients`).
#
# Step 8: Head summarizes — add-on slug, Kitchen control link.
#
# ---
#
# ## Recipe Addition Golden Workflow
#
# `add_dish_from_chat` (draft phase) · **Creator Agent** drafts · **Inventory** persists later
#
# Used when chef wants a recipe body (ingredients + steps). Called from **Dish Addition** or on its own via “build recipe for …”.
#
# Step 1: Gather dish name, POS description, and image / visual context if attached (`catalog_draft` or photo).
#
# Step 2: Ask **Creator Agent** to draft recipe — ingredients (general names, qty, unit), numbered prep steps, **visual brief** (1–3 sentences for dish photo).
#
# Step 3: **Creator Agent** lists ingredients needed and 1–3 suggested add-ons (reuse catalog add-ons when they fit).
#
# Step 4: Head shows draft to chef → **confirm recipe** (chef edits → back to Step 2).
#
# Step 5: On confirm → hand off to **Inventory** for ingredient checks and dish persist (see **Dish Addition** Steps 4–8).
#
# **Light path (Suggested only):** `add_suggested_dish_lite` — Steps 1–3 → confirm → **Inventory** `add_suggested_dish` (Recipes → Suggested tab, no full kitchen build).
#
# **Existing dish only:** `link_dish_ingredients` — Inventory lookup → optional **Creator** draft → link + update recipe on existing dish slug.
#
# ---
#
# ## Dish Addition Golden Workflow
#
# `add_dish_from_chat` · **Creator Agent** → **Inventory Agent**
#
# Step 1: Ask **Inventory Agent** to check if dish exists (`query_menu` `search_dishes`).
#
# - If exists → return dish; warn chef (duplicate). Stop unless chef wants to update → use update workflow.
#
# Step 2: Else → pass **dish name**, description, and image context (if attached) to **Creator Agent**.
#
# Step 3: **{Recipe Addition Golden Workflow}** (Steps 1–4). *Runtime `workflowState`: `draft_recipe` → `confirm_recipe` → `confirm_finalize`.*
#
# Step 4: Ask **Inventory Agent** to check each ingredient in the recipe list (`query_inventory` search per item).
#
# Step 5: For each ingredient not in pantry → **{Ingredient Addition Golden Workflow}**
#
# Step 6: Head confirms full kitchen build with chef (**confirm finalize**).
#
# Step 7: Ask **Inventory Agent** to `plan_recipe_build` then `finalize_recipe_build` — create dish, link ingredients, write recipe, auto dish + ingredient images.
#
# Step 8: For each **new** add-on chef confirmed (not already in catalog) → **{Add-on Addition Golden Workflow}** and link to dish.
#
# Step 9: Head summarizes — dish name, ingredients added/linked, image status, link to Kitchen control / Recipes (`recipeStatus` stays **new** until chef promotes).
#
# **Optional follow-up:** margin pass — **Business Agent** `suggest_price_change` → **Inventory** `apply_price_change` on confirm.
#
# ---
#
# ## Suggested Dish Addition Golden Workflow
#
# `add_suggested_dish_lite` · **Creator Agent** → **Inventory Agent** · mode: **write** (light)
#
# **Trigger:** chef likes a brainstorm and says save / add to Suggested (no full kitchen build).  
# **Not this:** full Kitchen control build → **Dish Addition** above.
#
# Step 1 LOOKUP — Check suggested/active menu for duplicate name (`query_menu`).
#
# Step 2 PREVIEW — **Creator Agent** draft: name, description, classification, notes (seasonal, expiring, cue, …).
#
# Step 3 CONFIRM — Chef yes / no / edit (one question).
#
# Step 4 PERSIST — **Inventory Agent** `add_suggested_dish`.
#
# Step 5 SUMMARIZE — Recipes → Suggested; `recipeStatus` **suggested**.
#
# ---
#
# ## Suggested Add-ons Addition Golden Workflow
#
# `suggest_dish_addons` (persist path) · **Creator Agent** → **Inventory Agent**
#
# **Trigger:** after add-on ideas for a locked dish, chef confirms new modifiers.  
# **Not this:** ideas only → [Creative query](./golden-creative-query-workflows.md#suggested-add-ons-query-golden-workflow).
#
# Step 1 LOOKUP — **Inventory Agent** `query_menu` addons (reuse existing if fit).
#
# Step 2 PREVIEW — **Creator Agent** proposed 1–3 add-ons (name, class, ingredients).
#
# Step 3 CONFIRM — Chef yes / no / edit (one question).
#
# Step 4 PERSIST — For each new add-on → **{Add-on Addition Golden Workflow}**; link to dish.
#
# Step 5 SUMMARIZE — Linked add-on slugs on dish.
#
# ---
#
# ## Photo upload entry (all addition workflows)
#
# When chef attaches a photo (`catalog_draft`), run before Step 1 LOOKUP:
#
# - Enrich name, description, classification hint from vision.
# - Chef correction in thread overrides photo label.
# - Then continue the entity workflow (dish / ingredient / add-on).
