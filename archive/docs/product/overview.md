# Sous Chef — Product Overview

M32 take-home assessment. Production-quality vertical copilot for breakfast diners and cafés.

## One-liner

Sous Chef helps small café owners turn supplier bills and sales receipts into live inventory, menu insights, and reorder advice — through upload, review, and chat.

**Tagline:** *Your AI sous chef for menu & inventory.*

See [naming conventions](../naming.md) for official names and usage rules.

---

## Problem

Independent breakfast diners and cafés run on thin margins. Owners juggle menu performance, ingredient waste, expiry, and reorder timing — often without a full POS analytics suite. Spreadsheets and memory do not scale.

Sous Chef gives them an **AI sous chef**: not replacing the owner, but handling prep-level ops work — inventory math, margin checks, reorder suggestions — grounded in their real bills and sales data.

---

## Target user

| Attribute | Detail |
|-----------|--------|
| **Who** | Owner or manager of a 1–30 person food business |
| **Segment** | B2B SMB — breakfast diner or café (MVP scope) |
| **Persona** | 35+, not very tech-savvy, cares about practical outcomes |
| **Jobs** | Reduce waste, optimize margins, know what to reorder and when |

**Not the user:** diners browsing a menu (B2C).

---

## Product positioning

| Generic chatbot | Sous Chef |
|-----------------|-----------|
| Text in, text out | Bills → structured data → recommendations |
| No business context | Grounded in restaurant inventory and menu |
| Black box | Human-in-the-loop review and overrides |
| Consumer feel | Operator dashboard + advisory copilot |

**Metaphor:** A *sous chef* — the right hand for prep, inventory, and execution. The owner stays in charge; Sous Chef assists.

---

## Core workflow

The data model is the product. Chat is the interface on top.

```
Vendor bills  ──→  Ingredients (stock IN)
Sales receipts ──→  Menu items (sales OUT)
                        ↓
              Menu item ↔ ingredient links (qty per serving)
                        ↓
              Inventory state (qty, expiry, reorder)
                        ↓
              Chat answers with real math
```

### Cold start principle

**Bills are the source of truth** — not empty forms.

```
Sign up → upload bills → extract & deduplicate →
Ingredients + menu items grow automatically → user corrects mistakes → chat works
```

No 30-field setup wizard. Upload first, refine later. Manual add and overrides are the failsafe.

---

## Two bill types

Line items mean different things depending on who issued the bill.

| Bill type | Example source | Line items are… | Auto-adds to |
|-----------|----------------|-----------------|--------------|
| **Supplier bill** | Sysco, Costco, local dairy | Raw ingredients | **Ingredients** |
| **Sales receipt** | Square, Toast, daily Z-report | Menu items sold | **Menu items** |

- Vendor line *"Large Eggs 5 dz"* → Ingredient, not a menu item.
- Sales line *"The Sunrise Stack × 12"* → Menu item, not an ingredient.

**Code vs UI:** DB models stay `Dish` / `RawMaterial`; user-facing copy uses **menu item** and **ingredient**.

MVP: user picks bill type at upload via a simple toggle.

**Ingestion is idempotent:** new items on future bills are auto-added; known items update stock or sales counts. Fields with `manual_override: true` are never overwritten by auto-ingest.

---

## What auto-happens vs what does not

| Auto from bills | Does not auto-happen |
|-----------------|----------------------|
| Create / update ingredients (vendor) | Create menu items from vendor bills alone |
| Create / update menu items (sales) | Link ingredients to menu items |
| Normalize and dedupe item names | Set expiry (often missing on invoices) |
| Track purchase price and sales counts | Set sell price (only from sales receipts) |

**Linking** menu items ↔ ingredients is a separate step: Recipe Research + Linker agents, with user correction on override pages.

---

## Agents (high level)

