# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# # Inventory Agent evals
#
# Add golden conversation files here as you lock inventory behavior. Suggested format:
#
# ```yaml
# id: low_stock_summary
# description: Chef asks for low stock; agent uses query_inventory only
# turns:
#   - role: user
#     content: What's low stock right now?
# assertions:
#   - tool_called: query_inventory
#   - no_tool_called: apply_inventory
#   - reply_contains: reorder
# ```
#
# Run manually via chat until an automated eval runner is added.
