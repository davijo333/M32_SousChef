# Development — LangGraph & Deployment

How to develop the agentic chat layer locally and deploy to production.

## Stack split

| Component | Location | Host (prod) |
|-----------|----------|-------------|
| Web UI + auth + MongoDB API | `apps/web` (Next.js) | **Vercel** |
| LangGraph + bill/recipe workers | `services/agent` (FastAPI) | **Railway** |
| Database | MongoDB | **MongoDB Atlas** |
| LLM | OpenAI | API key in env |

```
Browser → Vercel (Next.js)
            ↓ AGENT_SERVICE_URL
          Railway (FastAPI + LangGraph)
            ↓
          MongoDB Atlas + OpenAI
```

## Local development

### Prerequisites

- Node.js, Python 3.12+, Docker (for local MongoDB)
- `.env` from `.env.example`

### Start services

```bash
# Terminal 1 — MongoDB
npm run connect:mongodb

# Terminal 2 — Python agent (:8000)
npm run start:agents

# Terminal 3 — Next.js (:3000)
npm run start:schef
```

`services/agent/run.sh` creates `.venv`, installs `requirements.txt`, runs `uvicorn main:app --reload --port 8000`.

### Environment (local)

```env
MONGODB_URI=mongodb://localhost:27017/sous_chef
OPENAI_API_KEY=sk-...
AGENT_SERVICE_URL=http://localhost:8000
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
```

### LangGraph dependencies (add to `services/agent/requirements.txt`)

```txt
langgraph>=0.2.0
langchain>=0.3.0
langchain-openai>=0.2.0
langchain-core>=0.3.0
```

Optional MongoDB from Python tools: `motor` or `pymongo`.

### Where LangGraph lives

```
services/agent/
├── main.py              # FastAPI — add POST /chat
├── graph/
│   ├── head_chef.py     # Supervisor graph
│   ├── inventory.py     # Specialist + tools
│   ├── business.py
│   └── creative.py
├── tools/               # Tool implementations
└── requirements.txt
```

Next.js `POST /api/dashboard/chat` proxies to `AGENT_SERVICE_URL/chat` with `restaurantId`, `message`, `selectedAgent`, `conversationId`.

### Optional: LangSmith (tracing)

```env
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_...
LANGCHAIN_PROJECT=sous-chef-dev
```

Useful for debugging graph nodes and tool calls during M32 demo prep.

### Health check

```bash
curl http://localhost:8000/health
```

---

## Railway (agent service)

1. New Railway project → deploy from GitHub
2. Set **root directory** to `services/agent` (uses existing `Dockerfile`)
3. **Environment variables:**
   - `OPENAI_API_KEY`
   - `MONGODB_URI` (Atlas, if Python tools hit DB)
   - Optional `LANGCHAIN_*`
4. Ensure start command respects Railway `PORT`:

   ```dockerfile
   CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
   ```

5. Copy public URL → e.g. `https://sous-chef-agent.up.railway.app`

### Railway notes

| Topic | Recommendation |
|-------|----------------|
| Memory | 512MB–1GB (PyMuPDF + LangGraph) |
| Timeouts | Bill parse can take ~180s — raise HTTP timeout for `/parse-bill-pipeline` |
| Cold starts | Hobby tier may sleep; first request slower |
| CORS | Add production Vercel URL to `main.py` `allow_origins` |

---

## Vercel (web app)

1. Import repo → set **root directory** to `apps/web`
2. **Environment variables:**
   - `MONGODB_URI` (Atlas)
   - `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (production URL)
   - `OPENAI_API_KEY` (if chat stays in Next.js during transition)
   - `AGENT_SERVICE_URL` = Railway agent URL
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (optional)

Vercel hosts the **website** — pages, auth, API routes, MongoDB. It does **not** run the Python agent by default.

---

## MongoDB Atlas

- Create free cluster → connection string → `MONGODB_URI` on Vercel and Railway (if needed)
- Local Docker Mongo is dev-only

---

## CORS (production)

Update `services/agent/main.py`:

```python
allow_origins=[
    "http://localhost:3000",
    "https://your-app.vercel.app",
]
```

---

## Implementation order

1. Docs (`docs/Agentic_Tools/`)
2. UI — floating dock, 4 tabs (`SousChefChatDock`)
3. Tools MVP — read tools + `add_suggested_dish` in Next.js or Python
4. LangGraph — `POST /chat` in agent service
5. Upload handoff — max 10 files → `/api/bills/parse` → Upload orders tabs
6. Deploy — Railway + Vercel + Atlas

---

## Related

- [README.md](./README.md) — architecture
- [../Agents/README.md](../Agents/README.md) — existing Python workers
- [../../README.md](../../README.md) — project quick start
