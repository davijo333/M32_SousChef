# 2b — Dish Inventory Agent

See full spec: [`docs/agents/2b-dish-inventory/README.md`](../../../docs/agents/2b-dish-inventory/README.md)

- **Input:** 1b parsed lines + current Ingredient inventory
- **Output:** Dish_Inventory rows, active recipe links, Sales_Order rows, availability
- **Code:** `recipe_researcher.py`, `recipe_linker.py`; web: `kitchen-inventory.ts`
