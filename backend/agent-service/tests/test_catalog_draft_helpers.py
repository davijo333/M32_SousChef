"""Tests for catalog draft name corrections."""

from tools.core.catalog_draft_helpers import (
    apply_catalog_draft_correction,
    extract_dish_name_correction,
    extract_dish_name_correction_from_thread,
    infer_catalog_draft_from_history,
)


def test_extract_dish_name_correction_phrases():
    assert extract_dish_name_correction("Make it a Mango Smoothie") == "Mango Smoothie"
    assert extract_dish_name_correction("Change dish to MANGO Smoothie") == "Mango Smoothie"
    assert (
        extract_dish_name_correction("No I want to add Mango Smoothie as a new dish")
        == "Mango Smoothie"
    )


def test_apply_catalog_draft_correction_updates_name_and_description():
    draft = {
        "itemType": "dish",
        "name": "Orange smoothie",
        "description": "Creamy orange smoothie topped with whipped cream.",
        "classification": "juice",
        "confidence": 0.8,
    }
    updated = apply_catalog_draft_correction(draft, "Make it a Mango Smoothie")
    assert updated is not None
    assert updated["name"] == "Mango Smoothie"
    assert "mango" in updated["description"].lower()
    assert updated.get("chefCorrected") is True


def test_thread_correction_uses_latest_user_message():
    history = [
        {"role": "user", "content": "Make it a Mango Smoothie"},
        {"role": "assistant", "content": "Noted."},
    ]
    assert extract_dish_name_correction_from_thread("go ahead", history) == "Mango Smoothie"


def test_infer_catalog_draft_from_history_photo_note():
    history = [
        {
            "role": "user",
            "content": (
                "Create a new dish\n\n"
                "Identified menu dish from photo:\n"
                "• **mango smoothie**\n"
                "• Category: beverage\n"
                "• Classification: juice\n"
                "• Refreshing mango smoothie topped with whipped cream.\n"
                "• File: new dish.jpeg"
            ),
        },
        {"role": "assistant", "content": "Add **Mango Smoothie** to your kitchen?"},
    ]
    draft = infer_catalog_draft_from_history(history)
    assert draft is not None
    assert draft["itemType"] == "dish"
    assert draft["name"] == "Mango Smoothie"
    assert draft["category"] == "beverage"
    assert draft["classification"] == "juice"
