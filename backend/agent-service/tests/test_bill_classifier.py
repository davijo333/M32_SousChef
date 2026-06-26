# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Tests for bill document classification heuristics."""
#
# from __future__ import annotations
#
# import unittest
#
# from workers.bill_classifier import classify_from_filename
#
#
# class BillClassifierTest(unittest.TestCase):
#     def test_pos_filename_pattern(self):
#         result = classify_from_filename("3.c_bill.pdf")
#         self.assertIsNotNone(result)
#         assert result is not None
#         self.assertEqual(result.billType, "customer")
#         self.assertGreaterEqual(result.confidence, 0.9)
#
#     def test_wholesaler_filename_pattern(self):
#         result = classify_from_filename("Bill-1_Sysco.pdf")
#         self.assertIsNotNone(result)
#         assert result is not None
#         self.assertEqual(result.billType, "supplier")
#
#     def test_random_filename_returns_none(self):
#         self.assertIsNone(classify_from_filename("scan-from-vendor.pdf"))
#
#
# if __name__ == "__main__":
#     unittest.main()
