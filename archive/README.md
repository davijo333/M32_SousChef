# Archive

Full Sous Chef codebase before supplier-only slim-down (June 2026).

## Contents

| Path | What |
|------|------|
| `docs/` | Full product, agent, and tech documentation |
| `test/` | Seed JSON, bill fixtures, convert-usage tests |
| `web/` | Removed pages (chat, dashboard, recipes, customer bills, seed API, …) |
| `agent/` | Customer parser, recipe linker/researcher, legacy bill parser |

## Active app (repo root)

- **Upload purchase orders** — `apps/web/src/app/upload-orders/`
- **Ingredients pantry** — `apps/web/src/app/kitchen-control/`
- **Agents** — `services/agent/` (1a supplier parser + 2a normalizer)
- **Inventory ingest** — `apps/web/src/lib/kitchen-inventory.ts`

Restore anything from here by copying back into the active tree.
