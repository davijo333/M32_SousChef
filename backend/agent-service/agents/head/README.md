# Sous Chef (`head`)

Context key: **`head`**. The floating chat dock — one agent, persona + orchestration together.

## Runtime code

| File | Role |
|------|------|
| `graph.py` | LangGraph routing — classify intent, consult specialists, synthesize reply |
| `orchestration.py` | Deterministic rules — dish locking, pantry-add-zero, workflow consults |

## Spec files

| File | Role |
|------|------|
| `profile.yaml` | Persona, role, data access |
| `instructions.md` | How Sous Chef speaks and delegates |
| `routing.md` | Intent classifier prompt |
| `cards.yaml` | When to consult inventory / business / creative |
| `golden-workflows.yaml` | Predictable multi-step workflows (source of truth for routing) |
| `evals/` | Golden conversations per workflow |

See [inventory/](../inventory/) for the specialist spec template.
