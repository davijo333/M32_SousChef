# Documentation

Reference docs for Sous Chef. Agent and tool **specs** also live at the repo root (`agents/`, `tools/`).

## Core

| Doc | Contents |
|-----|----------|
| [System-Architecture.md](./System-Architecture.md) | **Detailed Mermaid diagrams** — platform, chat path, agent-service-v1 layers, workflow FSM |
| [How-It-Works.md](./How-It-Works.md) | **End-to-end narrative** — web app, dual chat path, agent-service-v1 deep dive |
| [Architecture.md](./Architecture.md) | Short system overview, repo layout, deployment |
| [Agents.md](./Agents.md) | Four chat agents, workers, tools, confirmation flow |
| [Technologies.md](./Technologies.md) | Full stack list and **Railway** deployment |
| [Next-Features.md](./Next-Features.md) | Planned capabilities (POS, adaptive reorder, price compare, MCP delivery, consulting-agent UI) |

## Product & UI

| Folder | Contents |
|--------|----------|
| [UI/](./UI/) | Pages, routes, Sous Chef chat dock |
| [Recipes/](./Recipes/) | Workflow, classifications, test recipes |
| [Inventory/](./Inventory/) | Dishes, ingredients, add-ons reference |

## Data

| Folder | Contents |
|--------|----------|
| [DB/](./DB/) | MongoDB collections and schemas |

## Agent & tool specs (repo root)

| Path | Contents |
|------|----------|
| [../agents/](../agents/) | Per-agent profiles — [README](../agents/README.md) |
| [../tools/](../tools/) | [Tool index](../tools/Tool_Index.md), [development](../tools/Development.md) |

## Terminology

| User-facing | Internal |
|-------------|----------|
| Purchase order | `billType: "supplier"` |
| Sales order | `billType: "customer"` |
| Upload orders | `/upload-orders`, `/api/bills/*` |
| Sous Chef | Chat context `head` |
| Creative Agent | Chat context `create` |

## Test data

- Dashboard → **Load test data**, or `POST /api/seed?force=1`
- `npm run regenerate:bills` — rebuild bill PDFs/PNGs from `test/inventory/`
- Details: [../test/inventory/README.md](../test/inventory/README.md)
