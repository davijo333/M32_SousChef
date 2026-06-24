# Tech stack

What we use and why. Optimized for **production quality in ~2 days** while hitting M32 MERN-adjacent preferences.

## Summary table

| Technology | Layer | What it does |
|------------|-------|----------------|
| **Next.js 14** | Frontend + API | React app, API routes, auth, SSR, Vercel deploy |
| **TypeScript** | Frontend + API | Type safety across UI and server routes |
| **Tailwind CSS** | Frontend | Utility-first styling, fast polish |
| **shadcn/ui** | Frontend | Accessible components (forms, tables, dialogs) for 35+ users |
| **NextAuth.js** | Auth | Signup/login sessions, Google OAuth bonus |
| **MongoDB Atlas** | Database | Document store for users, menu, inventory, chat |
| **Mongoose** | Database ODM | Schemas, validation, queries from Next.js |
| **Python FastAPI** | Agent API | HTTP service hosting LangGraph graphs |
| **LangGraph** | AI orchestration | Multi-step agents, tool loops, streaming |
| **OpenAI GPT-4o-mini** | LLM | Chat replies, cheap default |
| **GPT-4o / Gemini vision** | LLM | Bill image/PDF parsing (1a Bill Parser) |
| **Vercel** | Deploy | Host Next.js with zero-config |
| **Render** | Deploy | Host FastAPI agent service (free tier) |
| **Composio** | Integrations | Export reorder list to Google Sheets (bonus) |

Database name: `sous_chef` · App slug: `sous-chef` · See [naming.md](../naming.md).

---

## Frontend

### Next.js 14 (App Router)

- **Does:** Pages (`/dashboard`, `/upload-bills`, `/kitchen-control`, `/recipes`, `/promotions`), API routes (`/api/chat`, `/api/bills`).
- **Why:** Single repo, fast auth, native Vercel deploy — beats separate Express + React SPA for a 2-day timeline.

### TypeScript

- **Does:** Shared types for Ingredient, MenuItem, BillLineItem, tool responses.
- **Why:** Fewer runtime bugs when wiring agents to UI.

### Tailwind CSS

- **Does:** Layout, typography, responsive dashboard and chat.
- **Why:** Speed; consistent spacing for non-technical user UI.

### shadcn/ui

- **Does:** Buttons, inputs, tables (inventory list), sheets (review bill), toasts.
- **Why:** Polished defaults without looking like Streamlit or raw HTML.

---

## Auth & sessions

### NextAuth.js (Auth.js)

- **Does:** Credentials provider (email/password), session cookies, optional Google OAuth.
- **Why:** M32 bonus points; familiar pattern; secures `restaurantId` on every request.

---

## Data

### MongoDB Atlas

- **Does:** Stores users, restaurants, ingredients, menu items, links, bills, conversations.
- **Why:** Flexible schema for bill line items and nested customization; M32 stack preference.

### Mongoose

- **Does:** Models with `restaurantId` index on every tenant collection; validation hooks.
- **Why:** Simple integration from Next.js API routes without a separate ORM learning curve.

---

## AI & agents

### Python FastAPI

- **Does:** REST + SSE endpoints; receives upload bytes or chat messages; returns agent output.
- **Why:** M32 prefers Python for AI services; clean separation from Next.js.

### LangGraph

- **Does:** Graphs for bill ingest (`1a → 1b`) and chat (`4` tool loop); checkpointing optional.
- **Why:** M32 explicitly wants LangChain/LangGraph; multi-agent pipeline maps naturally to nodes.

### OpenAI GPT-4o-mini

- **Does:** Chat Copilot replies, Recipe Researcher, Linker validation — text reasoning.
- **Why:** Reliable tool calling; low cost for assessment volume.

### GPT-4o / Gemini vision

- **Does:** 1a Bill Parser — extract line items from invoice photos.
- **Why:** Core product differentiator; vision models handle messy supplier bills.

---

## Domain logic (not LLM)

### Inventory Engine (TypeScript or Python)

- **Does:** `currentQty` updates, unit conversion (`usageUnits`), size scaling (`scalePercent`), reorder math, alerts.
- **Why:** Stock numbers must never be LLM-hallucinated. See [2a Ingredient Normalizer](../agents/2a-ingredient-normalizer/README.md) and `apps/web/src/lib/kitchen-inventory.ts`.

Implemented from rules in:

- `test/convert-usage.ts`
- `test/sizes.json`
- `docs/db/unit-conversions.md`

---

## Deployment & ops

### Vercel

- **Does:** Hosts Next.js; env vars; preview deploys per branch.
- **Why:** Free, fast, recommended by M32.

### Render

- **Does:** Hosts FastAPI + LangGraph; long-running agent requests.
- **Why:** Free tier for Python sidecar; keeps AI off Vercel function timeout limits.

---

## Integrations (stretch)

### Google OAuth

- **Does:** One-click signup via Google account.
- **Why:** M32 bonus; NextAuth makes it ~1 hour.

### Composio

- **Does:** Push reorder list to Google Sheets; draft supplier email.
- **Why:** M32 bonus; shows business output beyond chat.

---

## What we are not using

| Avoided | Why |
|---------|-----|
| Streamlit | M32 says don't look like Streamlit |
| Bolt / Lovable | No-code prohibited |
| Forked near-complete app | Must be from scratch |
| LLM for inventory math | Accuracy requirement |
| Classic MERN (Express SPA) | Slower for 2-day scope; Next.js still uses Mongo + Node |

---

## Repo layout (planned)

```
M32_SousChef/
├── apps/web/          # Next.js (or root app/)
├── services/agent/    # FastAPI + LangGraph
├── docs/
├── test/              # Seed JSON + convert-usage.ts
└── README.md
```

Exact monorepo shape TBD at scaffold time.

---

## Related

- [Architecture](./architecture.md)
- [Implementation stages](./stages.md)
- [Agents](../agents/README.md)
