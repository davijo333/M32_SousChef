# Update workflows (catalog)

Runtime catalogs: `catalog/update-*.yaml`  
Golden source: archived on git branch `v0` (`workflows/golden-update-workflows.md`)

**Rule:** all updates are **inventory only** — never the create worker for writes.  
(Optional create draft on `link_dish_ingredients` when chef needs recipe help — inventory still persists.)

## Workflows

| ID | File | Purpose |
|----|------|---------|
| `update_dish` | update-dish.yaml | Name, description, classification, sell price |
| `update_ingredient` | update-ingredient.yaml | Pantry fields, reorder, qty |
| `update_addon` | update-addon.yaml | Add-on metadata, linked dishes |
| `link_dish_ingredients` | update-link.yaml | Recipe links + prep steps on existing dish |
| `link_addon_ingredients` | update-link.yaml | Pantry links on existing add-on |
| `link_addons_to_dish` | update-link.yaml | Attach add-on slugs to dish |

## Writable fields (strict)

| Entity | Allowed in `update_*` persist | Link follow-up (`route_post_persist`) |
|--------|------------------------------|----------------------------------------|
| **Dish** | class, price, description | `link_dish_ingredients`, `link_addons_to_dish` |
| **Add-on** | class, price, description | `link_addon_ingredients` |
| **Ingredient** | category, available qty, reorder level, previous cost, previous order qty | — |

Link-only requests (no attribute change) → start directly on the link workflow.

DB field mapping (ingredient): `currentQty`, `reorderThreshold`, `lastPurchasePrice`, `lastOrderedQty`.

Dish/add-on price → `sell_price` / `apply_price_change`. Class → `classification`.

## Common shape

```
intake → lookup → (not found?) handoff to addition workflow
       → preview → confirm_* → persist (attributes only)
       → route_post_persist? → link_* workflow → completed
```

## Boundaries vs addition

| Chef wants | Workflow |
|------------|----------|
| New dish + full kitchen | `add_dish_from_chat` |
| Change existing dish class / price / description | `update_dish` |
| Change recipe ingredients/steps only | `link_dish_ingredients` |
| New pantry row | `add_ingredient_from_chat` |
| Change pantry row | `update_ingredient` |
| New add-on | `add_addon_from_chat` |
| Change existing add-on class / price / description | `update_addon` |
| Change add-on ingredient links | `link_addon_ingredients` |

## Pantry gaps on link workflows

`link_dish_ingredients` and `link_addon_ingredients` reuse the same policy as dish build:

```
check → confirm_new_ingredients (gaps) → add_new_ingredients → confirm_link → persist
```

## Confirm gates

| Gate | When |
|------|------|
| `confirm_class` | Classification / category change |
| `confirm_price` | Sell price only |
| `confirm_reorder` | Reorder threshold only |
| `confirm_new_ingredients` | Batch new pantry rows at qty 0 before link |
| `confirm_inventory` | General catalog update |

Chef only sees **Sous Chef**.
