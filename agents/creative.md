# Creative Agent

| Field | Value |
|-------|-------|
| **Context key** | `create` |
| **Icon** | `creative` |
| **Dashboard** | Dashboard → Create |
| **Persona** | Inventive chef de cuisine — recipes, specials, seasonal ideas |
| **Spec** | `backend/agent-service/agents/creative/` (`profile.yaml`, `instructions.md`, `tasks.yaml`) |

## Role

**Read-only** menu ideation and recipe drafting:

- **Cues** — day, weather, season, holidays, expiring pantry (`query_menu` `cues`)
- **Full recipes** for named dishes — general ingredient names (no brands), qty, unit, numbered steps, **visual brief** (text for auto dish photos)
- **Suggested add-ons for dishes** — pair modifiers using `query_menu addons`; propose 1–3 per dish (Inventory persists)
- **Expiry-driven recipes** — prioritize soon-to-expire ingredients (`query_inventory` `expiring`)
- **Promotional recipes** — draft specials for slow sellers (`query_menu` `promotion_targets`)
- **Pantry-constrained** ideas — search pantry before drafting

Short menu **names** (2–5 words); brands and pack sizes in **description** only.

**Does not mutate the database.** Inventory Agent saves on confirm.

## Core tools

| Tier | Tool | Built? |
|------|------|--------|
| Read | `query_menu` | Yes |
| Read | `query_inventory` | Yes |
| Write | — | N/A (delegates to Inventory) |

### `query_menu` actions

`cues`, `search_dishes`, `suggested`, `active`, `addons`, `promotion_targets`

### `query_inventory` actions (creative use)

`expiring`, `search`, `pantry_summary`, `ingredient_detail`

## Saves (via Inventory)

| Chef intent | Inventory action |
|-------------|------------------|
| Save idea to Suggested | `add_suggested_dish` + suggestion notes |
| Full dish + pantry + links + auto photos | `plan_recipe_build` (with `visual_brief`) → `finalize_recipe_build` |

No store-product or image picking in chat — Inventory auto-generates photos; Kitchen control is fail-safe only.

Create-tab confirms → runner **coerces to Inventory** automatically.

## Suggestion notes (required on save)

`expiring_ingredients`, `seasonal`, `high_margin`, `low_stock`, `cue`, `other`

## Manual equivalent

- **Read:** Dashboard Create cues, Recipes tabs, Kitchen control
- **Draft:** Creator Agent chat
- **Write:** Inventory Agent (or auto-route on confirm)

## Confirm phrases

`add it`, `save it`, `save that`, `put it in suggestions`

## Cannot use

- `upload_bills` — Inventory
- `apply_inventory` / `apply_menu` — Inventory (Creative is read-only)
- `query_business` — Business owns sales/margin analysis; use `promotion_targets` for creative reads

## Demo queries

- "Suggest a cozy soup for today's weather"
- "Draft a recipe using expiring mango"
- "Write a full club sandwich recipe with ingredients and steps"
- "Create a promotional special for our slowest seller"
- "Add it" → routes to Inventory

## See also

- [Tool Index](../tools/Tool_Index.md)
- [Sous Chef](./sous-chef.md)
- [Inventory](./inventory.md)
- [Business](./business.md)
