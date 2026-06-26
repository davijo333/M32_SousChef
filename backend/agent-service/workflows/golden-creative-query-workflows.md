# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# # Golden creative query workflows
#
# Brainstorm and draft ideas — **read / draft only** until chef escalates to [addition](./golden-addition-workflows.md).  
# Template: [golden-workflow-template.md](./golden-workflow-template.md) · Head: [golden-head-delegation.md](./golden-head-delegation.md)
#
# **Creator Agent** — no catalog writes. Persist only after chef confirms a **write** workflow in [golden-addition-workflows.md](./golden-addition-workflows.md).
#
# ---
#
# ## Daily Cues / Special Idea Query Golden Workflow
#
# `creative_cues` · mode: **read**
#
# **Trigger:** “idea for today”, “special for weather”, “what should I feature”, cozy/seasonal asks
#
# Step 1 PARSE — Cues context (day, weather, season from `query_menu` cues).
#
# Step 2 CONSULT — **Creator Agent** `query_menu` cues + pantry snapshot.
#
# Step 3 ANSWER — 1–3 dish ideas with short rationale (no save).
#
# Step 4 OPTIONAL — “Build one?” → [Dish Addition](./golden-addition-workflows.md) or [Suggested Dish Addition](./golden-addition-workflows.md#suggested-dish-addition-golden-workflow).
#
# ---
#
# ## Expiry Special Query Golden Workflow
#
# `expiry_special` · mode: **read** → optional **write**
#
# **Trigger:** “what can I make with expiring …”, “use up spinach”
#
# Step 1 PARSE — Expiring ingredient names (from message or Inventory expiring list).
#
# Step 2 CONSULT — **Creator Agent** `query_inventory` expiring + draft using those items first.
#
# Step 3 ANSWER — Proposed dish/recipe draft in chat.
#
# Step 4 OPTIONAL — “Save to Suggested?” → [Suggested Dish Addition](./golden-addition-workflows.md#suggested-dish-addition-golden-workflow); “full kitchen build” → [Dish Addition](./golden-addition-workflows.md).
#
# ---
#
# ## Promotion Special Query Golden Workflow
#
# `promotion_special` · mode: **read** → optional **write**
#
# **Trigger:** “promo for slow seller”, “feature the latte”, “limited-time special”
#
# Step 1 PARSE — Target dish or “pick for me”.
#
# Step 2 CONSULT — **Creator Agent** `query_menu` `promotion_targets` + draft bundle/special.
#
# Step 3 ANSWER — Promo concept + optional recipe sketch.
#
# Step 4 OPTIONAL — “Save to Suggested?” → [Suggested Dish Addition](./golden-addition-workflows.md#suggested-dish-addition-golden-workflow).
#
# ---
#
# ## Suggested Add-ons Query Golden Workflow
#
# `suggest_dish_addons` · mode: **read** → optional **write**
#
# **Trigger:** “what add-ons for …”, “modifiers for …”, “upsells for …”
#
# Step 1 PARSE — Lock dish name from thread.
#
# Step 2 CONSULT — **Creator Agent** `query_menu` addons + propose 1–3 for dish.
#
# Step 3 ANSWER — Add-on names, classifications, fit rationale.
#
# Step 4 OPTIONAL — “Add them?” → [Suggested Add-ons Addition](./golden-addition-workflows.md#suggested-add-ons-addition-golden-workflow).
#
# ---
#
# ## Pantry-Based Recipe Query Golden Workflow
#
# `creative_pantry_recipe` · mode: **read**
#
# **Trigger:** “what can I make with eggs and …”, “recipe using what we have”
#
# Step 1 PARSE — Ingredient list from chef.
#
# Step 2 CONSULT — **Creator Agent** `query_inventory` search + draft recipe.
#
# Step 3 ANSWER — Recipe draft (ingredients + steps) in chat only.
#
# Step 4 OPTIONAL — “Add to kitchen” → [Dish Addition](./golden-addition-workflows.md).
