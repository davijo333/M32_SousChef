"""Pending write actions executed by Next.js after chef confirmation."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from tools.core.models import SuggestedDishDraft


class PendingAction(BaseModel):
    kind: Literal[
        "process_purchase_bills",
        "process_sales_bills",
        "update_reorder_threshold",
        "generate_dish_image",
        "generate_ingredient_image",
        "create_dish",
        "update_dish",
        "enrich_dish_description",
        "update_dish_price",
    ]
    billIds: list[str] = Field(default_factory=list)
    billType: Literal["supplier", "customer"] | None = None
    slug: str | None = None
    reorderThreshold: float | None = None
    ingredientName: str | None = None
    dishName: str | None = None
    description: str | None = None
    classification: str | None = None
    sellPrice: float | None = None
    imageMode: Literal["pair", "secondary"] | None = None
    ingredientSlugs: list[str] = Field(default_factory=list)


class NavigationAction(BaseModel):
    path: str
    label: str
    agent: Literal["inventory", "business", "create"] | None = None


class CoreToolContext:
    """Mutable sinks populated by consolidated write tools."""

    def __init__(
        self,
        *,
        user_id: str = "",
        upload_batch: dict[str, Any] | None = None,
        confirm_inventory: bool = False,
        confirm_business: bool = False,
        confirm_suggestion: bool = False,
    ) -> None:
        self.user_id = user_id
        self.upload_batch = upload_batch or {}
        self.confirm_inventory = confirm_inventory
        self.confirm_business = confirm_business
        self.confirm_suggestion = confirm_suggestion
        self.pending_actions: list[PendingAction] = []
        self.navigation_actions: list[NavigationAction] = []
        self.suggestion_sink: list[SuggestedDishDraft] = []
        self.batch_auto_process = False

    def push_pending(self, action: PendingAction) -> None:
        self.pending_actions.append(action)

    def push_navigation(self, action: NavigationAction) -> None:
        self.navigation_actions.append(action)

    def latest_pending(self) -> dict[str, Any] | None:
        if not self.pending_actions:
            return None
        return self.pending_actions[-1].model_dump()

    def latest_navigation(self) -> dict[str, Any] | None:
        if not self.navigation_actions:
            return None
        return self.navigation_actions[-1].model_dump()
