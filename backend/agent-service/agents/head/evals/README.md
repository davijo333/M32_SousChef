# Sous Chef golden workflows

Predictable multi-step flows live in **[golden-workflows.yaml](./golden-workflows.yaml)**.

Use this file when implementing Head `routing.md`, `cards.yaml`, and evals — each workflow `id` should map to orchestration rules in `orchestration.py` and consult order in `graph.py`.

## Format

| Field | Meaning |
|-------|---------|
| `steps[].order` | Strict sequence — one step per Head turn or consult |
| `gate` | Blocks until chef confirms or provides input |
| `delegate` | Specialist that runs tools for that step |
| `implementation: batched` | Logical step exists but runs inside one backend call today |

## Workflow index

See `workflow_index` in [golden-workflows.yaml](../golden-workflows.yaml) for the full catalog grouped by:

- **catalog_create** — dish, add-on, ingredient, suggested lite
- **catalog_update** — update + link workflows
- **bills** — upload PO/SO, mixed batch, process
- **creative** — expiry / promotion specials
- **business** — margin, reorder advice
- **triage** — daily snapshot, specialist handoff

**Classification:** all creates require confirmed class/category — see `classification_policy` in the yaml.

See yaml for full step list. Target chain:

**Head** intake → image context → confirm dish → **Creative** recipe → confirm recipe → **Inventory** plan → store picks (if needed) → confirm finalize → **Inventory** persist (ingredients, images, dish, links) → **Head** completion summary.

## Evals (TODO)

Add one yaml per workflow under `evals/`:

```yaml
workflow: add_dish_from_chat
from_step: confirm_dish_identity
turns:
  - role: user
    content: Yes, call it House Latte — go ahead with the recipe
assertions:
  - consult_order: [creative, inventory]
  - no_hallucinated_write: true
```
