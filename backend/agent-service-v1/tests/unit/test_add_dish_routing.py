"""Tests for Sous Chef step replies and add-dish routing."""

from __future__ import annotations

from types import SimpleNamespace

from api.schemas.chat import ChatRequest
from domain.context import TurnContext
from supervisor.graph import run_supervisor_turn
from supervisor.router import RouteDecision
from supervisor.synthesizer import synthesize_reply
from workflows.engine.executor import resolve_step_for_turn
from workflows.engine.state import WorkflowState


def _ctx(message: str, *, workflow_state: WorkflowState | None = None):
    return SimpleNamespace(
        restaurant_id="r1",
        user_id="u1",
        chef_name="Chef",
        restaurant_name="Test Kitchen",
        user_message=message,
        history=[],
        finance_period="week",
        cues_text="",
        workflow_state=workflow_state,
        catalog_draft=None,
        upload_batch=None,
        recipe_build=None,
        confirm_inventory=False,
        confirm_business=False,
        confirm_suggestion=False,
        consult_results={},
        triage_workflow_id=None,
        triage_locked_name="",
    )


def test_add_new_dish_routes_to_gather_preferences():
    step, state = resolve_step_for_turn(_ctx("Lets add a new dish"))
    assert step is not None
    assert step.workflow_id == "add_dish_from_chat"
    assert step.step_id == "gather_preferences"
    assert state is not None


def test_gather_preferences_scripted_reply():
    ctx = TurnContext(
        restaurant_id="r1",
        user_id="u1",
        chef_name="Chef",
        restaurant_name="Test Kitchen",
        user_message="Lets add a new dish",
        history=[],
        finance_period="week",
        cues_text="",
        workflow_state=WorkflowState("add_dish_from_chat", "gather_preferences"),
    )
    route = RouteDecision("add_dish_from_chat", "gather_preferences", [], "answer")
    reply = synthesize_reply(ctx, route)
    assert "add a new dish" in reply.lower()
    assert "?" in reply


def test_follow_up_advances_to_suggest_dish_ideas():
    state = WorkflowState("add_dish_from_chat", "gather_preferences")
    step, new_state = resolve_step_for_turn(_ctx("Italian pasta for lunch", workflow_state=state))
    assert step is not None
    assert step.step_id == "suggest_dish_ideas"
    assert step.delegate == ["create"]
    assert new_state is not None
    assert new_state.baggage.get("chef_constraints") == "Italian pasta for lunch"


def test_supervisor_turn_add_new_dish():
    result = run_supervisor_turn(
        ChatRequest(
            restaurant_id="r1",
            user_id="u1",
            chef_name="Chef",
            restaurant_name="Test Kitchen",
            message="Lets add a new dish",
        )
    )
    assert "What would you like to do next?" not in result["reply"]
    assert result["workflow_state"] is not None
    assert result["workflow_state"]["workflowId"] == "add_dish_from_chat"
