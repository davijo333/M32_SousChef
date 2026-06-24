# User Flows — Agentic Chat

Flows for the floating **Sous Chef** dock (bottom center), **4-agent tab bar**, and multi-party transcript.

## Actors

| Actor | Description |
|-------|-------------|
| **Owner / Chef** | Logged-in user (SMB owner persona) |
| **Sous Chef** | Supervisor — routes, consults, handoffs, synthesizes |
| **Inventory Assistant** | Stock, expiry, reorder, purchase bills |
| **Business Assistant** | Sales, margins, purchases, sales bills |
| **Creative Assistant** | Specials, menu ideas, save suggestions |

## UI primitives

- **Floating dock** — fixed bottom center; page content scrolls behind
- **4 tabs** — Sous Chef · Inventory · Business · Creative (manual override)
- **Collapsed / expanded** — compact bar vs full chat with messages
- **Transcript kinds** — user message, agent message, consultation block, delegation banner, system switch

---

## Flow 1 — Default: Ask Sous Chef (auto-route)

**Goal:** One front door; user does not pick a specialist.

1. User opens app (any page) → dock collapsed at bottom center
2. User expands dock → tab **Sous Chef** selected by default
3. User asks a question in plain English
4. Sous Chef classifies intent → consults one or more specialists (internal) OR handoffs
5. User sees reply (+ optional collapsed “Kitchen discussion”)
6. Conversation saved under Sous Chef context

**Success:** User gets an accurate answer without switching tabs.

---

## Flow 2 — Consultation (Sous Chef oversees, user stays with Chef)

**Goal:** Cross-domain question; specialists work behind the scenes.

**Example:** “What’s low stock and which dishes have the best margins?”

1. User → Sous Chef (Sous Chef tab)
2. Sous Chef → consult Inventory (low stock, expiry)
3. Sous Chef → consult Business (top margins)
4. UI shows **consultation block** (collapsible)
5. Sous Chef → single synthesized answer to user
6. Tab stays on **Sous Chef**

---

## Flow 3 — Handoff (specialist talks to user)

**Goal:** Deep dive in one domain.

**Example:** “Walk me through sales for the past month.”

1. User → Sous Chef
2. Sous Chef → `handoff_to_business` + delegation banner
3. **Tab auto-syncs** to Business
4. User’s next messages → Business agent + business tools only
5. User taps **Return to Sous Chef** or switches Sous Chef tab

---

## Flow 4 — Manual tab override (direct mode)

**Goal:** User picks a specialist; bypasses supervisor.

1. User expands dock → taps **Inventory** (or Business / Creative)
2. System line: `── Switched to Inventory Assistant ──`
3. User asks → only that agent + its tools
4. Wrong-domain question → agent nudges to switch tab or ask Sous Chef

**Shortcuts:** Dashboard section buttons may open dock with tab pre-selected.

---

## Flow 5 — Cross-domain: expiring ingredients → special → save

**Example:** “Spinach is expiring and lunch was slow. What should we run?”

1. User → Sous Chef
2. Consult Inventory (expiring spinach, qty)
3. Consult Business (slow lunch / weak categories)
4. Sous Chef proposes special; asks to save
5. User: “Yes, add it”
6. Consult Creative OR handoff with confirm → `add_suggested_dish`
7. Recipe pipeline may run in background
8. Sous Chef confirms + optional `navigate_to(recipes)`

---

## Flow 6 — Inventory operations (reorder focus)

**Example:** “What should I reorder first?”

- **Sous Chef:** consult Inventory → prioritized list
- **Direct Inventory tab:** tool loop on low stock + last purchase dates

---

## Flow 7 — Business review (weekly check-in)

**Example:** “How did we do this month?”

1. Business tab OR Sous Chef with `financeView` (week / month)
2. Sales, purchases, gross profit, top dishes, margin callouts
3. Clarify: supplier purchases = pantry restock, not per-ticket COGS

