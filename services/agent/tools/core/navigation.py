"""Navigation targets for orchestrate internal actions."""

from __future__ import annotations

NAV_TARGETS: dict[str, tuple[str, str]] = {
    "upload_orders": ("/upload-orders", "Upload orders"),
    "upload_purchase": ("/upload-orders?tab=purchase", "Upload purchase orders"),
    "upload_sales": ("/upload-orders?tab=sales", "Upload sales orders"),
    "kitchen_control": ("/kitchen-control", "Kitchen control"),
    "recipes": ("/recipes", "Recipes"),
    "dashboard": ("/dashboard", "Dashboard"),
}

AGENT_CHAT_TARGETS: dict[str, tuple[str, str]] = {
    "inventory": ("inventory", "Inventory Agent"),
    "business": ("business", "Business Agent"),
    "create": ("create", "Creative Agent"),
    "creative": ("create", "Creative Agent"),
}
