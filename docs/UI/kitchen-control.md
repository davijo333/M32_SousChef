# Kitchen control

See [UI README](./README.md#kitchen-control).

**Files:**

- `apps/web/src/app/kitchen-control/page.tsx`
- `apps/web/src/components/KitchenCard.tsx`
- `apps/web/src/components/MenuFiltersBar.tsx`
- `apps/web/src/components/PantryFiltersBar.tsx`
- `apps/web/src/components/KitchenIngredientModal.tsx`

## Menu filters

The **Menu** tab has filters above the dish and add-on cards.

## Compare View

Side-by-side **Dishes**, **Add-ons**, and **Pantry**. Each column has its own filters **inside** the card:

- **Dishes** (left) — dish-only search, class, recipe status, recipe link
- **Add-ons** (left, second card) — independent add-on filters
- **Pantry** (right) — brand, department, category, status

Clicking a dish filters the pantry to that dish’s linked ingredients.

## Pantry filters

The **Pantry** tab has filters above the pantry card.

Department, category, brand, and status (active / inactive / required).

The modal loads full ingredient detail from the kitchen list (including `imageCandidates` and `selectedImageIndex`). Saving updates MongoDB and refreshes the card image when the default selection changes.

Linking ingredients on a dish triggers the Recipe Agent to build a priced recipe (see [Recipe workflow](../Recipes/workflow.md)).
