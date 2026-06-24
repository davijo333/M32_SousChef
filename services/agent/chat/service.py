"""Chat API models and service."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from agents.prompts import AgentContext
from agents.runner import run_agent_chat
from tools.core.bills import upload_batch_ready

VALID_CONTEXTS = {"head", "inventory", "business", "create"}


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    restaurant_id: str
    user_id: str = ""
    chef_name: str = "Chef"
    restaurant_name: str = "your kitchen"
    message: str = ""
    context: str = "head"
    agent_context: str | None = None
    connect_agent: str | None = None
    history: list[ChatMessage] = Field(default_factory=list)
    finance_period: str = "week"
    cues_text: str = ""
    recent_bill_ids: list[str] = Field(default_factory=list)
    upload_batch: dict | None = None
    confirm_suggestion: bool = False
    confirm_inventory: bool = False
    confirm_business: bool = False


class SuggestionAction(BaseModel):
    name: str
    description: str
    classification: str
    ingredientSlugs: list[str] = Field(default_factory=list)
    notes: list[dict[str, str]] = Field(default_factory=list)


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


class ChatResponse(BaseModel):
    reply: str
    agent_context: str
    handoff: str | None = None
    suggestion_action: SuggestionAction | None = None
    pending_action: PendingAction | None = None
    navigation_action: NavigationAction | None = None


def _normalize_context(value: str | None, fallback: str = "head") -> AgentContext:
    ctx = (value or fallback).strip()
    if ctx not in VALID_CONTEXTS:
        raise ValueError(f"Invalid context: {ctx}")
    return ctx  # type: ignore[return-value]


def handle_chat(req: ChatRequest) -> ChatResponse:
    context = _normalize_context(req.context, "head")
    agent_context = _normalize_context(req.agent_context or req.context, context)
    connect_agent: AgentContext | None = None
    if req.connect_agent:
        connect_agent = _normalize_context(req.connect_agent)
        agent_context = connect_agent

    if not req.message.strip() and not connect_agent and not upload_batch_ready(req.upload_batch):
        raise ValueError("message required")

    result = run_agent_chat(
        restaurant_id=req.restaurant_id,
        user_id=req.user_id,
        recent_bill_ids=req.recent_bill_ids,
        upload_batch=req.upload_batch,
        chef_name=req.chef_name,
        restaurant_name=req.restaurant_name,
        message=req.message.strip(),
        context=context,
        agent_context=agent_context,
        history=[row.model_dump() for row in req.history],
        finance_period=req.finance_period,
        cues_text=req.cues_text,
        connect_agent=connect_agent,
        confirm_suggestion=req.confirm_suggestion,
        confirm_inventory=req.confirm_inventory,
        confirm_business=req.confirm_business,
    )

    suggestion = None
    if result.get("suggestion_action"):
        suggestion = SuggestionAction.model_validate(result["suggestion_action"])

    pending = None
    if result.get("pending_action"):
        pending = PendingAction.model_validate(result["pending_action"])

    navigation = None
    if result.get("navigation_action"):
        navigation = NavigationAction.model_validate(result["navigation_action"])

    handoff = result.get("handoff")
    if not handoff and navigation and navigation.agent:
        handoff = navigation.agent

    return ChatResponse(
        reply=result["reply"],
        agent_context=result["agent_context"],
        handoff=handoff,
        suggestion_action=suggestion,
        pending_action=pending,
        navigation_action=navigation,
    )
