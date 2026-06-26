"""Chat API contracts."""

from __future__ import annotations  # noqa: I001 — required for str | None on Python 3.9+

from typing import Any, Literal

from pydantic import BaseModel, Field

AgentContext = Literal["head", "inventory", "business", "create"]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class WorkflowStatePayload(BaseModel):
    workflow_id: str = Field(alias="workflowId")
    step_id: str = Field(alias="stepId")
    locked_name: str | None = Field(default=None, alias="lockedName")
    gates_passed: list[str] = Field(default_factory=list, alias="gatesPassed")
    baggage: dict[str, Any] | None = None

    model_config = {"populate_by_name": True}


class ChatRequest(BaseModel):
    restaurant_id: str
    user_id: str = ""
    chef_name: str = "Chef"
    restaurant_name: str = "your kitchen"
    message: str = ""
    context: AgentContext = "head"
    history: list[ChatMessage] = Field(default_factory=list)
    finance_period: str = "week"
    cues_text: str = ""
    workflow_state: dict[str, Any] | None = None
    catalog_draft: dict[str, Any] | None = None
    recipe_build: dict[str, Any] | None = None
    upload_batch: dict[str, Any] | None = None
    recent_bill_ids: list[str] = Field(default_factory=list)
    confirm_inventory: bool = False
    confirm_business: bool = False
    confirm_suggestion: bool = False

    model_config = {"populate_by_name": True, "extra": "ignore"}


class ChatResponse(BaseModel):
    reply: str
    agent_context: AgentContext = "head"
    workflow_state: dict[str, Any] | None = None
    recipe_build: dict[str, Any] | None = None
    pending_action: dict[str, Any] | None = None
    navigation_action: dict[str, Any] | None = None
    activity: dict[str, Any] = Field(default_factory=dict)
