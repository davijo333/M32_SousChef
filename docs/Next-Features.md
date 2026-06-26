# Next Features

Planned capabilities not yet built. Directional — scope and sequencing may change.

- **Point of Sale integration** — Connect Square, Toast, Clover, or similar via MCP/webhooks so sales orders flow in live (not only uploaded receipts). Recipe-linked stock depletion and Business summaries stay current without manual bill uploads.

- **Adaptive reorder** — Reorder thresholds and suggested order qty adjust from **sales velocity**, **waste/spoilage logs**, and **expiry risk** — not a fixed number per ingredient. Business Agent proposes; Inventory applies after confirm; feeds into auto-order when delivery MCP is wired.

- **Ingredient best price (near me / online)** — When an item is low or on the reorder list, surface cheapest local supplier, wholesaler, or online option for that SKU. Compare unit-normalized price, pack size, and delivery window; chef picks or confirms before order.

- **MCP delivery integrations for auto-reorder** — Place purchase orders through delivery/supplier apps when stock hits reorder level. MCP tools for search, cart, submit, and confirm; order recorded as a PO in MongoDB. Confirm-before-submit per kitchen or ingredient until SKU mapping is trusted.
