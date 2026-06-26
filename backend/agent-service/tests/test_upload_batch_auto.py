# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Tests for confirm-first chat upload batch handling."""
#
# from __future__ import annotations
#
# import unittest
#
# from tools.core.bills import (
#     format_upload_batch_callout,
#     normalize_upload_batch_slices,
#     upload_batch_is_mixed,
#     upload_batch_ready,
# )
#
#
# class UploadBatchConfirmFlowTest(unittest.TestCase):
#     def test_mixed_batch_slices(self):
#         batch = {
#             "ready": 5,
#             "failed": 0,
#             "identifications": [
#                 {"filename": "Bill-1_Sysco.pdf", "billType": "supplier", "reason": "wholesaler invoice", "confidence": 0.94},
#                 {"filename": "3.c_bill.pdf", "billType": "customer", "reason": "POS receipt pattern", "confidence": 0.96},
#             ],
#             "slices": [
#                 {
#                     "billType": "supplier",
#                     "ready": 3,
#                     "failed": 0,
#                     "filenames": ["a.pdf", "b.pdf", "c.pdf"],
#                     "readyBillIds": ["1", "2", "3"],
#                 },
#                 {
#                     "billType": "customer",
#                     "ready": 2,
#                     "failed": 0,
#                     "filenames": ["d.pdf", "e.pdf"],
#                     "readyBillIds": ["4", "5"],
#                 },
#             ],
#         }
#         self.assertTrue(upload_batch_ready(batch))
#         self.assertTrue(upload_batch_is_mixed(batch))
#         slices = normalize_upload_batch_slices(batch)
#         self.assertEqual(len(slices), 2)
#         callout = format_upload_batch_callout(batch)
#         self.assertIn("identified", callout.lower())
#         self.assertIn("Bill-1_Sysco.pdf", callout)
#         self.assertIn("confirm", callout.lower())
#
#     def test_single_batch_legacy_shape(self):
#         batch = {
#             "billType": "supplier",
#             "ready": 2,
#             "failed": 0,
#             "filenames": ["a.pdf", "b.pdf"],
#             "readyBillIds": ["1", "2"],
#         }
#         self.assertFalse(upload_batch_is_mixed(batch))
#         callout = format_upload_batch_callout(batch)
#         self.assertIn("confirm", callout.lower())
#
#
# if __name__ == "__main__":
#     unittest.main()
