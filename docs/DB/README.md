# Database (MongoDB)

Connection: `MONGODB_URI` → database `sous_chef` (see `apps/web/src/lib/mongodb.ts`).

Models live in `apps/web/src/models/`. No SQL migrations — schema is Mongoose.

| Collection | Doc |
|------------|-----|
| Ingredient | [ingredient.md](./ingredient.md) |
| PurchaseOrder | [purchase-order.md](./purchase-order.md) |
| BillUpload | [bill-upload.md](./bill-upload.md) |
| User, Restaurant | [user-restaurant.md](./user-restaurant.md) |

Reset dev data: `npm run reset:db`
