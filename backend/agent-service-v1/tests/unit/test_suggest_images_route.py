"""Tests for /suggest-images route."""

from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app
from workers.image_suggestions import ImageSuggestion

client = TestClient(app)


@patch("api.routes.images.suggest_images")
def test_suggest_images_route(mock_suggest):
    mock_suggest.return_value = [
        ImageSuggestion(
            url="https://example.com/dish.jpg",
            label="Plated omelette breakfast",
            source="web",
            score=0.9,
        )
    ]

    res = client.post(
        "/suggest-images",
        json={
            "name": "Veggie Omelette",
            "item_type": "dish",
            "count": 2,
            "refresh": True,
        },
    )

    assert res.status_code == 200
    body = res.json()
    assert len(body["images"]) == 1
    assert body["images"][0]["url"] == "https://example.com/dish.jpg"
    mock_suggest.assert_called_once()


def test_suggest_images_requires_name():
    res = client.post("/suggest-images", json={"name": "  "})
    assert res.status_code == 400
