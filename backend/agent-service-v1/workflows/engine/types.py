"""Lightweight turn view for workflow engine — no API/pydantic imports."""

from __future__ import annotations

from typing import Any, Protocol

from workflows.engine.state import WorkflowState


class WorkflowTurn(Protocol):
    user_message: str
    workflow_state: WorkflowState | None
    catalog_draft: dict[str, Any] | None
    upload_batch: dict[str, Any] | None
    triage_workflow_id: str | None
    triage_locked_name: str
    consult_results: dict[str, str]
