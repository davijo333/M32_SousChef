# Creator Agent — spec complete

## Policy

**Read-only** for database. Draft recipes and specials in chat. **Inventory Agent saves** to kitchen.

## Tools

| Tool | Purpose |
|------|---------|
| `query_menu` | Cues, dish search, suggested/active, promotion_targets |
| `query_inventory` | Expiring stock, pantry search for recipe ingredients |

## Spec files

- [x] `profile.yaml` — ideation + recipe drafting role
- [x] `instructions.md` — general ingredient names; delegate saves to Inventory
- [x] `tasks.yaml` — cue, expiry, promotion, named-dish workflows
- [x] `evals/README.md` — placeholder for golden conversations
- [x] Synced `dashboard-chat.ts` + `dashboard-chat-context.ts` + chat route createExtras
- [x] Updated repo `agents/creative.md`

## Ownership split

| Creative | Business | Inventory |
|----------|----------|-------------|
| Draft promotional **recipes** | Which dishes to promote (sales data) | Persist saves |
| **Suggested add-ons for dishes** | — | `create_addon`, `link_addon_ingredients` |
| Expiry-driven recipe ideas | Price/margin/reorder advice | `add_suggested_dish`, recipe build pipeline |
| Cue/season/weather specials | — | Images, catalog CRUD |

## Chef-facing behavior

Kitchen-build and suggestion confirms on Create tab → runner **coerces to Inventory**.

Head supervisor consults **Creative** for recipe and **suggested add-on** drafts; **Inventory** for catalog writes.
