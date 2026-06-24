# System architecture

Sous Chef: Next.js web app + MongoDB + Python LangGraph agent service.

## High-level diagram

```mermaid
flowchart TB
    subgraph client["Browser"]
        UI["Next.js UI\n(App Router)"]
    end

    subgraph vercel["Vercel"]
        NEXT["Next.js API Routes\nAuth · CRUD · Proxy"]
    end

    subgraph atlas["MongoDB Atlas"]
        DB[("sous_chef DB")]
    end

    subgraph render["Render"]
        API["FastAPI"]
        LG["LangGraph\nAgent graphs"]
    end

    subgraph external["External"]
        LLM["OpenAI / Gemini"]
        GOOGLE["Google OAuth"]
        COMP["Composio\n(stretch)"]
    end

    UI --> NEXT
    NEXT --> DB
    NEXT -->|HTTP / SSE| API
    API --> LG
    LG --> LLM
    NEXT --> GOOGLE
    LG --> COMP
```

## Request paths

### Auth & CRUD (Next.js only)

```
Browser → Next.js API → MongoDB
```

Handles: signup, login, restaurant CRUD, conversation list, override saves.

### Bill upload & parse

```
Browser → Next.js API → FastAPI/LangGraph
    → 1a Bill Parser (vision LLM)
    → 1b Item Normalizer
    → return pending lines → Review UI
User confirms → Next.js API → 3 Inventory Engine → MongoDB
```

### Chat

```
Browser → Next.js API → FastAPI/LangGraph
    → 4 Chat Copilot
    → tools call → 3 Inventory Engine (read-only queries)
    → MongoDB
    → SSE stream reply → Browser
```

## Tenancy boundary

```mermaid
flowchart LR
    AUTH["Session\nuserId"] --> REST["restaurantId"]
    REST --> DATA["Ingredients\nMenu items\nBills\nMessages"]
```

- Every API route resolves `restaurantId` from authenticated user.
- Agent service receives `restaurantId` from Next.js — **never** from raw user message text.
- All bill and catalog APIs scope by `restaurantId` from the authenticated session.

## Data model (simplified)

```mermaid
erDiagram
    User ||--|| Restaurant : owns
    Restaurant ||--o{ Ingredient : has
    Restaurant ||--o{ MenuItem : has
    MenuItem ||--o{ DishIngredient : links
    Ingredient ||--o{ DishIngredient : links
    Restaurant ||--o{ VendorBill : uploads
    Restaurant ||--o{ Conversation : has
    Conversation ||--o{ Message : contains
```

Details: [ingredients.md](../db/ingredients.md), [unit-conversions.md](../db/unit-conversions.md), [sizes.md](../db/sizes.md).

## Agent pipeline

```mermaid
flowchart LR
    subgraph s1["Stage 1"]
        A1a["1a Parser"]
        A1b["1b Normalizer"]
    end
    subgraph s2["Stage 2"]
        A2a["2a Researcher"]
        A2b["2b Linker"]
    end
    subgraph s3["Stage 3"]
        IE["3 Inventory Engine"]
    end
    subgraph s4["Stage 4"]
        CC["4 Chat Copilot"]
    end

    Upload --> A1a --> A1b --> Review
    Review --> IE
    NewItem --> A2a --> A2b --> IE
    UserChat --> CC --> IE
```

## Inventory depletion flow

```
Sale recorded (receipt or manual)
    → resolve menu item + size (scalePercent)
    → resolve ingredientLinks + add-ons + milk/flavor
    → usageQty per line (kitchen unit)
    → usageToInventoryQty (usageUnits)
    → decrement currentQty
```

Reference implementation: `test/convert-usage.ts`.

## Deployment

| Component | Host | URL pattern |
|-----------|------|-------------|
| Next.js frontend + API | Vercel | `sous-chef.vercel.app` |
| FastAPI + LangGraph | Render free tier | `sous-chef-api.onrender.com` |
| MongoDB | Atlas | Private connection string |

### Environment variables

| Var | Where | Purpose |
|-----|-------|---------|
| `MONGODB_URI` | Vercel, Render | Database |
| `NEXTAUTH_SECRET` | Vercel | Session signing |
| `OPENAI_API_KEY` | Render | LLM + vision |
| `GOOGLE_CLIENT_ID/SECRET` | Vercel | OAuth bonus |
| `AGENT_SERVICE_URL` | Vercel | FastAPI base URL |

## Security notes

- API keys only in server env — never client bundle.
- All chat tools scoped by `restaurantId`.
- Bill files in object storage (S3/R2) or GridFS — not committed to git.

## Related

- [Implementation stages](./stages.md)
- [Tech stack](./stack.md)
- [Agents](../agents/README.md)
