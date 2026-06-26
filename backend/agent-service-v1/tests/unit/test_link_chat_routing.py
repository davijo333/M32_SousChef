"""Intent routing for standalone chat link workflows."""

from workflows.engine.intent import match_workflow_start


def test_link_dish_ingredients_chat_routes_recipe_update():
    hits = match_workflow_start("Add honey to the Mango Paradise Smoothie recipe")
    assert hits
    assert hits[0][0] == "link_dish_ingredients_chat"


def test_link_addons_to_dish_chat_routes_modifier_link():
    hits = match_workflow_start("Link Sausage add-on to The Sunrise Stack dish")
    assert hits
    assert hits[0][0] == "link_addons_to_dish_chat"


def test_link_addons_to_dish_chat_routes_modifier_link():
    hits = match_workflow_start("Link Sausage add-on to The Sunrise Stack dish")
    assert hits
    assert hits[0][0] == "link_addons_to_dish_chat"


def test_link_addon_ingredients_chat_routes_ingredient_to_addon():
    hits = match_workflow_start("linked ingredient bananas to add-on glazed bananas")
    assert hits
    assert hits[0][0] == "link_addon_ingredients_chat"


def test_link_bananas_to_glazed_bananas_routes_ingredient_to_addon():
    hits = match_workflow_start("link bananas to glazed bananas")
    assert hits
    assert hits[0][0] == "link_addon_ingredients_chat"
    assert hits[0][1].lower() == "glazed bananas"


def test_link_bananas_to_glazed_bananas_beats_addon_dish_link():
    hits = match_workflow_start("link bananas to glazed bananas")
    wf_ids = [row[0] for row in hits]
    assert wf_ids[0] == "link_addon_ingredients_chat"
    assert "link_addons_to_dish_chat" not in wf_ids[:1]


def test_link_addon_ingredients_chat_beats_add_dish():
    hits = match_workflow_start("linked ingredient bananas to add-on glazed bananas")
    wf_ids = [row[0] for row in hits]
    assert wf_ids[0] == "link_addon_ingredients_chat"
    assert "add_dish_from_chat" not in wf_ids[:2]


def test_link_dish_chat_beats_add_dish():
    hits = match_workflow_start("Add honey to the Mango Paradise Smoothie recipe")
    wf_ids = [row[0] for row in hits]
    assert wf_ids[0] == "link_dish_ingredients_chat"
    assert "add_dish_from_chat" not in wf_ids[:2]


def test_add_existing_addon_to_dish_routes_link_not_create():
    hits = match_workflow_start("add glazed bananas as add-on to pancakes")
    assert hits
    assert hits[0][0] == "link_addons_to_dish_chat"
    assert hits[0][1].lower() == "pancakes"


def test_link_pronoun_to_dish_routes_link_workflow():
    hits = match_workflow_start("link it to pancakes")
    assert hits
    assert hits[0][0] == "link_addons_to_dish_chat"
    assert hits[0][1].lower() == "pancakes"


def test_link_named_addon_to_dish_routes_link_workflow():
    hits = match_workflow_start("link glazed bananas to pancakes")
    assert hits
    assert hits[0][0] == "link_addons_to_dish_chat"
    assert hits[0][1].lower() == "pancakes"
