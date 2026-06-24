# UI pages

## Dashboard

**Route:** `/dashboard`

Overview cards for the kitchen:

- Total ingredients in pantry
- Pending purchase orders awaiting Process
- Confirmed / processed orders count
- Low-stock and expiring-soon ingredient counts

**API:** `GET /api/dashboard`

---

## Upload orders

**Route:** `/upload-orders` (legacy redirect from `/upload-bills`)

### Layout

1. **Upload zone** (top) — always clear and ready for new files. Shows only in-flight uploads (queued, parsing, ready to Process).
2. **PO table** (below) — processed purchase orders only, with PO ID, filename, dates, and line items.

**Flow:**

1. Drop up to 5 files — each is sent to `POST /api/bills/parse`
2. Agent parses lines, normalizes names, fetches 2 images per new item
3. A **PurchaseOrder** record is created (`status: parsed`)
4. Review parsed lines; click **Process** to confirm stock
5. On Process, ingredients are upserted and PO moves to `processed`

**API:** `POST /api/bills/parse`, `POST /api/bills/confirm`, `GET /api/bills/session`

---

## Kitchen control

**Route:** `/kitchen-control`

Pantry grid of ingredients from processed purchase orders. Tap a card to open the **ingredient detail modal**.

### Ingredient modal fields

| Field | Editable | Source |
|-------|----------|--------|
| UID / SKU | Yes | Agent (`sku` from order line) or slug fallback |
| Slug | Read-only | Internal stable id |
| Name | Yes | Agent normalizer + manual |
| Brand | Yes | Vendor / manual |
| Quantity | Yes | Sum from Process + manual |
| Reorder level | Yes | Default 1 on create + manual |
| Last ordered price | Yes | Last order line unit price |
| Last ordered quantity | Yes | Last order line qty |
| Images (2) | Select default | Agent image suggestions, stored in R2 |

**Save:** `PATCH /api/catalog/ingredients/[slug]`

**API:** `GET /api/kitchen`

---

## Login / Sign up

**Routes:** `/login`, `/signup`

Email + password auth via NextAuth. Each user belongs to one restaurant (kitchen).

**API:** NextAuth handlers under `/api/auth/*`
