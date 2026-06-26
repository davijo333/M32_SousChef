"""Pytest configuration."""

import pytest


@pytest.fixture
def sample_chat_request():
    from api.schemas.chat import ChatRequest

    return ChatRequest(
        restaurant_id="test-restaurant",
        message="Add a mango smoothie to the menu",
    )
