# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# # Agent specs (runtime)
#
# Per-agent **prompts**, **task lists**, and **evals** for the LangGraph chat service.
#
# ## Layout
#
# ```
# agents/
#   __init__.py              # package exports (run_agent_chat, etc.)
#   shared/                  # cross-agent types, prompts, spec loader
#   runtime/                 # ReAct specialists + chat runner
#   head/                    # Sous Chef — persona specs + routing graph
#   inventory/
#   business/
#   creative/                # context key: create
# ```
#
# Repo-level architecture docs: [`../../../agents/README.md`](../../../agents/README.md).
#
# ## Chat agent folders
#
# | Folder | Context key | Agent |
# |--------|-------------|-------|
# | `head/` | `head` | Sous Chef (persona + orchestration graph) |
# | `inventory/` | `inventory` | Inventory Agent |
# | `business/` | `business` | Business Agent |
# | `creative/` | `create` | Creator Agent |
#
# ### Specialist folders (`inventory`, `business`, `creative`)
#
# | File | Purpose |
# |------|---------|
# | `profile.yaml` | Persona, role, data access, display name |
# | `instructions.md` | Specialist system-prompt block |
# | `tasks.yaml` | Tools, workflows, edge cases, `tool_instructions` |
# | `evals/` | Golden conversations |
#
# ### Sous Chef folder (`head/`)
#
# Same spec files as specialists, plus runtime:
#
# | File | Purpose |
# |------|---------|
# | `graph.py` | LangGraph supervisor — consult & synthesize |
# | `orchestration.py` | Deterministic routing rules |
# | `routing.md` | Intent classifier prompt (planned) |
# | `cards.yaml` | Consult cards for specialists (planned) |
#
# ## Shared infra
#
# | Folder | Purpose |
# |--------|---------|
# | `shared/` | `AgentContext`, `ChatState`, prompt builder, YAML spec loader |
# | `runtime/` | `run_react_agent`, `run_agent_chat` entrypoint |
#
# ## Workflow
#
# 1. Tune `inventory/` — then `business/`, `creative/`, `head/`.
# 2. Add `head/cards.yaml` for consult routing.
# 3. Restart agent service after spec edits.
