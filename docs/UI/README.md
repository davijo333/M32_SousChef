# UI pages

## Dashboard

**Route:** `/dashboard`  
**File:** `apps/web/src/app/dashboard/page.tsx`

Three sections, each with a dedicated assistant chat (up to 5 saved sessions per context):

| Section | Focus |
|---------|--------|
| **Inventory** | Low stock, expiring ingredients, pantry assistant |
| **Business** | Sales & margin analytics, finance assistant |
| **Create** | Recipe ideas and suggestions (saved to Recipes → Suggested) |

**API:** `GET /api/dashboard`, `GET/POST/DELETE /api/dashboard/chat`

---

## Upload orders

**Route:** `/upload-orders` (legacy redirect from `/upload-bills`)

Tabs: **Purchase orders** (supplier invoices) and **Sales orders** (POS receipts).

### Layout

1. **Upload zone** — queue up to **10** files; parses one at a time; shows ready-to-process list.
2. **Processed table** — orders after **Process** (PO or SO history with line items).

**Flow:**

1. Choose PDF/PNG files → `POST /api/bills/parse`
2. Agent parses lines, normalizes names, suggests images for new catalog items
3. Click **Process** → stock updated (purchase) or sales recorded (customer)
4. New dishes may trigger recipe linking on Kitchen control / Recipes

**API:** `POST /api/bills/parse`, `POST /api/bills/confirm`, `GET /api/bills/session`

---

## Kitchen control

**Route:** `/kitchen-control`

Pantry grid, menu dishes, and add-ons. Tap a card for the detail modal (quantities, links, default/secondary photos).

**API:** `GET /api/kitchen`, `PATCH /api/catalog/*`

---

## Recipes

**Route:** `/recipes`

Tabs: New, Active, Suggested, Inactive. Suggested cards show agent notes; **Accept** / **Reject** / **Revive** change status.

**API:** `GET /api/recipes`, dish/add-on catalog routes

---

## Login / Sign up

**Routes:** `/login`, `/signup`

Email + password via NextAuth. Kitchen name is set after signup (Nav → click name to edit).

**API:** NextAuth under `/api/auth/*`
