# `query_kitchen`

| Field | Value |
|-------|-------|
| **Primary agent** | Sous Chef |
| **Used by** | **Sous Chef** |
| **Tier** | Read |
| **Built?** | Yes |
| **Confirm required?** | No |

## Summary

Triage and read high-level kitchen snapshots; answer broad daily-priority questions.

## Dual path

**Manual:** Dashboard overview (Inventory + Business sections)

**Chat:** Chef invokes `query_kitchen` with an `action` parameter (see internal actions).

## Wraps

`tools/core/factory.py query_kitchen + orchestrate`

## Internal actions

The LLM sees **one** tool; the backend routes to:

- `classify_intent`
- `get_kitchen_summary`
- `supervisor consult routing`

## Build status

**Yes** — consolidated `@tool` shipped in `backend/agent-service/tools/core/`.

Read-only or navigation — no confirmation.

## See also

- [Tool Index](../Tool_Index.md)
- [Sous Chef agent](../../../agents/sous-chef.md)
