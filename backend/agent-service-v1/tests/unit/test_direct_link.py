"""Direct link consult for standalone chat link workflows."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from domain.context import TurnContext
from domain.messages import TurnMessage
from specialists.direct_link import (
    extract_recent_addon_name,
    parse_addon_dish_link,
    parse_addon_ingredient_link,
    parse_dish_ingredient_link,
    prime_link_chat_intake,
    try_direct_link,
)
from workflows.engine.loader import get_workflow
from workflows.engine.state import WorkflowState


def test_parse_dish_ingredient_link():
    ing, dish, mode = parse_dish_ingredient_link(
        "Add honey to the Mango Paradise Smoothie recipe"
    )
    assert ing.lower() == "honey"
    assert "mango paradise smoothie" in dish.lower()
    assert mode == "add"


def test_parse_addon_dish_link():
    addon, dish = parse_addon_dish_link("Link Sausage add-on to The Sunrise Stack dish")
    assert addon.lower() == "sausage"
    assert "sunrise stack" in dish.lower()


def test_parse_addon_as_modifier_to_dish():
    addon, dish = parse_addon_dish_link("add glazed bananas as add-on to pancakes")
    assert "glazed bananas" in addon.lower()
    assert dish.lower() == "pancakes"


def test_parse_link_pronoun_to_dish():
    addon, dish = parse_addon_dish_link("link it to pancakes")
    assert addon == ""
    assert dish.lower() == "pancakes"


def test_extract_recent_addon_name_from_lookup_thread():
    history = [
        {"role": "user", "content": "do we have glazed bananas"},
        {
            "role": "assistant",
            "content": (
                "Add-ons:\n"
                "glazed bananas (`addon-glazed-bananas`) — Add-on\n"
                "- Sell price (menu): $0.00"
            ),
        },
        {"role": "user", "content": "add glazed bananas as add-on to pancakes"},
        {"role": "assistant", "content": "Add-on **glazed bananas** already exists."},
    ]
    assert extract_recent_addon_name(history, "link it to pancakes").lower() == "glazed bananas"


def test_prime_link_chat_intake_resolves_pronoun_addon():
    ctx = TurnContext(
        restaurant_id="507f1f77bcf86cd799439011",
        user_id="507f1f77bcf86cd799439012",
        chef_name="Chef",
        restaurant_name="Test",
        user_message="link it to pancakes",
        history=[
            TurnMessage(
                role="assistant",
                content="Add-ons:\n**glazed bananas** (`addon-glazed-bananas`) — Add-on",
            )
        ],
        finance_period="week",
        cues_text="",
        workflow_state=WorkflowState("link_addons_to_dish_chat", "intake"),
    )
    state = prime_link_chat_intake(ctx, ctx.workflow_state)
    assert state.locked_name.lower() == "pancakes"
    assert state.baggage.get("addon_name", "").lower() == "glazed bananas"


def test_parse_addon_ingredient_link():
    ing, addon, mode = parse_addon_ingredient_link(
        "linked ingredient bananas to add-on glazed bananas"
    )
    assert ing.lower() == "bananas"
    assert "glazed bananas" in addon.lower()
    assert mode == "add"


def test_parse_addon_ingredient_link_without_addon_keyword():
    ing, addon, mode = parse_addon_ingredient_link("link bananas to glazed bananas")
    assert ing.lower() == "bananas"
    assert "glazed bananas" in addon.lower()
    assert mode == "add"


def test_prefers_addon_ingredient_link_short_phrase():
    from specialists.direct_link import prefers_addon_ingredient_link

    assert prefers_addon_ingredient_link("link bananas to glazed bananas")
    assert not prefers_addon_ingredient_link("link glazed bananas to pancakes")


def test_chat_link_workflows_catalogued():
    for wf_id in (
        "link_dish_ingredients_chat",
        "link_addon_ingredients_chat",
        "link_addons_to_dish_chat",
    ):
        wf = get_workflow(wf_id)
        assert wf is not None
        assert wf.get("direct_delegate") is True


def test_prime_link_chat_intake_sets_baggage():
    ctx = TurnContext(
        restaurant_id="507f1f77bcf86cd799439011",
        user_id="507f1f77bcf86cd799439012",
        chef_name="Chef",
        restaurant_name="Test",
        user_message="Add honey to the Mango Paradise Smoothie recipe",
        history=[],
        finance_period="week",
        cues_text="",
        workflow_state=WorkflowState("link_dish_ingredients_chat", "intake"),
    )
    state = prime_link_chat_intake(ctx, ctx.workflow_state)
    assert state.locked_name
    assert state.baggage.get("link_ingredient_name", "").lower() == "honey"


@patch("tools.core.menu_actions.resolve_dish_slug")
@patch("tools.core.catalog_reads.format_dish_detail")
def test_lookup_dish_ingredient_link_direct(mock_detail, mock_resolve):
    mock_resolve.return_value = {"slug": "dish-mango", "name": "Mango Paradise Smoothie"}
    mock_detail.return_value = "**Mango Paradise Smoothie** (`dish-mango`)"

    ctx = TurnContext(
        restaurant_id="507f1f77bcf86cd799439011",
        user_id="507f1f77bcf86cd799439012",
        chef_name="Chef",
        restaurant_name="Test",
        user_message="Add honey to the Mango Paradise Smoothie recipe",
        history=[],
        finance_period="week",
        cues_text="",
        workflow_state=WorkflowState(
            "link_dish_ingredients_chat",
            "lookup",
            locked_name="Mango Paradise Smoothie",
            baggage={"link_ingredient_name": "honey", "link_mode": "add"},
        ),
    )

    result = try_direct_link(ctx, "lookup")

    assert result is not None
    assert "Mango Paradise Smoothie" in result
    assert "honey" in result.lower()
    assert ctx.workflow_state.baggage.get("locked_slug") == "dish-mango"


@patch("tools.core.menu_actions.resolve_addon_slug")
@patch("tools.core.menu_actions.resolve_dish_slug")
@patch("tools.core.catalog_reads.format_dish_detail")
@patch("db.mongo.find_one")
def test_lookup_addon_dish_link_resolves_pronoun_from_history(
    mock_find_one, mock_detail, mock_resolve_dish, mock_resolve_addon
):
    mock_resolve_dish.return_value = {"slug": "dish-pancakes", "name": "Pancakes"}
    mock_resolve_addon.return_value = {"slug": "addon-glazed-bananas", "name": "Glazed Bananas"}
    mock_detail.return_value = "**Pancakes** (`dish-pancakes`)"
    mock_find_one.return_value = {"linkedDishSlugs": []}

    ctx = TurnContext(
        restaurant_id="507f1f77bcf86cd799439011",
        user_id="507f1f77bcf86cd799439012",
        chef_name="Chef",
        restaurant_name="Test",
        user_message="link it to pancakes",
        history=[
            TurnMessage(
                role="assistant",
                content="Add-ons:\n**glazed bananas** (`addon-glazed-bananas`) — Add-on",
            )
        ],
        finance_period="week",
        cues_text="",
        workflow_state=WorkflowState(
            "link_addons_to_dish_chat",
            "lookup",
            locked_name="pancakes",
            baggage={"addon_name": "glazed bananas"},
        ),
    )

    result = try_direct_link(ctx, "lookup")

    assert result is not None
    assert "Glazed Bananas" in result or "glazed bananas" in result.lower()
    assert "pancakes" in result.lower()
    mock_resolve_addon.assert_called_once()
    assert mock_resolve_addon.call_args.kwargs.get("name", "").lower() == "glazed bananas"


@patch("tools.core.factory._apply_menu")
@patch("specialists.react_runner.build_core_ctx")
def test_persist_dish_ingredient_link_sets_side_effects(mock_core_ctx, mock_apply_menu):
    pending_ctx = MagicMock()
    pending_ctx.latest_pending.return_value = {"kind": "link_dish_ingredients"}
    pending_ctx.recipe_build = None
    pending_ctx.latest_navigation.return_value = None
    mock_core_ctx.return_value = pending_ctx
    mock_apply_menu.return_value = MagicMock(
        invoke=MagicMock(return_value="Confirmed — updating dish ingredient links.")
    )

    ctx = TurnContext(
        restaurant_id="507f1f77bcf86cd799439011",
        user_id="507f1f77bcf86cd799439012",
        chef_name="Chef",
        restaurant_name="Test",
        user_message="Yes, go ahead",
        history=[],
        finance_period="week",
        cues_text="",
        confirm_inventory=True,
        workflow_state=WorkflowState(
            "link_dish_ingredients_chat",
            "persist",
            locked_name="Mango Paradise Smoothie",
            baggage={
                "locked_slug": "dish-mango",
                "link_ingredient_slug": "ing-honey",
                "link_mode": "add",
            },
        ),
    )

    result = try_direct_link(ctx, "persist")

    assert result is not None
    assert "Confirmed" in result
    assert ctx.consult_side_effects["inventory"]["pending_action"]["kind"] == "link_dish_ingredients"


@patch("tools.core.factory._apply_menu")
@patch("specialists.react_runner.build_core_ctx")
def test_persist_addon_dish_link_sets_update_addon_pending(mock_core_ctx, mock_apply_menu):
    pending_ctx = MagicMock()
    pending_ctx.latest_pending.return_value = {
        "kind": "update_addon",
        "slug": "addon-glazed-bananas",
        "linkedDishSlugs": ["dish-pancakes"],
    }
    pending_ctx.recipe_build = None
    pending_ctx.latest_navigation.return_value = None
    mock_core_ctx.return_value = pending_ctx
    invoke = MagicMock(
        return_value="Update add-on **glazed bananas**: linked dishes → 1.\n\nConfirmed — updating add-on."
    )
    mock_apply_menu.return_value = MagicMock(invoke=invoke)

    ctx = TurnContext(
        restaurant_id="507f1f77bcf86cd799439011",
        user_id="507f1f77bcf86cd799439012",
        chef_name="Chef",
        restaurant_name="Test",
        user_message="yes",
        history=[],
        finance_period="week",
        cues_text="",
        confirm_inventory=True,
        workflow_state=WorkflowState(
            "link_addons_to_dish_chat",
            "persist",
            locked_name="Pancakes",
            baggage={
                "addon_slug": "addon-glazed-bananas",
                "addon_name": "glazed bananas",
                "merged_linked_dish_slugs": ["dish-pancakes"],
            },
        ),
    )

    result = try_direct_link(ctx, "persist")

    assert result is not None
    assert "Confirmed" in result
    invoke.assert_called_once_with(
        {
            "action": "update_addon",
            "slug": "addon-glazed-bananas",
            "linked_dish_slugs": ["dish-pancakes"],
        }
    )
    assert ctx.consult_side_effects["inventory"]["pending_action"]["kind"] == "update_addon"
