"""Fallback image suggestion tests — relaxed web + AI generation."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from workers.image_suggestions import ImageSuggestion, suggest_images


@patch("workers.image_suggestions._generate_ai_images")
@patch("workers.image_suggestions._web_image_search")
def test_dish_falls_back_to_ai_when_web_empty(mock_web, mock_ai):
    mock_web.return_value = []
    mock_ai.return_value = [
        ImageSuggestion(
            url="https://oaidalle.example/a.png",
            label="Veggie Omelette generated menu photo",
            source="openai",
            score=0.99,
        ),
        ImageSuggestion(
            url="https://oaidalle.example/b.png",
            label="Veggie Omelette generated menu photo",
            source="openai",
            score=0.99,
        ),
    ]

    client = MagicMock()
    images = suggest_images(
        client,
        "Veggie Omelette",
        "dish",
        extra_keywords="Fluffy omelette with peppers and tomatoes on a plate.",
        ingredient_names=["eggs", "peppers"],
        use_gpt=True,
        refresh=True,
        count=2,
    )

    assert len(images) == 2
    assert images[0].source == "openai"
    mock_ai.assert_called_once()


@patch("workers.image_suggestions._generate_ai_images")
@patch("workers.image_suggestions._web_image_search")
def test_dish_uses_relaxed_web_before_ai(mock_web, mock_ai):
    def web_side_effect(*_args, **kwargs):
        if kwargs.get("strict") is False:
            return [
                ImageSuggestion(
                    url="https://example.com/omelette.jpg",
                    label="Veggie omelette on breakfast plate cafe",
                    source="web",
                )
            ]
        return []

    mock_web.side_effect = web_side_effect
    mock_ai.return_value = []

    images = suggest_images(
        None,
        "Veggie Omelette",
        "dish",
        extra_keywords="Breakfast omelette",
        refresh=True,
        count=2,
    )

    assert len(images) >= 1
    assert images[0].source == "web"
    mock_ai.assert_not_called()
