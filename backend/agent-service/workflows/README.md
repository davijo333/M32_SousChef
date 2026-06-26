# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# # Workflow specs (`backend/agent-service/workflows/`)
#
# Canonical human-readable workflow catalog for Sous Chef. **Start here:** [golden-workflow-template.md](./golden-workflow-template.md)
#
# Legacy YAML: [`agents/head/golden-workflows.yaml`](../agents/head/golden-workflows.yaml) (slim over time; `workflows/` is source of truth).
#
# | File | Scope |
# |------|--------|
# | [golden-shared-rules.md](./golden-shared-rules.md) | Global: one question, confirm, workflow state |
# | [golden-head-delegation.md](./golden-head-delegation.md) | How Head consults specialists |
# | [golden-workflow-template.md](./golden-workflow-template.md) | Copy-paste skeleton (write + read) |
# | [golden-addition-workflows.md](./golden-addition-workflows.md) | Catalog **creates** |
# | [golden-update-workflows.md](./golden-update-workflows.md) | Catalog **updates** |
# | [golden-inventory-query-workflows.md](./golden-inventory-query-workflows.md) | Read-only pantry / stock |
# | [golden-business-query-workflows.md](./golden-business-query-workflows.md) | Read-only sales / margin |
# | [golden-creative-query-workflows.md](./golden-creative-query-workflows.md) | Brainstorm / specials (escalate to addition) |
#
# ## Uniform step verbs
#
# | Write | Read |
# |-------|------|
# | LOOKUP → BRANCH → PREVIEW → CONFIRM → PERSIST → SUMMARIZE | PARSE → CONSULT → ANSWER → OPTIONAL |
#
# ## Runtime wiring
#
# ```
# Chef message
#   → load conversation.workflowState (MongoDB)
#   → resolve_workflow_consults + workflow_engine.py (step-aware)
#   → consult specialist per golden-head-delegation.md
#   → advance stepId after synthesize
#   → save workflowState on conversation
# ```
#
# Fallback: regex + LLM classifier when no workflow applies.
#
# Implementation: `agents/head/workflow_engine.py`, `backend/api/models/Conversation.ts`, `backend/api/services/chat/workflow-state.ts`.
#
# ## Evals
#
# One fixture per workflow under `agents/head/evals/` ([evals/README.md](../agents/head/evals/README.md)).