| Stage | Agent | Role |
|-------|-------|------|
| **1a** | Bill Parser | Vision/OCR → line items (name, qty, unit, price, date) |
| **1b** | Item Normalizer | `CHKN BRST 5lb` → `Chicken Breast` with standard units |
| **2a** | Recipe Researcher | For a menu item → typical ingredients + weights |
| **2b** | Linker | Map ingredients ↔ menu items with quantities |
| **3** | Inventory Engine | Deterministic code — stock, expiry, depletion (not LLM) |
| **4** | Chat Copilot | Reasons over structured data + runs tools |

**Architecture rule:** inventory math is **code**, not LLM hallucination. Agents read and suggest; the Inventory Engine computes.

Detailed agent specs → [agents/README.md](../agents/README.md).

---

## Pages

| Page | Doc |
|------|-----|
| Login / Signup | [login-signup.md](../pages/login-signup.md) |
| Upload Bills | [upload-bills.md](../pages/upload-bills.md) |
| Dashboard | [dashboard.md](../pages/dashboard.md) |
| Dashboard (incl. chat) | [dashboard.md](../pages/dashboard.md) |
| Upload Bills | [upload-bills.md](../pages/upload-bills.md) |
| Kitchen Control | [kitchen-control.md](../pages/kitchen-control.md) |
| Recipes | [recipes.md](../pages/recipes.md) |
| Promotions | [promotions.md](../pages/promotions.md) |
| Chat spec | [chat.md](../pages/chat.md) |

### Human-in-the-loop (product differentiator)

Owners will not trust AI blindly. Override pages let users:

- Fix menu item ↔ ingredient links
- Override remaining ingredient quantity and expiry
- Override weight (qty per serving) per menu item
- Add items manually, merge duplicates, reclassify bill lines

Everything flagged with `source` and `manual_override` so agents respect user edits.

---

## Example chat prompts

- *Garden Morning Croissant isn't selling — should I remove it or reprice?*
- *Spinach expires tomorrow — what specials should I run on veggie sandwiches?*
- *Compare my current menu margins vs industry averages*
- *What should I reorder this week based on last month's sales?*
- *What to order when, based on dish usage, expiry, and quantity on hand?*

---

## MVP scope

### Must have

- Auth (signup / login / logout)
- Chat with session context in a single thread
- Upload bills (vendor) + review before save
- Ingredients and menu items lists (from bills + manual add)
- Ingredient link overrides
- Quantity / expiry overrides
- Inventory Engine (deterministic)
- Pre-loaded demo café ("Sunrise Diner") — see [menu catalog](./menu.md)

### Should have (Day 2)

- Sales receipt upload
- Weight-per-dish override UI
- Dashboard: expiring soon, low stock, unlinked items
- Recipe Research agent for new dishes
- Visible agent progress in chat
- Google OAuth (bonus)
- Composio: export reorder list to Google Sheets (bonus)

### Defer (post-assessment)

- POS integration (Square, Toast)
- Multi-location
- Supplier price comparison
- Email verification / password reset

---

## MVP menu — Sunrise Diner

Breakfast diner / café only. Full catalog: [menu.md](./menu.md). Test fixtures: `test/menu-items.json`, `test/ingredients.json`.

| Category | Items |
|----------|-------|
| **Breakfast sandwiches** | 3 customizable (croissant / bread / bagel base + add-ons) + 3 signatures |
| **Coffee** | Hot Coffee, Frappe, Mocha, Cappuccino — customizable milk & flavor |
| **Tea** | English Breakfast, Green Tea |
| **Juice** | Orange, Apple, Cranberry |

**15 menu items total.** Sandwich add-ons: bacon, sausage, egg, cheese, veggies. Coffee: 6 milk options + 3 flavor shots.

**Signatures:** The Sunrise Stack, Garden Morning Croissant, The Farmer's Double.

Customizable sandwiches deplete inventory as base + selected add-ons. Signatures use fixed ingredient links for margin and reorder math. All depletion converts kitchen units (slice, oz) to purchase units (lb, gallon) via `usageUnits` on each ingredient — see [unit-conversions.md](../db/unit-conversions.md).

