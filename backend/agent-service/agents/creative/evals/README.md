# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# # Creator Agent evals
#
# Add golden conversation files here as you lock creative behavior. Suggested format:
#
# ```yaml
# id: expiry_smoothie
# description: Chef asks to use expiring mango; agent drafts recipe, does not save
# turns:
#   - role: user
#     content: What smoothie can we make with expiring mango?
# assertions:
#   - tool_called: query_inventory
#   - no_tool_called: apply_menu
#   - reply_contains: mango
# ```
#
# Run manually via chat until an automated eval runner is added.
