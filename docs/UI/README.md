# UI pages

## Dashboard

**Route:** `/dashboard`  
**File:** `apps/web/src/app/dashboard/page.tsx`

Three **section tabs** (each with agent header + branding):

| Section | Agent | Focus |
|---------|--------|--------|
| **Inventory** | Inventory Agent | Low stock, expiring ingredients, pantry stats |
| **Business** | Business Agent | Sales, margins, purchases, kitchen insights |
| **Create** | Creative Agent | Daily cues, specials inspiration |

### Sous Chef chat dock

Fixed **bottom-center** on the dashboard (`SousChefChatDock`):

- One shared chat across all sections (context `head` in API)
- Up to **5 saved sessions** per user
- Attach up to **5 files** (PDF/image) per message — parsed via `/api/bills/parse`
- **Connect to … Agent** buttons when Sous Chef suggests a specialist; switches dashboard section + specialist context with full conversation history
- **Connect back to Sous Chef** restores supervisor routing; dock avatar updates to match active agent
- Creative cues shown when on Create section or connected to Creative Agent

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
2. Agent parses lines, normalizes names, infers classification (`sandwich`, `byo-sandwich`, `coffee`, …)
3. Click **Process** → stock updated (purchase) or sales recorded (customer)
4. New dishes may trigger recipe linking on Kitchen control / Recipes

**API:** `POST /api/bills/parse`, `POST /api/bills/confirm`, `GET /api/bills/session`

---

## Kitchen control

**Route:** `/kitchen-control`

Pantry grid, menu dishes, and add-ons grouped by **class** and subclass. Cards show image + name; double-click (dishes) or click (ingredients) opens the detail modal.

Dish class presets include **Signature Sandwich** (`sandwich`) and **BYO Sandwich** (`byo-sandwich`).

**API:** `GET /api/kitchen`, `PATCH /api/catalog/*`

---

## Recipes

**Route:** `/recipes`  
**File:** `apps/web/src/app/recipes/page.tsx`

Tabs: **New**, **Active**, **Suggested**, **Inactive**.

| Tab | UI |
|-----|-----|
| New / Suggested / Inactive | Recipe tiles grouped by dish class; click tile → detail modal |
| Active / Inactive | **Search for Recipe** + **class multiselect** filters |

Tiles show **image + name** only. Modal shows sell price, food cost, margin, ingredients, and actions (**Activate**, **Accept/Reject**, **Revive**, **Retire**).

Suggested dishes use short menu names (no supplier brands in title); brands belong in description and notes.

**API:** `GET /api/recipes`, `POST /api/recipes/status`

---

## Login / Sign up

**Routes:** `/login`, `/signup`

Email + password via NextAuth. Kitchen name from signup is stored on the user session for agent greetings.

**API:** NextAuth under `/api/auth/*`

See [login-signup.md](./login-signup.md).
