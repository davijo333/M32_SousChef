"""Per-turn execution context passed through the supervisor graph."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from api.schemas.chat import ChatRequest
from domain.messages import TurnMessage

if TYPE_CHECKING:
    from workflows.engine.state import WorkflowState


@dataclass
class TurnContext:
    """Immutable-ish view of one chef message + session carry-over."""

    restaurant_id: str
    user_id: str
    chef_name: str
    restaurant_name: str
    user_message: str
    history: list[TurnMessage]
    finance_period: str
    cues_text: str
    workflow_state: WorkflowState | None = None
    catalog_draft: dict[str, Any] | None = None
    recipe_build: dict[str, Any] | None = None
    upload_batch: dict[str, Any] | None = None
    recent_bill_ids: list[str] = field(default_factory=list)
    confirm_inventory: bool = False
    confirm_business: bool = False
    confirm_suggestion: bool = False
    consult_results: dict[str, str] = field(default_factory=dict)
    consult_side_effects: dict[str, dict] = field(default_factory=dict)
    triage_workflow_id: str | None = None
    triage_locked_name: str = ""
    triage_decision: Any | None = None

    @classmethod
    def from_request(cls, req: ChatRequest) -> TurnContext:
        from workflows.engine.state import parse_workflow_state

        history = [TurnMessage(role=m.role, content=m.content) for m in req.history]
        return cls(
            restaurant_id=req.restaurant_id,
            user_id=req.user_id,
            chef_name=req.chef_name,
            restaurant_name=req.restaurant_name,
            user_message=req.message.strip(),
            history=history,
            finance_period=req.finance_period,
            cues_text=req.cues_text,
            workflow_state=parse_workflow_state(req.workflow_state),
            catalog_draft=req.catalog_draft,
            recipe_build=req.recipe_build,
            upload_batch=req.upload_batch,
            recent_bill_ids=list(req.recent_bill_ids or []),
            confirm_inventory=req.confirm_inventory,
            confirm_business=req.confirm_business,
            confirm_suggestion=req.confirm_suggestion,
        )
