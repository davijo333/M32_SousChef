# Sous Chef

AI-assisted kitchen management for cafés and restaurants — upload orders, manage pantry and menu, build recipes, and chat with specialist agents.

## Quick start

```bash
cp .env.example .env
npm install && cd apps/web && npm install && cd ../..

npm run connect:mongodb   # MongoDB on :27017
npm run start:agents      # FastAPI agent service on :8000
npm run start:schef       # Next.js on :3000
```

Open [http://localhost:3000](http://localhost:3000). Set `MONGODB_URI`, `NEXTAUTH_SECRET`, and `OPENAI_API_KEY` in `.env` (see [`.env.example`](.env.example)).

## Documentation

| Doc | What |
|-----|------|
| [**docs/README.md**](docs/README.md) | Documentation index |
| [docs/Architecture.md](docs/Architecture.md) | System design and request flows |
| [docs/Agents.md](docs/Agents.md) | Sous Chef + specialist agents |
| [docs/Technologies.md](docs/Technologies.md) | Stack and Railway deployment |
| [docs/UI/README.md](docs/UI/README.md) | App pages and routes |
| [agents/README.md](agents/README.md) | Agent specs (detailed) |
| [tools/Tool_Index.md](tools/Tool_Index.md) | Chat tools reference |

## npm scripts

| Script | Description |
|--------|-------------|
| `npm run start:schef` | Next.js web app |
| `npm run start:agents` | Python agent service |
| `npm run connect:mongodb` | Start MongoDB (Docker) |
| `npm run build` | Production web build |
| `npm run retest:upload` | Parse all fixture bills via API |

Full list: run `npm run` from repo root.

## Project layout

```
apps/web/              Next.js UI + API routes
backend/api/           Shared TypeScript services & models
backend/agent-service/ FastAPI + LangGraph agents
agents/  tools/        Agent and tool specs
docs/                  Architecture, agents, technologies, UI, DB
test/                  Catalog fixtures and generated bills
```
