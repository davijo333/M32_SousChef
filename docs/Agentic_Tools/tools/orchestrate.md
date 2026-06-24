# `orchestrate`

| Field | Value |
|-------|-------|
| **Primary agent** | Sous Chef |
| **Used by** | **Sous Chef** |
| **Tier** | Orchestrate |
| **Built?** | Yes |
| **Confirm required?** | No |

## Summary

Route to specialists, synthesize cross-domain answers, hand off, navigate.

## Dual path

**Manual:** Connect buttons, dashboard section tabs, Connect back to Sous Chef

**Chat:** Chef invokes `orchestrate` with an `action` parameter (see internal actions).

## Wraps

`tools/core/factory.py orchestrate; agents/supervisor.py`

## Internal actions

The LLM sees **one** tool; the backend routes to:

- `consult_multi`
- `synthesize_response`
- `suggest_handoff`
- `handoff_to_inventory`
- `handoff_to_business`
- `handoff_to_creative`
- `return_to_head_chef`
- `navigate_to`
- `open_chat_agent`

## Build status

**Yes** — consolidated `@tool` shipped in `services/agent/tools/core/`.

Read-only or navigation — no confirmation.

## See also

- [Tool Index](../Tool_Index.md)
- [Sous Chef agent](../../Agents/sous-chef.md)
