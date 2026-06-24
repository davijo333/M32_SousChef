# Documentation

Human-readable reference for the active Sous Chef app (purchase orders + ingredients).

| Folder | Contents |
|--------|----------|
| [UI/](./UI/) | Pages, routes, and user flows |
| [Agents/](./Agents/) | Python FastAPI workers on `:8000` |
| [DB/](./DB/) | MongoDB collections and fields |
| [Inventory/](./Inventory/) | Dishes, add-ons, ingredients (with samples) |
| [Recipes/](./Recipes/) | Classifications, workflow, test recipes |

Historical docs for the full pre-slim app live in [`archive/docs/`](../archive/docs/).

## Terminology

| User-facing | Internal (code / DB) |
|-------------|----------------------|
| Purchase order | `billType: "supplier"`, `BillUpload` |
| Sales order | `billType: "customer"` (archive / future) |
| Upload orders | Route `/upload-orders`, API `/api/bills/*` |

Upload accepts any **PDF or PNG** wholesaler or POS file (e.g. `Bill-1_Costco.pdf`). Legacy test sales files may use `.c_bill.` in the name.
