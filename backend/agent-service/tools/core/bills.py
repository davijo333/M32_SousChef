# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Bill queue reads for query_inventory, query_business, and upload_bills."""
#
# from __future__ import annotations
#
# import re
# from datetime import datetime
# from typing import Any
#
# from bson import ObjectId
#
# from db.mongo import find_by_user, find_one
#
#
# def _bill_id_str(bill: dict[str, Any]) -> str:
#     raw = bill.get("_id")
#     return str(raw) if raw is not None else ""
#
#
# def _format_bill_row(bill: dict[str, Any]) -> str:
#     lines = bill.get("lines") or []
#     included = sum(1 for line in lines if line.get("included", True))
#     bill_date = bill.get("billDate") or ""
#     created = bill.get("createdAt")
#     upload_date = ""
#     if isinstance(created, datetime):
#         upload_date = created.date().isoformat()
#     return (
#         f"- {_bill_id_str(bill)} | {bill.get('filename', 'bill')} | "
#         f"{bill.get('vendor', '') or 'unknown vendor'} | "
#         f"status={bill.get('status', 'pending_review')} | "
#         f"{included}/{len(lines)} lines included"
#         + (f" | bill date {bill_date}" if bill_date else "")
#         + (f" | uploaded {upload_date}" if upload_date else "")
#     )
#
#
# def get_bills_for_user(
#     user_id: str,
#     *,
#     bill_type: str,
#     status: str | None = None,
#     bill_ids: list[str] | None = None,
#     limit: int = 10,
# ) -> list[dict[str, Any]]:
#     extra: dict[str, Any] = {"billType": bill_type}
#     if status:
#         extra["status"] = status
#     if bill_ids:
#         object_ids = []
#         for bill_id in bill_ids:
#             try:
#                 object_ids.append(ObjectId(bill_id))
#             except Exception:
#                 continue
#         if object_ids:
#             extra["_id"] = {"$in": object_ids}
#     return find_by_user(
#         "billuploads",
#         user_id,
#         extra_filter=extra,
#         sort=[("createdAt", -1)],
#         limit=limit,
#         projection={
#             "filename": 1,
#             "vendor": 1,
#             "billDate": 1,
#             "status": 1,
#             "billType": 1,
#             "lines": 1,
#             "createdAt": 1,
#         },
#     )
#
#
# def format_bill_queue(
#     user_id: str,
#     *,
#     bill_type: str,
#     pending_only: bool = True,
#     bill_ids: list[str] | None = None,
#     limit: int = 8,
# ) -> str:
#     if not user_id:
#         return "No user session — bill queue unavailable in this request."
#     bills = get_bills_for_user(
#         user_id,
#         bill_type=bill_type,
#         status="pending_review" if pending_only and not bill_ids else None,
#         bill_ids=bill_ids,
#         limit=limit,
#     )
#     if not bills:
#         label = "purchase" if bill_type == "supplier" else "sales"
#         return f"No {label} bills in queue."
#     header = "Purchase bills (supplier):" if bill_type == "supplier" else "Sales bills (customer):"
#     return header + "\n" + "\n".join(_format_bill_row(bill) for bill in bills)
#
#
# def get_bill_summary(
#     restaurant_id: str,
#     bill_id: str,
# ) -> str:
#     try:
#         oid = ObjectId(bill_id)
#     except Exception:
#         return f"Invalid bill id: {bill_id}"
#     bill = find_one(
#         "billuploads",
#         restaurant_id,
#         {"_id": oid},
#         projection={
#             "filename": 1,
#             "vendor": 1,
#             "billDate": 1,
#             "status": 1,
#             "billType": 1,
#             "lines": 1,
#         },
#     )
#     if not bill:
#         return f"Bill {bill_id} not found."
#     bill_type = bill.get("billType", "supplier")
#     lines = bill.get("lines") or []
#     preview_lines = []
#     for line in lines[:12]:
#         if not line.get("included", True):
#             continue
#         name = line.get("normalizedName") or line.get("rawName") or "item"
#         qty = line.get("quantity", 0)
#         unit = line.get("unit", "")
#         preview_lines.append(f"  · {name}: {qty} {unit}")
#     extra = f"\n  … and {len(lines) - 12} more lines" if len(lines) > 12 else ""
#     return (
#         f"Bill {bill_id} ({bill.get('filename', 'bill')})\n"
#         f"Type: {bill_type} | Vendor: {bill.get('vendor', '')} | Status: {bill.get('status')}\n"
#         f"Lines ({len(lines)}):\n"
#         + ("\n".join(preview_lines) if preview_lines else "  (no included lines)")
#         + extra
#     )
#
#
# def summarize_upload_handoff(
#     user_id: str,
#     *,
#     recent_bill_ids: list[str] | None = None,
# ) -> str:
#     if not user_id and not recent_bill_ids:
#         return (
#             "No bills attached. Chef can upload PDF/PNG on Upload orders or attach files in chat "
#             "(UI parses before the agent runs)."
#         )
#     supplier = get_bills_for_user(
#         user_id,
#         bill_type="supplier",
#         bill_ids=recent_bill_ids,
#         limit=5,
#     )
#     customer = get_bills_for_user(
#         user_id,
#         bill_type="customer",
#         bill_ids=recent_bill_ids,
#         limit=5,
#     )
#     parts: list[str] = []
#     if supplier:
#         parts.append("**Purchase bills (Inventory):**\n" + "\n".join(_format_bill_row(b) for b in supplier))
#     if customer:
#         parts.append(
#             "**Sales bills (Business):**\n"
#             + "\n".join(_format_bill_row(b) for b in customer)
#             + "\nRoute sales bill processing to the Business agent."
#         )
#     if not parts:
#         return "No recent bills found for this session."
#     return "\n\n".join(parts)
#
#
# def normalize_upload_batch_slices(batch: dict | None) -> list[dict]:
#     if not batch:
#         return []
#     raw_slices = batch.get("slices")
#     if isinstance(raw_slices, list) and raw_slices:
#         out = []
#         for row in raw_slices:
#             if not isinstance(row, dict):
#                 continue
#             ready = int(row.get("ready") or 0)
#             if ready <= 0:
#                 continue
#             bill_type = row.get("billType") or row.get("bill_type") or "supplier"
#             out.append(
#                 {
#                     "billType": bill_type,
#                     "ready": ready,
#                     "failed": int(row.get("failed") or 0),
#                     "filenames": list(row.get("filenames") or []),
#                     "readyBillIds": [str(bid) for bid in (row.get("readyBillIds") or []) if str(bid).strip()],
#                 }
#             )
#         return out
#     ready = int(batch.get("ready") or 0)
#     if ready <= 0:
#         return []
#     bill_type = batch.get("billType") or batch.get("bill_type") or "supplier"
#     return [
#         {
#             "billType": bill_type,
#             "ready": ready,
#             "failed": int(batch.get("failed") or 0),
#             "filenames": list(batch.get("filenames") or []),
#             "readyBillIds": [str(bid) for bid in (batch.get("readyBillIds") or []) if str(bid).strip()],
#         }
#     ]
#
#
# def upload_batch_ready(batch: dict | None) -> bool:
#     if not batch:
#         return False
#     if int(batch.get("ready") or 0) > 0:
#         return True
#     return any(int(row.get("ready") or 0) > 0 for row in normalize_upload_batch_slices(batch))
#
#
# def upload_batch_is_mixed(batch: dict | None) -> bool:
#     types = {str(row.get("billType")) for row in normalize_upload_batch_slices(batch)}
#     return len(types) > 1
#
#
# def upload_batch_bill_type(batch: dict) -> str:
#     slices = normalize_upload_batch_slices(batch)
#     if len(slices) == 1:
#         return str(slices[0].get("billType") or "supplier")
#     return str(batch.get("billType") or batch.get("bill_type") or "supplier")
#
#
# def detect_upload_confirm(message: str) -> bool:
#     return bool(
#         re.search(
#             r"\b(yes|confirm|go ahead|process(?:\s+it|\s+them|\s+bills?)?|do it|approved?|sure)\b",
#             message or "",
#             re.I,
#         )
#     )
#
#
# def format_upload_batch_callout(batch: dict) -> str:
#     slices = normalize_upload_batch_slices(batch)
#     if not slices:
#         return ""
#     purchase = next((row for row in slices if str(row.get("billType")) == "supplier"), None)
#     sales = next((row for row in slices if str(row.get("billType")) == "customer"), None)
#     parts: list[str] = []
#     if purchase:
#         parts.append(f"**{purchase['ready']}** purchase order(s)")
#     if sales:
#         parts.append(f"**{sales['ready']}** sales receipt(s)")
#     body = f"I identified {' and '.join(parts)} in your attachments."
#     identifications = batch.get("identifications") or []
#     if isinstance(identifications, list) and identifications:
#         id_lines = []
#         for row in identifications:
#             if not isinstance(row, dict):
#                 continue
#             filename = str(row.get("filename") or "")
#             bill_type = str(row.get("billType") or "supplier")
#             reason = str(row.get("reason") or "document content")
#             label = "purchase order" if bill_type == "supplier" else "sales receipt"
#             if filename:
#                 id_lines.append(f"- **{filename}** → {label} ({reason})")
#         if id_lines:
#             body += "\n" + "\n".join(id_lines)
#     elif not identifications:
#         for row in slices:
#             bill_type = str(row.get("billType") or "supplier")
#             label = "purchase order(s)" if bill_type == "supplier" else "sales receipt(s)"
#             names = ", ".join(str(name) for name in (row.get("filenames") or [])[:5])
#             if names:
#                 body += f"\n- {label}: {names}"
#     failed = int(batch.get("failed") or 0)
#     if failed:
#         body += f"\n{failed} file(s) failed to parse."
#     if upload_batch_is_mixed(batch):
#         body += (
#             "\n\nSame order as **Upload orders**: purchase orders first (Inventory), "
#             "then sales receipts (Business). Say **go ahead** or **confirm** to process."
#         )
#     else:
#         body += "\n\nSay **go ahead** or **confirm** when you want me to process them."
#     return body
#
#
# def format_chat_upload_batch(batch: dict) -> str:
#     if normalize_upload_batch_slices(batch):
#         return format_upload_batch_callout(batch)
#     bill_type = batch.get("billType") or batch.get("bill_type") or "supplier"
#     label = "Purchase orders" if bill_type == "supplier" else "Sales orders"
#     state = batch.get("state", "ready")
#     total = int(batch.get("total") or 0)
#     ready = int(batch.get("ready") or 0)
#     failed = int(batch.get("failed") or 0)
#     names = batch.get("filenames") or []
#     name_line = ", ".join(str(n) for n in names[:5]) if names else "attached files"
#     if state == "error" or (failed and not ready):
#         return f"{label} batch failed — {failed} of {total} could not be parsed."
#     return (
#         f"{label} batch ready: {ready} of {total} parsed ({name_line}). "
#         "Ask the chef to confirm before processing."
#     )
