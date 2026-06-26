# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Chat API models and service."""
#
# from __future__ import annotations
#
# from typing import Literal
#
# from pydantic import BaseModel, Field
#
# from agents.shared.prompts import AgentContext
# from agents.runtime.runner import run_agent_chat
# from tools.core.bills import upload_batch_ready
#
# VALID_CONTEXTS = {"head", "inventory", "business", "create"}
#
#
# class ChatMessage(BaseModel):
#     role: Literal["user", "assistant", "system"]
#     content: str
#
#
# class ChatRequest(BaseModel):
#     restaurant_id: str
#     user_id: str = ""
#     chef_name: str = "Chef"
#     restaurant_name: str = "your kitchen"
#     message: str = ""
#     context: str = "head"
#     agent_context: str | None = None
#     connect_agent: str | None = None
#     history: list[ChatMessage] = Field(default_factory=list)
#     finance_period: str = "week"
#     cues_text: str = ""
#     recent_bill_ids: list[str] = Field(default_factory=list)
#     upload_batch: dict | None = None
#     catalog_draft: dict | None = None
#     recipe_build: dict | None = None
#     confirm_suggestion: bool = False
#     confirm_inventory: bool = False
#     confirm_business: bool = False
#     workflow_state: dict | None = None
#
#
# class SuggestionAction(BaseModel):
#     name: str
#     description: str
#     classification: str
#     ingredientSlugs: list[str] = Field(default_factory=list)
#     notes: list[dict[str, str]] = Field(default_factory=list)
#
#
# class PendingAction(BaseModel):
#     kind: Literal[
#         "process_purchase_bills",
#         "process_sales_bills",
#         "update_reorder_threshold",
#         "create_ingredient",
#         "update_ingredient",
#         "delete_ingredient",
#         "generate_dish_image",
#         "generate_ingredient_image",
#         "create_dish",
#         "update_dish",
#         "delete_dish",
#         "link_dish_ingredients",
#         "enrich_dish_description",
#         "update_dish_price",
#         "finalize_recipe_build",
#     ]
#     billIds: list[str] = Field(default_factory=list)
#     billType: Literal["supplier", "customer"] | None = None
#     slug: str | None = None
#     reorderThreshold: float | None = None
#     ingredientName: str | None = None
#     dishName: str | None = None
#     description: str | None = None
#     classification: str | None = None
#     sellPrice: float | None = None
#     imageMode: Literal["pair", "secondary"] | None = None
#     ingredientSlugs: list[str] = Field(default_factory=list)
#     category: str | None = None
#     inventoryUnit: str | None = None
#     currentQty: float | None = None
#     brandName: str | None = None
#     linkMode: Literal["add", "remove", "set"] | None = None
#     qtyPerServing: float | None = None
#     label: Literal["new", "used", "unused", "missing"] | None = None
#     recipeBuildPlan: dict | None = None
#
#
# class NavigationAction(BaseModel):
#     path: str
#     label: str
#     agent: Literal["inventory", "business", "create"] | None = None
#
#
# class ChatActivity(BaseModel):
#     orchestrator: Literal["head"] = "head"
#     consulted_agents: list[Literal["inventory", "business", "create"]] = Field(default_factory=list)
#
#
# class ChatResponse(BaseModel):
#     reply: str
#     agent_context: str
#     handoff: str | None = None
#     suggestion_action: SuggestionAction | None = None
#     pending_action: PendingAction | None = None
#     navigation_action: NavigationAction | None = None
#     recipe_build: dict | None = None
#     activity: ChatActivity | None = None
#     workflow_state: dict | None = None
#
#
# def _normalize_context(value: str | None, fallback: str = "head") -> AgentContext:
#     ctx = (value or fallback).strip()
#     if ctx not in VALID_CONTEXTS:
#         raise ValueError(f"Invalid context: {ctx}")
#     return ctx  # type: ignore[return-value]
#
#
# def handle_chat(req: ChatRequest) -> ChatResponse:
#     context = _normalize_context(req.context, "head")
#     agent_context = _normalize_context(req.agent_context or req.context, context)
#     connect_agent: AgentContext | None = None
#     if req.connect_agent:
#         connect_agent = _normalize_context(req.connect_agent)
#         agent_context = connect_agent
#
#     if not req.message.strip() and not connect_agent and not upload_batch_ready(req.upload_batch):
#         raise ValueError("message required")
#
#     result = run_agent_chat(
#         restaurant_id=req.restaurant_id,
#         user_id=req.user_id,
#         recent_bill_ids=req.recent_bill_ids,
#         upload_batch=req.upload_batch,
#         catalog_draft=req.catalog_draft,
#         recipe_build=req.recipe_build,
#         chef_name=req.chef_name,
#         restaurant_name=req.restaurant_name,
#         message=req.message.strip(),
#         context=context,
#         agent_context=agent_context,
#         history=[row.model_dump() for row in req.history],
#         finance_period=req.finance_period,
#         cues_text=req.cues_text,
#         connect_agent=connect_agent,
#         confirm_suggestion=req.confirm_suggestion,
#         confirm_inventory=req.confirm_inventory,
#         confirm_business=req.confirm_business,
#         workflow_state=req.workflow_state,
#     )
#
#     suggestion = None
#     if result.get("suggestion_action"):
#         suggestion = SuggestionAction.model_validate(result["suggestion_action"])
#
#     pending = None
#     if result.get("pending_action"):
#         pending = PendingAction.model_validate(result["pending_action"])
#
#     navigation = None
#     if result.get("navigation_action"):
#         navigation = NavigationAction.model_validate(result["navigation_action"])
#
#     handoff = result.get("handoff")
#     if not handoff and navigation and navigation.agent:
#         handoff = navigation.agent
#
#     return ChatResponse(
#         reply=result["reply"],
#         agent_context=result["agent_context"],
#         handoff=handoff,
#         suggestion_action=suggestion,
#         pending_action=pending,
#         navigation_action=navigation,
#         recipe_build=result.get("recipe_build"),
#         activity=ChatActivity.model_validate(result["activity"]) if result.get("activity") else None,
#         workflow_state=result.get("workflow_state"),
#     )
