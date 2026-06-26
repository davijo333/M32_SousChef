# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Tests for Next.js-side confirm detection (run via node --experimental-vm-modules or tsx)."""
#
# from __future__ import annotations
#
# import re
# import unittest
#
#
# def detect_menu_confirm(message: str, agent_context: str) -> bool:
#     if agent_context != "create":
#         return False
#     return bool(
#         re.search(
#             r"\b(yes|confirm|go ahead|create it|update it|save (it|that)|add it|do it|approved?|sure)\b",
#             message,
#             re.I,
#         )
#     )
#
#
# def detect_business_confirm(message: str, agent_context: str) -> bool:
#     if agent_context != "business":
#         return False
#     return bool(
#         re.search(
#             r"\b(yes|confirm|go ahead|process(?:\s+it|\s+them|\s+bills?)?|do it|approved?|sure|apply)\b",
#             message,
#             re.I,
#         )
#     )
#
#
# class ConfirmDetectionTest(unittest.TestCase):
#     def test_menu_confirm(self):
#         self.assertTrue(detect_menu_confirm("yes, add it", "create"))
#         self.assertFalse(detect_menu_confirm("yes, add it", "inventory"))
#
#     def test_business_confirm(self):
#         self.assertTrue(detect_business_confirm("go ahead and apply", "business"))
#         self.assertFalse(detect_business_confirm("apply", "create"))
#
#
# if __name__ == "__main__":
#     unittest.main()
