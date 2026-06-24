# Chat (embedded on Dashboard)

Conversational interface is **not** a separate tab. It lives on the [Dashboard](./dashboard.md) as a bottom-center chat panel.

## Purpose

Let café owners ask operational questions in natural language while viewing inventory widgets. The Chat Copilot reads real data via tools; session context is retained within a single conversation.

## Route

| Surface | Route |
|---------|-------|
| Chat UI | `/dashboard` (embedded panel) |
| Legacy redirect | `/chat` → `/dashboard` |

## UI behavior

| State | Behavior |
|-------|----------|
| Collapsed | Wide input bar + Send at bottom center |
| Expanded | Message thread above input; Minimize button |
| Loading | *Sous Chef is thinking…* |
| Unauthorized | Redirect to `/login` |

## Example prompts

- *How much bacon do we have left?*
- *What's expiring soon?*
- *Spinach expires tomorrow — what specials should I run?*
- *My name is David* → later *What is my name?*

## Chat tools (MVP)

| Tool | Example use |
|------|-------------|
| `get_inventory_status` | Current stock + expiry |
| `get_dish_margins` | Food cost % per dish |
| `get_expiring_items` | Next 7 days |
| `suggest_specials` | Expiry + slow movers |
| `calculate_reorder` | Usage × lead time − current stock |

## Agent behavior

- Inventory math is **code** — chat calls tools; it does not invent stock levels
- Structured outputs where possible: lists for reorder, expiring items
- Read-only for data edits → direct user to [Kitchen Control](./kitchen-control.md)

## Related

- [Dashboard](./dashboard.md)
- [Kitchen Control](./kitchen-control.md)
- [Agents](../agents/README.md) — pipeline overview (chat copilot deferred)
