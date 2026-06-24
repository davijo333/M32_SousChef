# Kitchen control

See [UI README](./README.md#kitchen-control).

**Files:**

- `apps/web/src/app/kitchen-control/page.tsx`
- `apps/web/src/components/KitchenCard.tsx`
- `apps/web/src/components/KitchenIngredientModal.tsx`

The modal loads full ingredient detail from the kitchen list (including `imageCandidates` and `selectedImageIndex`). Saving updates MongoDB and refreshes the card image when the default selection changes.
