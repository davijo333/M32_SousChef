# Add dish from chat (`add_dish_from_chat`)

Runtime catalog: [`../catalog/addition-dish.yaml`](../catalog/addition-dish.yaml)

## Golden sources (archived on `v0` branch)

| Document | Section |
|----------|---------|
| `golden-addition-workflows.md` | Dish Addition, Recipe Addition, Photo upload |
| `golden-workflows.yaml` | `add_dish_from_chat` |
| `golden-shared-rules.md` | Confirm phrases, one question |

These files lived under the removed `backend/agent-service/` tree and are preserved on git branch **`v0`**.

## Product rule

**No lite save from chat.** Sous Chef does not persist brainstorm rows to Recipes → Suggested. Dish ideas in chat are conversational until the chef picks one and confirms the full kitchen build.

## Intake — five entry paths

| Mode | When | Flow |
|------|------|------|
| **name_only** | Chef states a dish name; no photo | `duplicate_check` → … |
| **image_only** | Photo / `catalog_draft`; no name yet | `image_context` → **confirm/correct name** → `duplicate_check` |
| **name_and_image** | Name in message + photo | Vision enriches description/class; **chef name wins** unless they correct → `duplicate_check` |
| **ideas_request** | Chef asks for ideas (no locked name) | `suggest_dish_ideas` → `pick_dish` → `duplicate_check` → full build |
| **neither** | Wants to add a dish but no name/image | `gather_preferences` → `suggest_dish_ideas` → `pick_dish` → … |

### Dish ideas (chat only)

1. **gather_preferences** (neither path only) — Sous Chef asks **one** question (cuisine, meal type, etc.).
2. **suggest_dish_ideas** (create worker) — **2–3 options**, each with:
   - Menu name
   - One-line POS description
   - **Why today** — weather/season cue, expiring stock, or chef preference  
   Informed by `query_menu` cues and `query_inventory` expiring. **No recipe or ingredients yet.**
3. **pick_dish** — Chef picks **1, 2, or 3** (or names one); lock and continue to full build.

### Image — name confirmation

After vision reads the photo, Sous Chef asks the chef to **confirm or correct** the proposed menu name before duplicate check or recipe work.

## After name is locked (all paths)

```
duplicate_check → confirm_dish_identity → draft_recipe (full recipe + visual brief + add-ons)
  → confirm_recipe → check_recipe_ingredients → confirm_new_ingredients* → add_new_ingredients*
  → confirm_finalize → persist_build → persist_addons? → completed
```

\* If `ingredient_names_missing` is empty, skip gap confirm/create and go straight to `confirm_finalize`.

## Pantry ingredients (dish and add-on) — two confirms after recipe

| Step | Confirm? | Purpose |
|------|----------|---------|
| `confirm_recipe` | ✅ | Chef approves recipe draft |
| `check_recipe_ingredients` | — | Search; split existing slugs vs missing names |
| `confirm_new_ingredients` | ✅ | **One confirm** to add all gap items at qty 0 (batch) |
| `add_new_ingredients` | — | Create only missing pantry rows (sub-call) |
| `confirm_finalize` | ✅ | **One confirm** for full kitchen build (dish + link + images) |
| `persist_build` | — | `plan_recipe_build` → `finalize_recipe_build` |

Chef only sees **Sous Chef** — workers are internal.

| Step | Reply |
|------|--------|
| `confirm_name_from_image` | Confirm or correct name from photo |
| `pick_dish` | Pick one of 2–3 dish ideas (1/2/3) |
| `confirm_dish_identity` | Confirm name + classification |
| `confirm_recipe` | Recipe / kitchen build confirm |
| `confirm_new_ingredients` | Confirm all new pantry gaps at qty 0 (batch) |
| `confirm_finalize` | **Ready to save {dish} to Kitchen?** |

## Add-ons after dish persist

```
persist_build → persist_new_addons* → link_addons_to_dish → completed
```

\* Sub-call `add_addon_from_chat` for **new** modifiers only. Reused catalog add-on slugs skip create. `link_addons_to_dish` links all confirmed slugs to `{locked_dish_slug}` via `linked_dish_slugs`.

## Duplicate dish

If `duplicate_check` finds a match → `stop_warn_chef` → handoff to `update_dish` or pick a new name.

## Sous Chef gates
