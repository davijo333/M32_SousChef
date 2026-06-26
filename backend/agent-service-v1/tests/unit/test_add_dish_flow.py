"""Multi-turn add-dish flow tests — pick through confirm gates."""

from __future__ import annotations

from unittest.mock import patch

from api.schemas.chat import ChatRequest
from supervisor.graph import run_supervisor_turn
from workflows.engine.transitions import parse_dish_idea_names

IDEAS_REPLY = """Here are the dish ideas for breakfast:

1. Avocado Spinach Toast
- Description: Creamy avocado spread on toasted multigrain bread.
- Why Today: Fresh avocados expiring soon.

2. Veggie Omelette
- Description: Fluffy omelette with peppers and tomatoes.
- Why Today: Peppers and tomatoes expiring soon.

3. Spinach and Tomato Breakfast Wrap
- Description: Wrap with eggs, spinach, and tomatoes.
- Why Today: Use fresh spinach and tomatoes.

Which dish — **1**, **2**, or **3**?"""

RECIPE_DRAFT = """### Veggie Omelette

Description: Fluffy omelette with peppers and tomatoes.

Ingredients:
- Eggs: 2 each
- Green Bell Pepper: 0.5 cup
- Roma Tomato: 0.5 cup

Preparation Steps:
1. Sauté peppers and tomatoes.
2. Add beaten eggs and cook until set.

Visual Brief: Golden omelette on a plate with toast.

Suggested Add-Ons:
- Cheddar Cheese
"""


def _req(message: str, *, workflow_state: dict | None = None, history: list | None = None):
    return ChatRequest(
        restaurant_id="r1",
        user_id="u1",
        chef_name="Chef",
        restaurant_name="Test Kitchen",
        message=message,
        history=history or [],
        workflow_state=workflow_state,
    )


def test_parse_user_format_ideas():
    names = parse_dish_idea_names(IDEAS_REPLY)
    assert names == [
        "Avocado Spinach Toast",
        "Veggie Omelette",
        "Spinach and Tomato Breakfast Wrap",
    ]


@patch("supervisor.graph.run_specialist_consult")
@patch("supervisor.graph.synthesize_reply")
def test_pick_2_after_failed_pick_prompt(mock_synth, mock_consult):
    mock_consult.return_value = "no duplicate — clear to proceed"
    mock_synth.return_value = "Locked **Veggie Omelette**."

    history = [
        {"role": "user", "content": "breakfast"},
        {"role": "assistant", "content": IDEAS_REPLY},
        {"role": "user", "content": "2"},
        {"role": "assistant", "content": "Which dish — **1**, **2**, or **3**? (Yes/No/Customize)"},
    ]
    result = run_supervisor_turn(
        _req(
            "2",
            workflow_state={
                "workflowId": "add_dish_from_chat",
                "stepId": "pick_dish",
            },
            history=history,
        )
    )
    assert result["workflow_state"] is not None
    assert result["workflow_state"]["stepId"] == "confirm_dish_identity"
    assert result["workflow_state"].get("lockedName") == "Veggie Omelette"


@patch("supervisor.graph.run_specialist_consult")
@patch("supervisor.graph.synthesize_reply")
def test_pick_2_survives_consult_failure(mock_synth, mock_consult):
    """Digit pick must not 500 when duplicate_check inventory consult fails."""
    mock_consult.side_effect = ValueError("Invalid restaurant_id")
    mock_synth.return_value = "Does **Veggie Omelette** look right for the menu?"

    history = [
        {"role": "user", "content": "breakfast"},
        {"role": "assistant", "content": IDEAS_REPLY},
    ]
    result = run_supervisor_turn(
        _req(
            "2",
            workflow_state={
                "workflowId": "add_dish_from_chat",
                "stepId": "pick_dish",
            },
            history=history,
        )
    )
    wf = result["workflow_state"]
    assert wf is not None
    assert wf["stepId"] == "confirm_dish_identity"
    assert wf.get("lockedName") == "Veggie Omelette"
    mock_consult.assert_not_called()


@patch("supervisor.graph.run_specialist_consult")
@patch("supervisor.graph.synthesize_reply")
def test_breakfast_turn_stores_ideas_on_pick_dish(mock_synth, mock_consult):
    mock_consult.return_value = "### 1. **Avocado Spinach Toast**\n### 2. **Veggie Omelette**"
    mock_synth.return_value = IDEAS_REPLY

    result = run_supervisor_turn(
        _req(
            "breakfast",
            workflow_state={
                "workflowId": "add_dish_from_chat",
                "stepId": "gather_preferences",
                "baggage": {"chef_constraints": "breakfast"},
            },
            history=[{"role": "user", "content": "lets add a dish"}],
        )
    )
    wf = result["workflow_state"]
    assert wf is not None
    assert wf["stepId"] == "pick_dish"
    names = (wf.get("baggage") or {}).get("dish_idea_names") or []
    assert len(names) >= 2


@patch("supervisor.graph.run_specialist_consult")
@patch("supervisor.graph.synthesize_reply")
def test_identity_yes_lands_on_confirm_recipe(mock_synth, mock_consult):
    mock_consult.return_value = RECIPE_DRAFT
    mock_synth.return_value = RECIPE_DRAFT + "\n\nDoes this recipe look good?"

    result = run_supervisor_turn(
        _req(
            "yes",
            workflow_state={
                "workflowId": "add_dish_from_chat",
                "stepId": "confirm_dish_identity",
                "lockedName": "Veggie Omelette",
            },
            history=[
                {"role": "user", "content": "2"},
                {"role": "assistant", "content": "Does **Veggie Omelette** look right?"},
            ],
        )
    )
    wf = result["workflow_state"]
    assert wf is not None
    assert wf["stepId"] == "confirm_recipe"
    assert (wf.get("baggage") or {}).get("recipe_draft_raw")
