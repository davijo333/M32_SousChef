# Workflows — runtime source of truth

YAML in `catalog/` is **loaded at startup** and drives routing, gates, and worker delegation.

| Folder | Purpose |
|--------|---------|
| `catalog/` | Machine-readable workflow definitions |
| `engine/` | Loader, state types, step resolver, transitions |
| `schema/` | JSON schema for validating catalog YAML |
| `docs/` | Human walkthroughs per workflow family |

Historical golden markdown specs (pre-v1) are preserved on git branch **`v0`**.

Walkthroughs: [add dish](docs/add-dish-from-chat.md) · [updates](docs/update-workflows.md) · [queries](docs/query-workflows.md) · [bills](docs/bill-workflows.md)

## Catalog files

```
catalog/
  shared.yaml
  addition-dish.yaml
  addition-ingredient.yaml
  addition-addon.yaml
  update-dish.yaml
  update-ingredient.yaml
  update-addon.yaml
  update-link.yaml
  query-inventory.yaml
  query-business.yaml
  query-creative.yaml
  triage.yaml
  bills.yaml
```

The loader merges **every** `catalog/*.yaml` into one workflow index.

## Step fields

| Field | Meaning |
|-------|---------|
| `id` | Step key in `workflowState.stepId` |
| `actor` | `sous_chef` — present/confirm; no DB writes |
| `delegate` | Workers to run: `inventory`, `business`, `create` |
| `gate` | Blocks until chef confirms |
| `task_template` | Worker prompt for this step (`{locked_name}` placeholders) |
| `on_confirm` / `on_reject` | Next step id |
| `sub_workflow` | Nested flow (e.g. missing ingredient) |
| `implementation: batched` | Multiple tools in one worker turn |

Engine implementation: `workflows/engine/executor.py` — resolve step, gate transitions, advance after consult.
