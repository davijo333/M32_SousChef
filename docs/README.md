# Documentation

Reference for the Sous Chef app.

| Folder | Contents |
|--------|----------|
| [Agentic_Tools/](./Agentic_Tools/) | Sous Chef + specialist agents: flows, queries, tools, deployment |
| [UI/](./UI/) | Pages, routes, and user flows |
| [Agents/](./Agents/) | Python FastAPI workers on `:8000` (bill parse, images, recipe link) |
| [DB/](./DB/) | MongoDB collections and fields |
| [Inventory/](./Inventory/) | Dishes, add-ons, ingredients (with samples) |
| [Recipes/](./Recipes/) | Classifications, workflow, test recipes |

## Terminology

| User-facing | Internal (code / DB) |
|-------------|----------------------|
| Purchase order | `billType: "supplier"`, `BillUpload` |
| Sales order | `billType: "customer"`, `BillUpload` |
| Upload orders | Route `/upload-orders`, API `/api/bills/*` |
| Signature Sandwich | `classification: "sandwich"` |
| BYO Sandwich | `classification: "byo-sandwich"` |
| Sous Chef | Chat context `head`, icon `head_chef` |

Upload accepts **PDF or PNG** wholesaler invoices and POS receipts (e.g. `Bill-1_Sysco.pdf`, `3.c_bill.pdf`).

## Test data

- **Pricing:** `python3 test/scripts/recalculate-pricing.py` — food cost + sell prices from PO data
- **Bills:** `npm run regenerate:bills` — see [test/scripts/README.md](../test/scripts/README.md)
- **Demo kitchen:** Dashboard → Load test data, or `POST /api/seed?force=1`

Catalog source of truth: [test/inventory/](../test/inventory/) (Panera Cafe fixture).
