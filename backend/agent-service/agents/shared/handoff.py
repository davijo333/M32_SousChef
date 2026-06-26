# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Handoff detection — mirrors apps/web/src/lib/chat-handoff.ts."""
#
# from __future__ import annotations
#
# import re
# from typing import Literal
#
# SpecialistHandoffTarget = Literal["inventory", "business", "create"]
#
# HANDOFF_PATTERNS: dict[str, list[re.Pattern[str]]] = {
#     "inventory": [
#         re.compile(r"\bInventory(?: Agent)?\b", re.I),
#         re.compile(r"\binventory\s+agent\b", re.I),
#     ],
#     "business": [
#         re.compile(r"\bBusiness(?: Agent)?\b", re.I),
#         re.compile(r"\bbusiness\s+agent\b", re.I),
#     ],
#     "create": [
#         re.compile(r"\bCreative(?: Agent)?\b", re.I),
#         re.compile(r"\b(creative|create)\s+agent\b", re.I),
#     ],
# }
#
# CONNECT_HANDOFF_PATTERNS: dict[str, list[re.Pattern[str]]] = {
#     "inventory": [
#         re.compile(r"\binventory\s+agent\b", re.I),
#         re.compile(r"\b(connect|direct|hand\s*off|transfer|switch|route)\b.*\binventory\b", re.I),
#     ],
#     "business": [
#         re.compile(r"\bbusiness\s+agent\b", re.I),
#         re.compile(r"\b(connect|direct|hand\s*off|transfer|switch|route)\b.*\bbusiness\b", re.I),
#     ],
#     "create": [
#         re.compile(r"\b(creative|create)\s+agent\b", re.I),
#         re.compile(r"\b(connect|direct|hand\s*off|transfer|switch|route)\b.*\b(creative|create)\b", re.I),
#     ],
# }
#
#
# def detect_handoff_from_message(message: str) -> SpecialistHandoffTarget | None:
#     trimmed = message.strip()
#     if not trimmed:
#         return None
#     for target, patterns in CONNECT_HANDOFF_PATTERNS.items():
#         if any(pattern.search(trimmed) for pattern in patterns):
#             return target  # type: ignore[return-value]
#     return None
#
#
# def detect_upload_batch_handoff(upload_batch: dict | None) -> SpecialistHandoffTarget | None:
#     """After confirm, route single-type chat batches to the owning specialist."""
#     if not upload_batch:
#         return None
#     from tools.core.bills import normalize_upload_batch_slices, upload_batch_is_mixed
#
#     slices = normalize_upload_batch_slices(upload_batch)
#     if not slices:
#         return None
#     if upload_batch_is_mixed(upload_batch):
#         return None
#     bill_type = str(slices[0].get("billType") or "supplier")
#     if bill_type == "customer":
#         return "business"
#     return "inventory"
#
#
# def detect_suggested_handoff(reply: str) -> SpecialistHandoffTarget | None:
#     if re.search(r"you're now connected with", reply, re.I):
#         return None
#     best: SpecialistHandoffTarget | None = None
#     best_score = 0
#     for target, patterns in HANDOFF_PATTERNS.items():
#         score = sum(1 for pattern in patterns if pattern.search(reply))
#         if score > best_score:
#             best_score = score
#             best = target  # type: ignore[assignment]
#     return best if best_score > 0 else None
