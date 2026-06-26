"""Persisted workflow state on a conversation."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class WorkflowState:
    workflow_id: str
    step_id: str
    locked_name: str = ""
    gates_passed: list[str] = field(default_factory=list)
    baggage: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "workflowId": self.workflow_id,
            "stepId": self.step_id,
            "lockedName": self.locked_name or None,
            "gatesPassed": self.gates_passed or None,
        }
        if self.baggage:
            payload["baggage"] = self.baggage
        return payload


def parse_workflow_state(raw: dict[str, Any] | None) -> WorkflowState | None:
    if not raw:
        return None
    wf_id = str(raw.get("workflowId") or raw.get("workflow_id") or "").strip()
    step_id = str(raw.get("stepId") or raw.get("step_id") or "").strip()
    if not wf_id or not step_id:
        return None
    locked = str(raw.get("lockedName") or raw.get("locked_name") or "").strip()
    gates_raw = raw.get("gatesPassed") or raw.get("gates_passed") or []
    gates = [str(g) for g in gates_raw] if isinstance(gates_raw, list) else []
    baggage_raw = raw.get("baggage") or {}
    baggage = dict(baggage_raw) if isinstance(baggage_raw, dict) else {}
    return WorkflowState(
        workflow_id=wf_id,
        step_id=step_id,
        locked_name=locked,
        gates_passed=gates,
        baggage=baggage,
    )
