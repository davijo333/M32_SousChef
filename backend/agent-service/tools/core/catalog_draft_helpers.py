# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Apply chef corrections to vision catalog drafts (e.g. Orange → Mango Smoothie)."""
#
# from __future__ import annotations
#
# import re
# from typing import Any
#
# AGENT_ASSISTANT_LABELS = frozenset(
#     {
#         "sous chef",
#         "inventory agent",
#         "business agent",
#         "creator agent",
#     }
# )
#
# RECIPE_SECTION_HEADERS = re.compile(
#     r"^(?:suggested add-?ons?|prep steps?|ingredients?|visual brief|description|recipe|instructions?)$",
#     re.I,
# )
#
#
# def is_agent_assistant_label(name: str) -> bool:
#     normalized = re.sub(r"\*+", "", (name or "").strip()).lower()
#     return bool(normalized) and normalized in AGENT_ASSISTANT_LABELS
#
#
# def is_valid_recipe_dish_name(name: str) -> bool:
#     cleaned = (name or "").strip()
#     if not cleaned or len(cleaned.split()) > 8:
#         return False
#     if is_agent_assistant_label(cleaned):
#         return False
#     if RECIPE_SECTION_HEADERS.match(cleaned):
#         return False
#     return True
#
# CORRECTION_PATTERNS = (
#     r"(?:make it|change(?:\s+the)?\s+dish(?:\s+name)?\s+to|rename(?:\s+it)?\s+to|switch to|change to|call it|actually(?:\s+it'?s)?)\s+(?:a|an|the)?\s*([a-z][a-z0-9\s\-]{2,60})",
#     r"(?:want to add|i want to add|add|create)\s+(?:a|an|the)?\s*([a-z][a-z0-9\s\-]{2,50}?)(?:\s+as\s+(?:a|an)\s+new\s+dish\b)",
#     r"(?:it is|it's)\s+(?:a|an|the)?\s*([a-z][a-z0-9\s\-]{2,60})",
# )
#
#
# def title_case_dish_name(name: str) -> str:
#     return " ".join(word.capitalize() for word in name.strip().split())
#
#
# def clean_menu_dish_name(name: str) -> str:
#     """Normalize menu titles from Creative headings (strip numbering, 'Recipe for', etc.)."""
#     cleaned = re.sub(r"\*+", "", (name or "").strip())
#     cleaned = re.sub(r"^\d+\.\s*", "", cleaned)
#     cleaned = re.sub(r"^recipe\s+for\s+", "", cleaned, flags=re.I)
#     cleaned = re.sub(r"\s+", " ", cleaned).strip(" .,!?:;")
#     if not cleaned:
#         return ""
#     titled = title_case_dish_name(cleaned)
#     return titled if is_valid_recipe_dish_name(titled) else ""
#
#
# def _clean_dish_phrase(phrase: str) -> str:
#     cleaned = re.sub(r"\s+as\s+(?:a|an)\s+new\s+dish.*", "", phrase, flags=re.I)
#     cleaned = re.sub(r"\b(please|thanks|thank you|now|instead|rather)\b", "", cleaned, flags=re.I)
#     cleaned = re.sub(r"\s+", " ", cleaned).strip(" .,!?:;")
#     if not cleaned:
#         return ""
#     words = cleaned.split()
#     if len(words) > 8:
#         cleaned = " ".join(words[:8])
#     lower = cleaned.lower()
#     if lower in ("new dish", "a new dish", "the dish"):
#         return ""
#     return title_case_dish_name(cleaned)
#
#
# def extract_dish_name_correction(message: str) -> str:
#     text = (message or "").strip()
#     if not text:
#         return ""
#     lower = text.lower()
#     for pattern in CORRECTION_PATTERNS:
#         match = re.search(pattern, lower)
#         if not match:
#             continue
#         phrase = _clean_dish_phrase(match.group(1))
#         if phrase and len(phrase.split()) <= 8:
#             return phrase
#     return ""
#
#
# def extract_dish_name_correction_from_thread(
#     message: str,
#     history: list[dict[str, str]] | None = None,
# ) -> str:
#     """Most recent user correction wins (current message first)."""
#     texts = [message]
#     if history:
#         for row in reversed(history):
#             if row.get("role") == "user" and str(row.get("content") or "").strip():
#                 texts.append(str(row["content"]))
#     for text in texts:
#         corrected = extract_dish_name_correction(text)
#         if corrected:
#             return corrected
#     return ""
#
#
# def refresh_description_for_rename(name: str, description: str, previous_name: str = "") -> str:
#     desc = (description or "").strip()
#     lower_name = name.lower()
#     prev = (previous_name or "").strip()
#     if desc and prev and prev.lower() != lower_name:
#         prev_token = prev.split()[0].lower() if prev.split() else ""
#         if prev_token and len(prev_token) > 3 and prev_token in desc.lower():
#             return re.sub(re.escape(prev_token), lower_name.split()[0], desc, count=1, flags=re.I)
#     if desc and "orange" in desc.lower() and "mango" in lower_name:
#         return re.sub(r"orange", "mango", desc, flags=re.I)
#     if desc and not re.search(re.escape(lower_name.split()[0]), desc, flags=re.I):
#         return f"Refreshing {lower_name} topped with whipped cream."
#     if desc:
#         return desc
#     return f"Refreshing {lower_name} topped with whipped cream."
#
#
# def infer_catalog_draft_from_history(history: list[dict[str, str]] | None) -> dict[str, Any] | None:
#     """Recover dish catalog draft from embedded photo-identify notes in user messages."""
#     if not history:
#         return None
#     for row in reversed(history):
#         if row.get("role") != "user":
#             continue
#         content = str(row.get("content") or "")
#         if not re.search(r"Identified (?:menu )?dish from [^:\n]+:", content, re.I):
#             continue
#         name_match = re.search(r"•\s*\*\*([^*]+)\*\*", content)
#         if not name_match:
#             continue
#         name = title_case_dish_name(name_match.group(1).strip())
#         brand_match = re.search(r"•\s*Brand:\s*([^\n]+)", content, re.I)
#         category_match = re.search(r"•\s*Category:\s*([^\n]+)", content, re.I)
#         class_match = re.search(r"•\s*Classification:\s*([^\n]+)", content, re.I)
#         file_match = re.search(r"•\s*File:\s*([^\n]+)", content, re.I)
#         source_match = re.search(r"Identified (?:menu )?dish from\s+([^:\n]+)", content, re.I)
#
#         description = ""
#         for line in content.splitlines():
#             trimmed = line.strip()
#             if not trimmed.startswith("•"):
#                 continue
#             body = re.sub(r"^•\s*", "", trimmed)
#             if (
#                 body.startswith("**")
#                 or re.match(r"brand:", body, re.I)
#                 or re.match(r"category:", body, re.I)
#                 or re.match(r"classification:", body, re.I)
#                 or re.match(r"file:", body, re.I)
#                 or "check for duplicates" in body.lower()
#                 or "say **confirm**" in body.lower()
#             ):
#                 continue
#             description = body
#             break
#
#         draft: dict[str, Any] = {
#             "itemType": "dish",
#             "name": name,
#             "confidence": 0.9,
#             "source": (source_match.group(1).strip() if source_match else "photo"),
#         }
#         if brand_match:
#             draft["brandName"] = brand_match.group(1).strip()
#         if category_match:
#             draft["category"] = category_match.group(1).strip()
#         if class_match:
#             draft["classification"] = class_match.group(1).strip()
#         if description:
#             draft["description"] = description
#         if file_match:
#             draft["filename"] = file_match.group(1).strip()
#         return draft
#     return None
#
#
# def apply_catalog_draft_correction(
#     catalog_draft: dict[str, Any] | None,
#     message: str,
#     history: list[dict[str, str]] | None = None,
# ) -> dict[str, Any] | None:
#     if not catalog_draft:
#         return catalog_draft
#     if str(catalog_draft.get("itemType") or "").strip().lower() != "dish":
#         return catalog_draft
#
#     corrected = extract_dish_name_correction_from_thread(message, history)
#     if not corrected:
#         return catalog_draft
#
#     previous_name = str(catalog_draft.get("name") or "").strip()
#     if previous_name.lower() == corrected.lower():
#         return catalog_draft
#
#     updated = dict(catalog_draft)
#     updated["name"] = corrected
#     updated["description"] = refresh_description_for_rename(
#         corrected,
#         str(catalog_draft.get("description") or ""),
#         previous_name,
#     )
#     updated["chefCorrected"] = True
#     return updated
