# Add-on

Collection: `addons`

Model: `apps/web/src/models/AddOn.ts`

| Field | Type | Notes |
|-------|------|-------|
| `restaurantId` | ObjectId | Tenant |
| `slug` | string | Unique per restaurant |
| `name` | string | Modifier name |
| `classification` | string | Usually `addon` |
| `sellPrice` | number | Modifier price |
| `linkedDishSlugs[]` | string[] | Dishes ordered with this modifier |
| `ingredientLinks[]` | subdoc | Recipe lines |
| `recipeStatus` | string | `new`, `active`, `inactive`, `suggested` |
| `source` | string | e.g. `bill_upload` |

## Related docs

- [Inventory: add-ons](../Inventory/add-ons.md)