---

## Build phases

| Phase | Focus |
|-------|-------|
| **1 — Skeleton** | Auth, chat, MongoDB, seeded demo data, Inventory Engine |
| **2 — Bills** | Upload → vision parse → review → save to ingredients |
| **3 — Linking** | Menu item ↔ ingredient UI, overrides, chat tools on real data |
| **4 — Polish** | Dashboard alerts, recipe agent, deploy, OAuth, Composio |

---

## Stretch ideas (high value, feasible)

1. **Morning briefing** — expiring items, margin flags, reorder list
2. **"Run a special" generator** — expiring stock + slow movers → promo suggestion
3. **Food cost % per dish** — flag if above ~28–35% for breakfast
4. **Reorder calculator** — `avg daily usage × lead time − current stock`
5. **Waste tracker** — log spoiled items; monthly waste summary in chat
6. **Audit log** — agent linked eggs → user changed to 3 eggs on Tue
7. **Unlinked items queue** — nudge user to fix missing links

---

## Demo strategy

Two paths for evaluators:

1. **Cold start story** — sign up, upload a bill, review, ask chat a reorder question (README walkthrough).
2. **Instant demo** — pre-seeded "Sunrise Diner" with linked data so chat works without upload.

Upload is the differentiator; seed data ensures the demo never fails live.

---

## Tech stack (planned)

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 14, TypeScript, Tailwind, shadcn/ui |
| Auth | NextAuth.js — credentials + Google OAuth |
| Database | MongoDB Atlas (`sous_chef`) |
| AI orchestration | LangGraph (Python) |
| LLM | OpenAI GPT-4o-mini or Gemini |
| Bill parsing | GPT-4o / Gemini vision on PDF/image |
| Deploy | Vercel (Next.js) + Render (FastAPI) |

Detailed architecture → [tech/architecture.md](../tech/architecture.md). Implementation stages → [tech/stages.md](../tech/stages.md). Stack → [tech/stack.md](../tech/stack.md).

---

## Assessment alignment

| M32 requirement | How Sous Chef delivers |
|-----------------|------------------------|
| LLM chatbot with tools | Chat Copilot + inventory/margin/reorder tools |
| Web UI, signup, login, logout | Next.js app with auth |
| Session context in one chat | Per-conversation message history |
| Go above & beyond | Bill ingest, multi-agent pipeline, override UX |
| Agentic | 1a → 1b → 2a → 2b → 3 → 4 |
| B2B SMB thinking | Café owner workflow, plain-language UI |
| Bonus: Google OAuth | Day 2 stretch |
| Bonus: Composio | Export reorder list to Sheets |

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Bill OCR is messy | Vision model + mandatory review screen before save |
| Recipe linking wrong | Override UI + confidence badges on agent suggestions |
| Too much for 2 days | Demo seed data; one bill type first; ~12 menu items |
| LLM invents inventory | Separate Inventory Engine; chat only calls tools |
| Unit chaos (lb vs oz) | Normalizer agent + fixed unit enum in DB |
| Same item, different names | Fuzzy match + merge UI on review screen |

---

## Open decisions

| Decision | Recommendation |
|----------|----------------|
| Sales data for cold start | Both bill types; vendor bills first in build order |
| Demo vs blank start | Ship both — seed for live demo, cold start for README story |
| LLM provider | OpenAI for reliability; Gemini as fallback |

---

## Related docs

- [Naming](../naming.md)
- [Menu catalog](./menu.md)
- [Test data](../../test/)
- [Pages](../pages/)
- [Agents](../agents/)
- [Tech docs](../tech/)
- `docs/user-flows/` — end-to-end flows (TBD)
- `docs/db/` — [ingredients](./db/ingredients.md), [unit conversions](./db/unit-conversions.md), [sizes](./db/sizes.md)
