# User Flows — Agentic Chat

Flows for the dashboard **section tabs**, floating **Sous Chef** dock, and specialist handoff.

## Actors

| Actor | Description |
|-------|-------------|
| **Owner / Chef** | Logged-in user |
| **Sous Chef** | Supervisor — `query_kitchen`, `orchestrate` |
| **Inventory Assistant** | `query_inventory`, `apply_inventory`, `upload_bills` |
| **Business Assistant** | `query_business`, `apply_business` |
| **Creative Assistant** | `query_menu`, `apply_menu` |

## UI primitives (shipped)

- **Dashboard sections** — Inventory · Business · Create (agent branding per section)
- **Sous Chef dock** — fixed bottom center on dashboard; expand/collapse chat
- **Connect to … Agent** — on assistant messages when handoff is suggested
- **Connect back to Sous Chef** — below dock avatar when connected to a specialist
- **Saved chats** — up to 5 sessions
- **Attachments** — up to 5 PDF/image files per message (Sous Chef only; pre-parse via UI)

---

## Flow 1 — Default: Ask Sous Chef

**Goal:** One front door on the dashboard.

1. User opens **Dashboard** → Sous Chef dock at bottom
2. User expands dock and asks in plain English
3. Sous Chef replies using `query_kitchen` / supervisor consult, or suggests connecting to a specialist
4. Conversation saved under `context: head`

**Success:** Accurate answer without leaving the dashboard.

---

## Flow 2 — Cross-domain question (consultation-style)

**Example:** “What’s low stock and which dishes have the best margins?”

1. User → Sous Chef
2. Supervisor classifies → consults Inventory + Business via core tools → synthesizes one answer
3. Dock stays on Sous Chef (no section change)

*Planned:* collapsible “Kitchen discussion” showing per-specialist sub-replies.

---

## Flow 3 — Handoff via Connect button (shipped)

**Example:** “Connect me to the Creative Agent for menu ideas.”

1. User → Sous Chef
2. Sous Chef suggests Creative Agent; message includes **Connect to Creative Agent**
3. User taps Connect → dashboard switches to **Create**, dock avatar → Creative, `agentContext` set
4. Next messages route to Creative with full prior history
5. User taps **Connect back to Sous Chef** → section can stay on Create; routing returns to Sous Chef

---

## Flow 4 — Direct section (manual override)

**Goal:** User picks a specialist without going through Sous Chef.

1. User taps **Inventory** (or Business / Create) section on dashboard
2. User chats in dock — messages use that section’s core tools
3. Wrong-domain question → agent nudges to switch section or ask Sous Chef

---

## Flow 5 — Expiring ingredients → special → save

**Example:** “Spinach is expiring. What should we run?”

1. User → Sous Chef or **Connect to Creative Agent**
2. Creative uses `query_menu` → drafts a short menu name + description
3. User: “add it” / “save it” → `apply_menu(action="add_suggested_dish")` with confirm
4. Dish appears on **Recipes → Suggested**; recipe pipeline may run in background

---

## Flow 6 — Inventory operations

**Example:** “What should I reorder first?” / “Process that Sysco bill”

- **Read:** `query_inventory` (low_stock, expiring, purchase_queue, …)
- **Write:** `apply_inventory` previews → chef confirms → `pending_action` → Next.js ingests bill or updates reorder threshold
- **Sous Chef:** answer from context, or Connect to Inventory Agent
- **Inventory section:** direct chat with inventory tools

---

## Flow 7 — Business review

**Example:** “How did we do this month?” / “Process sales receipts”

1. Business section or Sous Chef with business context
2. `query_business` for sales, purchases, margins
3. `apply_business(action="process_sales_bills")` after chef confirms (purchase bills processed first)

---

## Flow 8 — Creative brainstorm → confirm save

**Example:** “Suggest a cozy drink for today’s weather” → “add it”

1. `query_menu(action="cues")` + pantry context
2. Draft short name + POS description
3. User confirms → `apply_menu` → `create-suggestion.ts` → `recipeStatus: suggested`

---

## Flow 9 — Bridge to app pages

**Example:** “Where do I upload purchase orders?”

1. Sous Chef explains **Upload orders** flow
2. User navigates to `/upload-orders` (or Kitchen control / Recipes)

---

## Flow 10 — Session memory

**Example:** “My name is David” → later “What is my name?”

- Same `conversationId`, history in chat API (last N messages)

---

## Flow 11 — New chat & session limits

- **New chat** — up to 5 saved sessions
- Oldest sessions pruned when limit exceeded

---

## Flow 12 — Upload orders (primary bill path)

**Goal:** Ingest purchase and sales bills.

1. User goes to **Upload orders**
2. Queue up to **10** PDF/PNG files (one parse at a time)
3. **Process** purchase orders first, then sales orders
4. New dishes/add-ons → Kitchen control / Recipes

Chat equivalent: ask Inventory/Business to process by bill ID after upload (`apply_inventory` / `apply_business`).

---

## Flow 13 — Chat attachments (shipped)

**Today:** up to 5 files in Sous Chef composer → each attachment is **auto-identified** as purchase order or sales receipt (consistent POS filename pattern for SOs; wholesaler-style names for POs; vision fallback for random PO scans). Sous Chef **lists what it identified** and asks you to **confirm**. On confirm, **purchase orders process first** (Inventory), then **sales receipts** (Business).

**Planned:** agent-side file bytes parse without UI pre-step.

---

## Flow priority

| Priority | Flow |
|----------|------|
| P0 (shipped) | 1, 3, 4, 5, 6, 7, 8, 10, 11, 12 |
| P1 | 2, 9 |
| P2 | 13 — bill IDs from attachments + full agent-side parse |
