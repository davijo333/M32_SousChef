# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# # Golden workflow template
#
# Copy this skeleton for every workflow in `golden-*.md`.  
# Shared rules: [golden-shared-rules.md](./golden-shared-rules.md) · Head protocol: [golden-head-delegation.md](./golden-head-delegation.md)
#
# ---
#
# ## Write workflow (Addition or Update)
#
# ```markdown
# ## {Entity} {Addition|Update} Golden Workflow
#
# `workflow_id` · **{specialist chain}** · mode: **write**
#
# **Trigger:** …
# **Not this:** …
#
# Step 1 LOOKUP — Ask **{Agent}** to … (`tool_name`).
# Step 2 BRANCH — If {condition} → … Stop / use other workflow.
# Step 3 PREVIEW — Head shows … (no DB write).
# Step 4 CONFIRM — Chef yes / no / edit (one question only).
# Step 5 PERSIST — **Inventory Agent** … (`tool_name`).
# Step 6 SUMMARIZE — Head reports tool result.
# ```
#
# **Addition:** LOOKUP → not found → PREVIEW → CONFIRM → PERSIST  
# **Update:** LOOKUP → found → PREVIEW diff → CONFIRM → PERSIST  
#
# Compose sub-workflows: `**{Other Workflow Name}**`
#
# ---
#
# ## Read workflow (Query)
#
# ```markdown
# ## {Topic} Query Golden Workflow
#
# `workflow_id` · **{Agent}** only · mode: **read**
#
# **Trigger:** …
#
# Step 1 PARSE — Extract entity name, period, or intent from chef message.
# Step 2 CONSULT — **{Agent}** calls `tool_name` (quote DB exactly).
# Step 3 ANSWER — Head reports facts; no invented numbers.
# Step 4 OPTIONAL — One follow-up question only if entity is ambiguous (blocked).
# ```
#
# **No CONFIRM gate** on pure reads unless Step 4 disambiguation is needed.
#
# **Escalate to write:** if chef says “add it” / “update it” → hand off to [golden-addition-workflows.md](./golden-addition-workflows.md) or [golden-update-workflows.md](./golden-update-workflows.md).
#
# ---
#
# ## Step verbs (uniform)
#
# | Verb | Who | Purpose |
# |------|-----|---------|
# | LOOKUP | Inventory (usually) | Row exists? Fetch current state |
# | BRANCH | Head | Stop, redirect, or continue |
# | PREVIEW | Head (+ Creative for drafts) | Show change before write |
# | CONFIRM | Head | Gate — chef yes/no/edit |
# | PERSIST | Inventory | Tool write after confirm |
# | SUMMARIZE | Head | Report what tools did |
# | PARSE | Head | Query intent only |
# | CONSULT | Specialist | Read tool call |
# | ANSWER | Head | Synthesize read result |
