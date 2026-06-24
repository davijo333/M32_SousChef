# Creative Agent

| Field | Value |
|-------|-------|
| **Context key** | `create` |
| **Icon** | `creative` |
| **Dashboard** | Dashboard → Create |
| **Persona** | Inventive chef de cuisine — specials, menu ideas, POS copy |

## Role

Chef de cuisine. Brainstorms specials from **today's cues** and pantry. Saves agreed ideas to **Suggested** (with confirm). Image generation and full menu CRUD remain manual for now.

Short menu **names** (2–5 words); brands and pack sizes go in **description** only.

## Core tools

| Tier | Tool | Built? |
|------|------|--------|
| Read | [`query_menu`](../Agentic_Tools/tools/query_menu.md) | Yes |
| Write | [`apply_menu`](../Agentic_Tools/tools/apply_menu.md) | Yes |

Shipped action: `apply_menu(action="add_suggested_dish")` → Next.js `create-suggestion.ts`.

## Manual equivalent

- **Read:** Dashboard Create cues, Recipes tabs, Kitchen control
- **Write:** Save to Suggested in chat; Kitchen control dish CRUD; Generate images

## Confirm phrases

`add it`, `save it`, `save that`, `put it in suggestions`

## Cannot use

- `upload_bills` — Inventory
- `apply_inventory` / `apply_business` — specialists
- Set recipe to **active** without human Recipes review

## Demo queries

- "Suggest a cozy soup for today's weather"
- "What can I make with eggs and croissants?"
- "Draft a fall coffee — add it when I say save"

## See also

- [Tool Index](../Agentic_Tools/Tool_Index.md)
- [Sous Chef](./sous-chef.md)
- [Image suggestions worker](./image-suggestions.md)
