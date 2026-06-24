# Implementation stages

What to build in each stage, in order. Target: **2-day MVP** with a shippable path every stage.

Agent pipeline reference: [agents/README.md](../agents/README.md).

---

## Stage 1 — Skeleton

**Goal:** Auth, empty restaurant, seeded demo data, chat shell, Inventory Engine core — demo works without bill upload.

### Deliverables

| Area | Tasks |
|------|-------|
| **Repo** | Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui |
| **Database** | MongoDB Atlas (`sous_chef`), Mongoose models: User, Restaurant, Ingredient, MenuItem, DishIngredient, Conversation, Message |
| **Auth** | Signup, login, logout (credentials); create Restaurant on signup |
| **Seed** | Load `test/ingredients.json`, `test/menu-items.json` for demo diner **Sunrise Diner** |
| **Inventory Engine (3)** | `usageToInventoryQty`, `scaleQty`, `deductForOrderLine` — port from `test/convert-usage.ts` |
| **Pages** | Login/Signup, Dashboard (empty + seeded + embedded chat) |
| **Chat (4)** | Persist messages; sliding window context; basic LLM reply (tools stubbed) |
| **Deploy** | Vercel live URL (even if AI service is localhost initially) |

### Agents involved

- **3 Inventory Engine** — implement first (no LLM)
- **4 Chat Copilot** — UI + persistence; tools can return seed data

### Exit criteria

- [ ] User signs up → sees Sunrise Diner seed data on dashboard
- [ ] Chat retains name within one session (*"My name is David"* test)
- [ ] `get_inventory_status` tool returns bacon qty from seed

### Pages

[login-signup](../pages/login-signup.md) · [dashboard](../pages/dashboard.md) · [chat](../pages/chat.md)

---

## Stage 2 — Bills

**Goal:** Upload supplier/sales bills → parse → review → save to ingredients or menu items.

### Deliverables

| Area | Tasks |
|------|-------|
| **Upload UI** | Bill type toggle, file upload, progress state |
| **1a Bill Parser** | FastAPI + LangGraph node; vision LLM → `BillLineItem[]` JSON |
| **1b Item Normalizer** | Fuzzy match, unit normalize, merge suggestions |
| **Review screen** | Confirm / edit / skip lines; confidence badges |
| **Ingest** | On confirm → upsert Ingredient or MenuItem via Inventory Engine |
| **Bill history** | List uploads with status `pending_review` \| `confirmed` |
| **API** | `POST /bills/upload`, `GET /bills/:id/review`, `POST /bills/:id/confirm` |

### Agents involved

- **1a Bill Parser**
- **1b Item Normalizer**
- **3 Inventory Engine** — `ingestSupplierLine`, sales line handling

### Exit criteria

- [ ] Upload sample Sysco image → review screen with parsed lines
- [ ] Confirm → new ingredients appear in pantry
- [ ] Sales receipt → new menu items appear
- [ ] `manual_override` fields not overwritten on re-upload

### Pages

[upload-bills](../pages/upload-bills.md)

### FastAPI service

- Deploy LangGraph ingest graph on Render
- Next.js API routes proxy to agent service (SSE optional in Stage 4)

---

## Stage 3 — Linking & chat tools

**Goal:** Menu ↔ ingredient links, override UI, chat answers with real tool data.

### Deliverables

| Area | Tasks |
|------|-------|
| **2b Dish Inventory** | Recipe research + link dishes to pantry ingredients |
| **Overrides UI** | Link editor, ingredient qty/expiry, per-serving weights |
| **Chat tools** | Wire inventory and margin tools (deferred) |
| **Tenancy** | All APIs filter by `restaurantId` from session |
| **Depletion** | Customer Process → deduct via recipe links + sizes + add-ons |

### Agents involved

- **2a Ingredient Normalizer** — supplier path
- **2b Dish Inventory** — customer path + recipe links
- **4 Chat Copilot** — tool loop in LangGraph

### Exit criteria

- [ ] Fix a wrong agent link in overrides → chat uses corrected qty
- [ ] *"How much bacon do we have left?"* returns seed/tool number
- [ ] *"What should I reorder?"* returns list from engine
- [ ] Refused query: *"Show Joe's Café inventory"* → polite scope message

### Pages

[kitchen-control](../pages/kitchen-control.md) · [dashboard](../pages/dashboard.md)

---

## Stage 4 — Polish & impress

**Goal:** Production feel, bonus features, reliable demo.

### Deliverables

| Area | Tasks |
|------|-------|
| **Dashboard** | Expiring soon, low stock, unlinked items, recent bills |
| **Chat UX** | SSE streaming, visible tool steps (*Checking inventory…*) |
| **Google OAuth** | NextAuth Google provider (bonus) |
| **Composio** | Export reorder list to Google Sheets (bonus) |
| **Cold start** | Empty restaurant path works alongside seed demo |
| **README** | Architecture diagram, demo script, env setup |
| **Hardening** | Error states, mobile-friendly, loading/empty states |

### Agents involved

- All agents production-hardened
- **4 Chat Copilot** — deferred; see [Agents](../agents/README.md)

### Exit criteria

- [ ] Live URL: Vercel + Render
- [ ] 30-second demo: upload bill OR seed → chat reorder question
- [ ] Dashboard shows spinach expiring (seed date)
- [ ] Google OAuth or Composio (at least one bonus)

### Pages

[dashboard](../pages/dashboard.md)

---

## Stage map vs agent pipeline

| Build stage | Agent stages used |
|-------------|-------------------|
| 1 Skeleton | 3, 4 (stub) |
| 2 Bills | 1a, 1b, 3 |
| 3 Linking | 2a, 2b, 3, 4 |
| 4 Polish | all |

---

## Out of scope (post-assessment)

- POS integration (Square, Toast)
- Multi-location per user
- Chat mutations (set stock via chat)
- Email verification / password reset

## Related

- [Architecture](./architecture.md)
- [Tech stack](./stack.md)
- [Product overview](../product/overview.md)
