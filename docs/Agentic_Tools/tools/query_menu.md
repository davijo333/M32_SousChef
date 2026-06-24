# `query_menu`

| Field | Value |
|-------|-------|
| **Primary agent** | Creative |
| **Used by** | **Creative**, **Sous Chef (via consult)** |
| **Tier** | Read |
| **Built?** | Yes |
| **Confirm required?** | No |

## Summary

Query cues, pantry for specials, existing dishes and suggestions.

## Dual path

**Manual:** Dashboard Create cues; Recipes and Kitchen control

**Chat:** Chef invokes `query_menu` with an `action` parameter (see internal actions).

## Wraps

`tools/core/reads.py + create-cues`

## Internal actions

The LLM sees **one** tool; the backend routes to:

- `get_todays_cues`
- `get_pantry_for_specials`
- `search_dishes`
- `get_suggested_dishes`
- `get_active_dishes`
- `get_addon_catalog`

## Build status

**Yes** — consolidated `@tool` shipped in `services/agent/tools/core/`.

Read-only or navigation — no confirmation.

## See also

- [Tool Index](../Tool_Index.md)
- [Creative agent](../../Agents/creative.md)
