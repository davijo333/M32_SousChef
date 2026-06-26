"""Tests for Sous Chef LLM triage and synthesis."""

from __future__ import annotations

from unittest.mock import patch

from api.schemas.chat import ChatRequest
from domain.context import TurnContext
from supervisor.graph import run_supervisor_turn
from supervisor.head_llm import synthesize_reply
from supervisor.router import RouteDecision
from supervisor.triage import TriageDecision, apply_triage, should_run_triage
from workflows.engine.state import WorkflowState


def test_should_skip_triage_when_workflow_active():
    ctx = TurnContext(
        restaurant_id="r1",
        user_id="u1",
        chef_name="Chef",
        restaurant_name="Kitchen",
        user_message="yes",
        history=[],
        finance_period="week",
        cues_text="",
        workflow_state=WorkflowState("add_dish_from_chat", "confirm_recipe"),
    )
    assert should_run_triage(ctx) is False


def test_apply_triage_sets_workflow_hint():
    ctx = TurnContext(
        restaurant_id="r1",
        user_id="u1",
        chef_name="Chef",
        restaurant_name="Kitchen",
        user_message="Lets add a new dish",
        history=[],
        finance_period="week",
        cues_text="",
    )
    decision = TriageDecision(
        action="start_workflow",
        workflow_id="add_dish_from_chat",
        locked_name="",
        confidence=0.9,
        reason="new dish intent",
    )
    with patch("supervisor.triage.run_triage", return_value=decision):
        apply_triage(ctx)
    assert ctx.triage_workflow_id == "add_dish_from_chat"
    assert ctx.triage_decision is decision


def test_regex_fallback_starts_add_dish():
    ctx = TurnContext(
        restaurant_id="r1",
        user_id="u1",
        chef_name="Chef",
        restaurant_name="Kitchen",
        user_message="Lets add a new dish",
        history=[],
        finance_period="week",
        cues_text="",
    )
    with patch("supervisor.triage.settings") as mock_settings:
        mock_settings.OPENAI_API_KEY = ""
        decision = apply_triage(ctx)
    assert decision is not None
    assert decision.action == "start_workflow"
    assert decision.workflow_id == "add_dish_from_chat"
    assert ctx.triage_workflow_id == "add_dish_from_chat"


def test_synthesize_uses_llm_when_available():
    ctx = TurnContext(
        restaurant_id="r1",
        user_id="u1",
        chef_name="Chef",
        restaurant_name="Kitchen",
        user_message="Lets add a new dish",
        history=[],
        finance_period="week",
        cues_text="",
        workflow_state=WorkflowState("add_dish_from_chat", "gather_preferences"),
    )
    route = RouteDecision("add_dish_from_chat", "gather_preferences", [], "answer")
    with patch("supervisor.head_llm.synthesize_with_llm", return_value="What cuisine are you thinking?"):
        reply = synthesize_reply(ctx, route)
    assert reply == "What cuisine are you thinking?"


def test_supervisor_turn_with_mocked_head():
    with patch("supervisor.triage._llm_triage") as mock_triage, patch(
        "supervisor.head_llm.synthesize_with_llm",
        return_value="Let's add something new — breakfast, lunch, or dinner?",
    ):
        mock_triage.return_value = TriageDecision(
            action="start_workflow",
            workflow_id="add_dish_from_chat",
            confidence=0.95,
        )
        result = run_supervisor_turn(
            ChatRequest(
                restaurant_id="r1",
                user_id="u1",
                chef_name="Chef",
                restaurant_name="Kitchen",
                message="Lets add a new dish",
            )
        )
    assert "breakfast" in result["reply"].lower() or "add" in result["reply"].lower()
    assert result["workflow_state"]["workflowId"] == "add_dish_from_chat"
    assert result["activity"]["triage"]["workflow_id"] == "add_dish_from_chat"
