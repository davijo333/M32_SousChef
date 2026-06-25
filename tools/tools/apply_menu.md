# `apply_menu`

| Field | Value |
|-------|-------|
| **Primary agent** | Creative |
| **Used by** | **Creative** |
| **Tier** | Write |
| **Built?** | Yes |
| **Confirm required?** | Yes |

## Summary

Save suggestions, draft specials, generate catalog images, menu CRUD.

## Dual path

**Manual:** Kitchen control; Recipes → Suggested; Generate images buttons

**Chat:** Chef invokes `apply_menu` with an `action` parameter (see internal actions).

## Wraps

`create-suggestion.ts; catalog PATCH/POST; suggest-images worker`

## Internal actions

The LLM sees **one** tool; the backend routes to:

- `add_suggested_dish`
- `draft_special_only`
- `generate_dish_image`
- `generate_ingredient_image`
- `create_dish`
- `update_dish`
- `delete_dish`
- `link_dish_ingredients`
- `enrich_dish_description`

## Build status

**Yes** — consolidated `@tool` shipped in `backend/agent-service/tools/core/`.

Destructive or persistent changes require chef confirmation (`confirm_inventory`, `confirm_business`, or `confirm_suggestion` in chat).

## See also

- [Tool Index](../Tool_Index.md)
- [Creative agent](../../../agents/creative.md)
