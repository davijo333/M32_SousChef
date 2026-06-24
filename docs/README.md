# Documentation

Reference for the active Sous Chef app.

| Folder | Contents |
|--------|----------|
| [Agentic_Tools/](./Agentic_Tools/) | Multi-agent chat: flows, queries, tools, LangGraph deployment |
| [UI/](./UI/) | Pages, routes, and user flows |
| [Agents/](./Agents/) | Python FastAPI workers on `:8000` |
| [DB/](./DB/) | MongoDB collections and fields |
| [Inventory/](./Inventory/) | Dishes, add-ons, ingredients (with samples) |
| [Recipes/](./Recipes/) | Classifications, workflow, test recipes |

## Terminology

| User-facing | Internal (code / DB) |
|-------------|----------------------|
| Purchase order | `billType: "supplier"`, `BillUpload` |
| Sales order | `billType: "customer"`, `BillUpload` |
| Upload orders | Route `/upload-orders`, API `/api/bills/*` |

Upload accepts **PDF or PNG** wholesaler invoices and POS receipts (e.g. `Bill-1_Costco.pdf`, `3.c_bill.pdf`).

## Test data

- Generate bills: `npm run regenerate:bills` (see [test/scripts/README.md](../test/scripts/README.md))
- Load demo kitchen: Dashboard → Load test data, or `POST /api/seed?force=1`
