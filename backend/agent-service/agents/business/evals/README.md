# Business Agent evals

Add golden conversation files here as you lock business behavior. Suggested format:

```yaml
id: margin_pass_latte
description: Chef asks to fix margin; agent suggests price, does not apply
turns:
  - role: user
    content: Should we raise the price on the house latte?
assertions:
  - tool_called: query_business
  - no_tool_called: apply_inventory
  - reply_contains: margin
```

Run manually via chat until an automated eval runner is added.
