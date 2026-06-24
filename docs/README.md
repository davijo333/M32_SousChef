# Documentation

Human-readable reference for the active Sous Chef app (purchase orders + ingredients).

| Folder | Contents |
|--------|----------|
| [UI/](./UI/) | Pages, routes, and user flows |
| [Agents/](./Agents/) | Python FastAPI workers on `:8000` |
| [DB/](./DB/) | MongoDB collections and fields |

Historical docs for the full pre-slim app live in [`archive/docs/`](../archive/docs/).

## Terminology

| User-facing | Internal (code / DB) |
|-------------|----------------------|
| Purchase order | `billType: "supplier"`, `BillUpload` |
| Sales order | `billType: "customer"` (archive / future) |
| Upload orders | Route `/upload-orders`, API `/api/bills/*` |

Filename markers `.s_bill.` (purchase) and `.c_bill.` (sales) are unchanged for test file compatibility.
