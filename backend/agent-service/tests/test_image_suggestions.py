"""Regression tests for product image search helpers."""

from workers.image_suggestions import (
    ImageSuggestion,
    _is_bad_addon_label,
    _is_bad_dish_label,
    _is_packaging_label,
    _is_relevant_addon_label,
    _is_relevant_dish_label,
    _is_relevant_label,
    _substantive_tokens,
    suggest_images,
)


def test_substantive_tokens_strips_prep_words():
    assert _substantive_tokens("Ripe Mango") == ["mango"]
    assert "ripe" not in _substantive_tokens("Ripe Mango")


def test_relevant_label_uses_substantive_tokens():
    assert _is_relevant_label("Kent Mango Box - EZ INDIAN GROCERY", "Ripe Mango", "")
    assert not _is_relevant_label("What Color Is A Ripe Banana", "Ripe Mango", "")


def test_dish_label_rejects_packaging_and_brands():
    assert not _is_relevant_dish_label("Kirkland Mango Chunks product box", "Sunrise Stack", ["egg"])
    assert _is_relevant_dish_label("Sunrise Stack breakfast sandwich plated", "Sunrise Stack", ["egg"])
    assert not _is_relevant_dish_label(
        "Jimmy Dean Applewood Smoked Premium Bacon 12oz", "The Farmer's Double", ["bacon"]
    )
    assert not _is_relevant_dish_label("Planet Oat Oatmilk carton", "Oat Milk Mocha", ["oat milk"])
    assert not _is_relevant_dish_label("Lavazza Super Crema coffee beans", "Lavazza House Hot Coffee", [])
    assert not _is_relevant_dish_label("Kirkland Organic Orange Juice bottle", "Orange Juice", [])
    assert _is_relevant_dish_label(
        "Hazelnut mocha iced coffee in glass with whipped cream", "Hazelnut Mocha", []
    )


def test_packaging_label_detects_retail_brands():
    assert _is_packaging_label("Oatly Barista Edition oat milk carton")
    assert _is_packaging_label("Starbucks Pike Place Roast coffee beans bag")
    assert not _is_packaging_label("Iced skim frappe in tall glass with whipped cream")


def test_dish_label_rejects_text_overlay():
    assert not _is_relevant_dish_label(
        "California Sunrise Stack Breakfast Recipe Card", "The Sunrise Stack", []
    )
    assert _is_bad_dish_label("California Sunrise promotional food poster")


def test_addon_label_rejects_sandwich_and_packaging():
    assert not _is_relevant_addon_label(
        "Grilled cheese sandwich melted on plate", "American Cheese", "cheese"
    )
    assert not _is_relevant_addon_label(
        "North Country Applewood Smoked Bacon package", "Bacon", "protein"
    )
    assert not _is_relevant_addon_label(
        "Veggie sandwich with arugula tomato on bread", "Veggie mix", "veggie"
    )
    assert _is_relevant_addon_label("Single cheddar cheese slice close up", "Cheddar", "cheese")
    assert _is_relevant_addon_label("Crispy bacon strips on plate", "Bacon", "protein")
    assert _is_relevant_addon_label("Single espresso shot in small cup", "Extra espresso shot", "coffee")


def test_suggest_addon_images_rejects_sandwich(monkeypatch):
    def fake_web(query: str, limit: int = 2, **kwargs):
        return [
            ImageSuggestion(
                url="https://example.com/sandwich.jpg",
                label="Grilled cheese sandwich on plate",
                source="web",
            ),
            ImageSuggestion(
                url="https://example.com/slice.jpg",
                label="American cheese slice close up ingredient",
                source="web",
            ),
        ]

    monkeypatch.setattr("workers.image_suggestions._web_image_search", fake_web)
    images = suggest_images(
        None,
        "American Cheese",
        "addon",
        classification="cheese",
        use_gpt=False,
        refresh=True,
    )
    assert all(not _is_bad_addon_label(img.label) for img in images)
    assert any("slice" in img.label.lower() for img in images)


def test_suggest_images_returns_results_without_openai(monkeypatch):
    def fake_web(query: str, limit: int = 2, **kwargs):
        return [
            ImageSuggestion(url="https://example.com/a.jpg", label="Costco Mango Chunks", source="web"),
        ]

    monkeypatch.setattr("workers.image_suggestions._web_image_search", fake_web)
    images = suggest_images(None, "Mango", "ingredient", use_gpt=False, refresh=True)
    assert len(images) >= 1


def test_suggest_dish_images_rejects_packaging(monkeypatch):
    def fake_web(query: str, limit: int = 2, **kwargs):
        return [
            ImageSuggestion(
                url="https://example.com/oatly.jpg",
                label="Planet Oat Oatmilk carton grocery",
                source="web",
            ),
            ImageSuggestion(
                url="https://example.com/mocha.jpg",
                label="Oat milk mocha iced coffee in glass cafe",
                source="web",
            ),
        ]

    monkeypatch.setattr("workers.image_suggestions._web_image_search", fake_web)
    images = suggest_images(None, "Oat Milk Mocha", "dish", use_gpt=False, refresh=True)
    assert all(not _is_bad_dish_label(img.label) for img in images)
    assert any("glass" in img.label.lower() for img in images)
