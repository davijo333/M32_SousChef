# Creative Agent — Tools

**Role:** Chef de cuisine — specials, menu ideas, POS-ready copy. Saves only when chef confirms.

---

## Read tools

| Tool | Args | Returns | Existing code |
|------|------|---------|---------------|
| `get_todays_cues` | — | day, weather, holiday, season | `create-cues`, `create-weather` |
| `get_pantry_for_specials` | `focus?`: expiring \| high_margin \| all | Ingredient slugs + names | creative context builder |
| `search_dishes` | `query` | Existing dishes | `Dish.find` |
| `get_suggested_dishes` | — | recipeStatus suggested | `Dish` |
| `get_active_dishes` | `limit?` | Current menu | `Dish` |
| `get_ingredients_for_slugs` | `slugs[]` | Validate pantry refs | `Ingredient` |
| `get_addon_catalog` | — | Add-ons for BYO ideas | `AddOn` |

---

## Write tools

| Tool | Args | Effect | Confirm |
|------|------|--------|---------|
| `add_suggested_dish` | `name`, `description`, `classification`, `ingredientSlugs?`, `notes[]` | Creates suggested dish + recipe link | **Yes** |
| `draft_special_only` | same without persist | Returns draft JSON | No |

**`add_suggested_dish` wraps:** `create-suggestion.ts` → `link-recipe` FastAPI → `scheduleRecipeBuild`.

**Menu names:** Short titles (2–5 words) without supplier brands or pack sizes. `formatSuggestedMenuName()` in `suggested-menu-name.ts` normalizes on save. Brands belong in **description** and **notes**.

**`notes` kinds:** `expiring_ingredients`, `seasonal`, `high_margin`, `low_stock`, `cue`, `other` (`suggestion-notes.ts`).

**Classifications:** `sandwich`, `byo-sandwich`, `coffee`, `tea`, `juice`, `other`.

---

## Cross-domain requests

| Tool | Args | Behavior |
|------|------|----------|
| `request_inventory_context` | `question` | Expiring / low stock for planning |
| `request_business_context` | `question` | High-margin items to feature |

---

## Cannot use

- Bill upload parse / handoff (Sous Chef → Inventory/Business)
- `process_purchase_bills` / `process_sales_bills`
- `set_recipe_status` to `active` without human Recipes review

---

## Phase 2

| Tool | Effect |
|------|--------|
| `generate_dish_image` | `regenerate-dish-images` / suggest-images |
| `enrich_dish_description` | `dish-enrichment` |

---

## MVP tools (Creative)

1. `get_todays_cues`, `get_pantry_for_specials`, `search_dishes`
2. `get_suggested_dishes`
3. `add_suggested_dish` (**Confirm**)
4. `draft_special_only`

---

## Demo queries

- "Suggest a cozy soup for today's weather"
- "What can I make with eggs and croissants?"
- "Draft a fall coffee drink — add it when I say save"

---

## Confirm phrases

Detect user confirmation for `add_suggested_dish`:

- "add it", "save it", "save that", "put it in suggestions"

Matches existing Creative chat behavior in `/api/dashboard/chat`.