---

## Flow 8 — Creative brainstorm → confirm save

**Example:** “Suggest a cozy soup for today’s weather” → “add it”

1. Read cues + pantry
2. Draft dish name + POS description
3. User confirms → `add_suggested_dish` only when confirm detected

---

## Flow 9 — Chat points user to app action (bridge)

**Example:** “Take me to upload orders”

1. Sous Chef → `navigate_to(upload-orders)` or brief upload-flow help
2. User continues in main app UI

---

## Flow 10 — Session memory (M32 basic)

**Example:** “My name is David” → “What is my name?”

- Same `conversationId`, same selected agent tab
- History in agent loop (last N messages)

---

## Flow 11 — New chat & session limits

- **New chat** — max N saved sessions per context
- New Sous Chef chat → tab defaults to Sous Chef

---

## Flow 12 — Specialist asks Sous Chef for another domain (optional)

**Example:** On Inventory tab: “Which low items sell the most?”

- Inventory → `request_business_context` OR nudge to Business / Sous Chef

---

## Flow 13 — Upload orders via chat (max 10 files)

**Goal:** User attaches bills in Sous Chef; files hand off to Upload orders tabs.

### Constraints (match Upload orders page)

- **Max 10 files** per batch (PDF or PNG) — `MAX_STAGED_UPLOADS` in `BillUploadZone`
- **Parse queue:** one file at a time (sequential)
- **Types:** purchase (`supplier`) vs sales (`customer`)
- **Process** requires user confirm
- **Order:** purchase before sales when both present

### Steps

1. User attaches 1–10 files in Sous Chef composer
2. Sous Chef classifies each file (auto or asks if unclear)
3. For each file: `POST /api/bills/parse` with correct `billType`
4. **Handoff rule — files leave Sous Chef chat:**
   - Bills persist in `BillUpload` → **Upload orders** (Purchase or Sales tab)
   - Sous Chef composer **clears attachments**
   - Thread records **delegation message only** (agent, count, filenames, deep link)
   - No file chips or blobs in Sous Chef history
5. Sous Chef message example:

   > Handed 2 purchase orders to Inventory Assistant. Review on **Upload orders → Purchase orders**.  
   > Handed 1 sales receipt to Business Assistant. **Upload orders → Sales orders**.

6. Optional: `navigate_to(upload-orders?tab=sales)`
7. User continues on Upload orders OR with Inventory/Business agent (by `billId` / filename, not re-attached files)

### Mixed batch transcript

```
You: [attached 4 files]

Sous Chef: Got 4 files — 2 purchase invoices, 2 POS receipts.
           They're on Upload orders (Purchase and Sales tabs).

  [Open Upload orders]
```

### Direct-mode uploads

| Tab | Behavior |
|-----|----------|
| Sous Chef | Classify + hand off automatically |
| Inventory | Purchase implied; warn on obvious POS receipts |
| Business | Sales implied; warn on supplier invoices |
| Creative | Nudge to Sous Chef or Inventory/Business |

---

## Flow 14 — Upload failure / retry

1. Parse fails or agent service down
2. Specialist or Sous Chef reports per `billId`
3. User retries on Upload orders or re-uploads

---

## Flow 15 — Chat after Process

1. Purchase processed → stock updated, new ingredients
2. Optional `trigger_recipe_pipeline` for new menu items
3. Business: safe to process sales orders

---

## Flow priority for MVP

| Priority | Flow |
|----------|------|
| P0 | 1, 2, 4, 10 |
| P0 | 5, 8, 13 |
| P1 | 3, 7, 6, 9 |
| P2 | 11, 12, 14, 15 |

## Open decisions

- [ ] Per-tab conversation history vs single thread with participants?
- [ ] Consultation blocks collapsed by default?
- [ ] Auto handoff vs always synthesize on Sous Chef tab?
- [ ] Process from chat vs Upload orders only for MVP?
