# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Tests for unified chat reply sanitization."""
#
# from agents.head.reply_sanitizer import (
#     CONFIRM_OPTIONS,
#     apply_confirm_gate_closer,
#     collapse_multiple_question_blocks,
#     confirm_gate_closer,
#     sanitize_head_reply,
#     strip_generic_closers,
# )
#
#
# def test_strip_generic_closers():
#     raw = "Draft ready.\n\nWhat would you like to do next?"
#     assert "what would you like" not in strip_generic_closers(raw).lower()
#
#
# def test_collapse_multiple_questions():
#     raw = (
#         "Preview done.\n\n"
#         "Would you like to proceed with the save?\n\n"
#         "What would you like to do next?"
#     )
#     out = collapse_multiple_question_blocks(raw)
#     assert out.count("?") <= 1
#     assert "what would you like" not in out.lower()
#
#
# def test_confirm_gate_closer_kitchen():
#     closer = confirm_gate_closer("kitchen_build", "Mango Smoothie")
#     assert CONFIRM_OPTIONS in closer
#     assert "Mango Smoothie" in closer
#
#
# def test_confirm_gate_closer_catalog():
#     closer = confirm_gate_closer("catalog_create", "Whole Milk")
#     assert CONFIRM_OPTIONS in closer
#     assert "Whole Milk" in closer
#
#
# def test_apply_confirm_gate_closer_strips_stacked():
#     raw = (
#         "**Inventory Agent**\nAdd **Oat Milk** at qty 0.\n\n"
#         "Say **confirm** when ready.\n\n"
#         "What would you like to do next?"
#     )
#     out = apply_confirm_gate_closer(raw, "catalog_create", "Oat Milk")
#     assert CONFIRM_OPTIONS in out
#     assert "what would you like" not in out.lower()
#
#
# def test_sanitize_head_reply_price_gate():
#     raw = (
#         "Update **Latte** sell price to **$5.50**.\n\n"
#         "Say **confirm** to apply.\n\n"
#         "What would you like to do next?"
#     )
#     out = sanitize_head_reply(raw)
#     assert CONFIRM_OPTIONS in out
#     assert out.count("?") <= 1
#     assert "what would you like" not in out.lower()
