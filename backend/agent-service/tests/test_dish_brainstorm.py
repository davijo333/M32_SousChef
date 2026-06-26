# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Tests for dish brainstorm detection and dish-pick confirm gate."""
#
# from agents.head.reply_sanitizer import (
#     DISH_PICK_OPTIONS,
#     apply_confirm_gate_closer,
#     infer_confirm_gate_kind,
#     is_dish_brainstorm_reply,
#     sanitize_head_reply,
# )
#
#
# BRAINSTORM = """
# ### 1. Avocado Spinach Toast
# Ingredients:
# - Sourdough Bread — 2 slices
#
# Prep Steps:
# 1. Toast bread.
#
# ---
#
# ### 2. Veggie Power Bowl
# Ingredients:
# - Quinoa — 1 cup
#
# Prep Steps:
# 1. Cook quinoa.
#
# Let me know which dish you'd like to proceed with, or if you have any modifications in mind!
# """
#
#
# def test_is_dish_brainstorm_reply():
#     assert is_dish_brainstorm_reply(BRAINSTORM)
#
#
# def test_infer_dish_pick_gate():
#     assert infer_confirm_gate_kind(BRAINSTORM, None) == "dish_pick"
#
#
# def test_sanitize_brainstorm_reply():
#     raw = f"**Creator Agent**\n{BRAINSTORM}\n\nWhat would you like to do next?"
#     out = sanitize_head_reply(raw)
#     assert DISH_PICK_OPTIONS in out
#     assert "what would you like to do next" not in out.lower()
#     assert out.count("?") <= 1
#
#
# def test_apply_dish_pick_closer():
#     out = apply_confirm_gate_closer("**Creator Agent**\nDraft...", "dish_pick", "")
#     assert DISH_PICK_OPTIONS in out
#     assert "customize more" in out.lower()
