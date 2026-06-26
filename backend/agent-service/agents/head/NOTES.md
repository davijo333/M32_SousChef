# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# # Sous Chef (head) — spec complete
#
# ## Policy
#
# Orchestrates only — **no catalog writes**. Consults specialists sequentially; **Inventory** executes mutations.
#
# ## Tools
#
# | Tool | Purpose |
# |------|---------|
# | `query_kitchen` | Combined snapshots |
# | `orchestrate` | consult_*, handoff, navigate |
#
# ## Spec files
#
# - [x] `profile.yaml`, `instructions.md`, `tasks.yaml`, `cards.yaml`
# - [x] `golden-workflows.yaml` — predictable multi-step flows
# - [x] `evals/README.md` — placeholder for golden conversations
# - [x] Synced `dashboard-chat.ts` head profile
# - [x] Wired `spec_loader` in `prompts.py` + `specialists.py`
# - [x] Update `agents/sous-chef.md`
#
# ## Orchestration (aligned)
#
# - Kitchen build **not confirmed** → consult **Creative** (recipe + **visual brief** + suggested add-ons)
# - Add-on / modifier questions for locked dish → consult **Creative**
# - Kitchen build **confirmed** → consult **Inventory** only (plan_recipe_build with visual_brief → finalize; auto images)
# - Pantry add-zero → **Inventory**
# - **No image or store-product picking in chat** — Kitchen control Generate is fail-safe when `missingPhotos`
#
# ## Repo docs
#
# - [x] `agents/sous-chef.md` — golden workflows + Creative add-on delegation
