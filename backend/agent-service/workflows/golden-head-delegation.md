# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# # Head delegation protocol
#
# How **Sous Chef (Head)** consults specialists. Workflow steps live in `golden-*-workflows.md` — this file is routing only.
#
# Shared rules: [golden-shared-rules.md](./golden-shared-rules.md)
#
# ---
#
# ## When to consult whom
#
# | Chef need | Consult | Never |
# |-----------|---------|-------|
# | Stock, expiry, reorder, pantry search, catalog writes | **Inventory** | Invent qty or claim writes |
# | New recipe, special idea, suggested add-ons for a dish | **Creator** first | Persist catalog |
# | Sales, margin, promotion **read** | **Business** | Change sell price in DB |
# | Apply sell price / reorder after Business preview | **Inventory** on confirm | Skip confirm |
# | Update existing dish / add-on / ingredient | **Inventory** only | Creator |
# | Daily triage (“what to focus on”) | Head + `query_kitchen` snapshot | Multi-agent consult unless chef asks depth |
#
# ---
#
# ## How Head consults (every time)
#
# 1. **Do not ask permission** — consult behind the scenes (“I consulted the **Creator Agent**…”).
# 2. **Pass context** in the consult message:
#    - locked entity name (dish / add-on / ingredient)
#    - active `workflowId` + `stepId` when state exists
#    - `catalog_draft` from photo if present
#    - last 4 chef messages if name or intent is unclear
# 3. **One specialist focus per step** — max 3 consults per turn only when the workflow requires it.
# 4. **Require tool use** — specialists must call read/write tools; Head never accepts “I created …” without tool output.
# 5. **Synthesize faithfully** — quote Inventory/Business DB values; pass through Creative drafts verbatim in structure.
#
# ---
#
# ## Consult message shape (internal)
#
# ```
# The Sous Chef supervisor is consulting you.
# Chef question: {user_message}
# Locked context: {name}
# Workflow step: {workflowId} / {stepId}
# Catalog draft: {optional}
# Prior notes: {optional}
#
# Your task: {step-specific instruction from workflow doc}
# ```
#
# Step-specific instructions are defined in workflow files and `graph.py` `_specialist_task_block` (runtime).
#
# ---
#
# ## How Head replies after a consult
#
# **Write workflows**
#
# - Lead with: “I consulted the **{Agent}** and used their tools for this step.”
# - Body: specialist output (recipe draft, preview, or result).
# - End with **one question** — confirm gate OR single clarifier (see shared rules).
# - During CONFIRM step: only ask yes/no/edit — no margin, pricing, or “what’s next” until PERSIST succeeds.
#
# **Read workflows**
#
# - Lead with specialist facts (on-hand, sell price, margin, etc.).
# - **One optional** follow-up only if blocked (ambiguous name).
# - Do not offer to consult another agent unless chef’s question clearly needs it.
#
# **After successful PERSIST**
#
# - SUMMARIZE what was created/updated (from tool message).
# - One optional follow-up (e.g. margin pass) — still **one question**.
#
# ---
#
# ## What Head never does
#
# - Call `apply_inventory`, `apply_menu`, or bill process tools directly
# - Ask “Would you like me to consult the Creator Agent?” before consulting
# - End with more than one question
# - Claim a write completed without Inventory tool evidence
# - Consult Creator for **updates** to existing menu rows
# - Ask chef to pick photos in chat
#
# ---
#
# ## Handoff vs consult
#
# | | Consult | Handoff |
# |---|---------|---------|
# | Chef action | Normal chat | Taps **Connect to … Agent** |
# | UI agent | Stays Sous Chef | Switches dashboard specialist |
# | Thread | Head synthesizes | Specialist owns reply |
# | Use | Default for all workflows | Only when chef requests Connect |
#
# ---
#
# ## Escalation between workflow types
#
# | From | Chef signal | Go to |
# |------|-------------|-------|
# | Query (read) | “add it”, “create”, “build kitchen” | [golden-addition-workflows.md](./golden-addition-workflows.md) |
# | Query (read) | “change”, “update”, “set price to” | [golden-update-workflows.md](./golden-update-workflows.md) |
# | Addition LOOKUP | already exists | [golden-update-workflows.md](./golden-update-workflows.md) or stop |
# | Update LOOKUP | not found | [golden-addition-workflows.md](./golden-addition-workflows.md) or stop |
# | Creative query | “save to suggested” | Suggested Dish addition |
# | Creative query | “full kitchen build” | Dish addition |
