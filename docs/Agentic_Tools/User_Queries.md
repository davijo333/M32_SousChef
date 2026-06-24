# User Queries — Brainstorm Catalog

Example utterances mapped to **likely agent**, **flow**, and **tool needs**. Use to derive MVP tools.

**Legend:** **SC** = Sous Chef · **INV** = Inventory · **BUS** = Business · **CRE** = Creative · **Confirm** = user confirmation before write

---

## Onboarding & navigation

| Query | Agent | Flow |
|-------|-------|------|
| "What can you help me with?" | SC | 1 |
| "Take me to upload orders" | SC | 9 |
| "Where do I see suggested recipes?" | SC | 9 |
| "Open kitchen control" | SC | 9 |

---

## Session memory (M32 basic)

| Query | Agent | Flow |
|-------|-------|------|
| "My name is David." | any | 10 |
| "What is my name?" | any | 10 |
| "What did I just ask you?" | any | 10 |

---

## Inventory — stock & expiry

| Query | Agent | Flow |
|-------|-------|------|
| "What's low stock right now?" | SC / INV | 2 / 4 |
| "Which ingredients expire this week?" | SC / INV | 2 / 4 |
| "What should I reorder first?" | SC / INV | 6 |
| "How many croissants do we have on hand?" | SC / INV | 4 |
| "Do we have bacon?" | INV | 4 |
| "What's in the dairy category?" | INV | 4 |
| "When did we last buy milk?" | INV | 4 |
| "What's expiring in the next 3 days?" | SC / INV | 2 |

---

## Business — sales & margins

| Query | Agent | Flow |
|-------|-------|------|
| "How did we do on sales this period?" | SC / BUS | 7 |
| "What's our gross margin on sold items?" | BUS | 7 |
| "Which dishes have the best margins?" | SC / BUS | 2 / 7 |
| "Which dishes are losing money?" | BUS | 7 |
| "What sold best this week?" | BUS | 7 |
| "How do supplier purchases compare to POS sales?" | SC / BUS | 7 |
| "Walk me through last month's sales" | SC → BUS | 3 |
| "Why are my supplier bills so high?" | BUS | 7 |

---

## Creative — ideas & specials

| Query | Agent | Flow |
|-------|-------|------|
| "Suggest a lunch special for today" | SC / CRE | 8 |
| "What can I make with eggs and croissants?" | CRE | 8 |
| "Give me a cozy soup idea for this weather" | CRE | 8 |
| "Draft a seasonal coffee drink" | CRE | 8 |
| "Add it" / "Save that" / "Put it in suggestions" | CRE | 8 — **Confirm** |
| "What specials are already suggested?" | CRE | 8 |
| "Don't duplicate our active croissant sandwich" | CRE | 8 |

---

## Cross-domain (Sous Chef showcase)

| Query | Agent | Flow |
|-------|-------|------|
| "What's low stock and what are our best margins?" | SC | 2 |
| "Spinach is expiring and lunch was slow — what should we run?" | SC | 5 |
| "Use what's expiring in a new special and save it" | SC | 5 — **Confirm** |
| "What should I worry about today?" | SC | 2 |
| "Give me a reorder list and tell me if those items sell well" | SC | 2 / 6 |

---

## Handoff triggers

| Query | Agent | Flow |
|-------|-------|------|
| "Talk to inventory about stock" | SC → INV | 3 |
| "Let business explain my margins" | SC → BUS | 3 |
| "I want to brainstorm with creative" | SC → CRE | 3 |
| "Back to Sous Chef" | any → SC | 3 |

---

## File upload — purchase & sales (max 10)

| Query / action | Agent | Flow | Notes |
|----------------|-------|------|-------|
| [User attaches 1–10 PDF/PNG in Sous Chef] | SC | 13 | Classify → hand off; files on Upload orders only |
| "Here are this week's invoices" | SC → INV | 13 | Purchase queue |
| "Upload these POS receipts" | SC → BUS | 13 | Sales queue |
| "These are all Sysco bills" | SC → INV | 13 | All `supplier` |
| "Mix of invoices and receipts" | SC | 13 | Split → INV + BUS |
| "Is this a purchase or sales order?" | SC | 13 | Clarify before parse |
| "Where did my uploads go?" | SC | 13 | Link to Upload orders tab |
| "Status of the Costco invoice?" | INV / SC | 13 | By filename; files on Upload orders |
| "Process the purchase orders" | INV | 13 | **Confirm** — supplier |
| "Process the sales receipts" | BUS | 13 | **Confirm** — customer |
| "Process everything" | SC | 13 | **Confirm** — supplier first, then customer |

### Upload limits & errors

| Situation | Expected response |
|-----------|-------------------|
| 11th file | "Maximum 10 files per batch." |
| POS file on Inventory tab | "Looks like a receipt — use Business or Sous Chef." |
| Sales before purchase processed | "Process purchase orders first." |
| Agent service down | "Run: npm run start:agents" |

---

## Wrong-domain (direct tab)

| User on tab | Query | Expected |
|-------------|-------|----------|
| Inventory | "What's our gross margin?" | Nudge → Business or Sous Chef |
| Business | "What expires Thursday?" | Nudge → Inventory or Sous Chef |
| Creative | "How were sales yesterday?" | Nudge → Business or Sous Chef |

---

## Query → routing (draft)

| Signals | Route | `billType` (uploads) |
|---------|--------|----------------------|
| stock, expiry, reorder, pantry, ingredients | Inventory | — |
| sales, margin, profit, COGS, purchases, revenue | Business | — |
| special, idea, menu, seasonal, add it, save | Creative | — |
| invoice, Sysco, supplier, wholesale, purchase | Inventory | `supplier` |
| receipt, POS, ticket, sales, customer bill | Business | `customer` |
| vague / multiple domains | Sous Chef | classify first |

---

## MVP demo script

1. **Memory:** "My name is David." → "What is my name?"
2. **Cross-domain:** "What's expiring this week and which dishes have the best margins?"
3. **Upload:** Attach 2 purchase + 1 sales PDF → handoff → show on Upload orders
4. **Creative:** "Suggest a special using expiring spinach." → "Save it."
5. **Handoff:** "Walk me through how sales looked this month."
6. **Bridge:** "Take me to recipes to review the suggestion."
