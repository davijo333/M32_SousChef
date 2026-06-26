# Golden conversation evals

One YAML fixture per workflow under `fixtures/`. Run with `pytest evals/` or dedicated runner.

## Fixture format

```yaml
name: add_dish_confirm_recipe
workflow: add_dish_from_chat
from_step: confirm_recipe
turns:
  - role: user
    content: "Yes, go ahead with the recipe"
assert:
  consult_order: [inventory]
  next_step: confirm_finalize
  single_question: true
  no_hallucinated_write: true
```

## Priority workflows to eval first

1. `add_dish_from_chat` — pick → draft → confirm → finalize
2. `update_dish` — price change with confirm gate
3. `inventory_stock_query` — read-only, no extra questions
4. `add_addon_from_chat` — Inventory only, no Creative

Migrate scenarios from archived head evals on git branch `v0`.
