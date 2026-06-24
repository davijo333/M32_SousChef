# 2a — Ingredient Normalizer

See full spec: [`docs/agents/2a-ingredient-normalizer/README.md`](../../../docs/agents/2a-ingredient-normalizer/README.md)

- **Input:** 1a parsed lines + existing Ingredient DB
- **Output:** Normalized names, 2 images → R2, Purchase_Order rows, Kitchen updates
- **Code:** `item_normalizer.py`, `image_suggestions.py`; web: `kitchen-inventory.ts`
