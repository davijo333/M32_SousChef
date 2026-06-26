# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Head chat reply rules — one question per message, uniform confirm gates."""
#
# from __future__ import annotations
#
# import re
# from typing import Any, Literal
#
# from agents.shared.state import ChatState
#
# ConfirmGateKind = Literal[
#     "kitchen_build",
#     "kitchen_finalize",
#     "dish_pick",
#     "catalog_create",
#     "price_change",
#     "reorder_change",
#     "bill_upload",
#     "suggested_save",
#     "generic",
# ]
#
# CONFIRM_OPTIONS = "(Yes/No/Update Instructions)"
# DISH_PICK_OPTIONS = "(Yes/No/Customize)"
#
# GENERIC_CLOSER_RE = re.compile(
#     r"\n\n(?:What would you like to do next\??|What should we do next\??|"
#     r"Would you like me to (?:convert|run)|Should I prepare)[^\n]*\??\s*$",
#     re.I,
# )
#
# TRAILING_CONFIRM_LINE_RE = re.compile(
#     r"\n\n(?:Ready to add[^\n]*|Please confirm[^\n]*|Would you like[^\n]*|"
#     r"Let me know which[^\n]*|Say \*\*confirm\*\*[^\n]*)"
#     r"(?:\n[^\n]+)?\s*$",
#     re.I,
# )
#
# KITCHEN_SAVE_CONFIRM_RE = re.compile(
#     r"\b(?:ready to add|please confirm(?:\s+the)?(?:\s+kitchen build)?|confirm the kitchen build|"
#     r"want(?:\s+me)?\s+to\s+build|would you like to proceed|confirm if you(?:'d| would) like|"
#     r"ready to (?:add|save)|save (?:it|this) to (?:your )?kitchen)\b",
#     re.I,
# )
#
# PRICE_CONFIRM_RE = re.compile(
#     r"\b(?:Update \*\*[^*]+\*\* sell price to|proceed with the price change|"
#     r"confirm if you(?:'d| would) like to proceed|say \*\*confirm\*\* to apply)\b",
#     re.I,
# )
#
# REORDER_CONFIRM_RE = re.compile(
#     r"\bUpdate(?: pantry ingredient)? \*\*[^*]+\*\* reorder level to\b",
#     re.I,
# )
#
# CATALOG_CONFIRM_RE = re.compile(
#     r"\b(?:say \*\*confirm\*\*|go ahead or \*\*confirm\*\*|when you want me to add)\b",
#     re.I,
# )
#
# BILL_CONFIRM_RE = re.compile(r"\b(?:go ahead or \*\*confirm\*\*|confirm to process)\b", re.I)
#
# GENERIC_CONFIRM_RE = re.compile(
#     r"\b(?:please confirm|would you like to proceed|ready to (?:add|save)|"
#     r"save (?:it|this) to (?:your )?kitchen)\b",
#     re.I,
# )
#
# DISH_PICK_ASK_RE = re.compile(
#     r"\b(?:let me know which dish|which dish you(?:'d| would) like|"
#     r"confirm a dish or customize|modifications in mind)\b",
#     re.I,
# )
#
#
# def is_dish_brainstorm_reply(text: str) -> bool:
#     body = (text or "").strip()
#     if not body:
#         return False
#     numbered = len(re.findall(r"^###\s+\d+\.", body, re.M))
#     if numbered >= 2:
#         return True
#     return bool(
#         re.search(
#             r"\b(?:couple of options|here are (?:a few|some|couple)|which dish you(?:'d| would) like|"
#             r"let me know which dish|modifications in mind)\b",
#             body,
#             re.I,
#         )
#     )
#
#
# def extract_dish_names_from_brainstorm(text: str) -> list[str]:
#     return [
#         re.sub(r"\*+", "", m.group(1)).strip()
#         for m in re.finditer(r"^###\s+\d+\.\s+(.+)$", text or "", re.M)
#         if m.group(1).strip()
#     ]
#
#
# def strip_generic_closers(reply: str) -> str:
#     text = (reply or "").strip()
#     for _ in range(4):
#         nxt = GENERIC_CLOSER_RE.sub("", text).strip()
#         if nxt == text:
#             break
#         text = nxt
#     return text
#
#
# def reply_asks_kitchen_save_confirm(text: str) -> bool:
#     return bool(KITCHEN_SAVE_CONFIRM_RE.search(text or ""))
#
#
# def reply_asks_any_confirm_gate(text: str) -> bool:
#     body = (text or "").strip()
#     if not body:
#         return False
#     return bool(
#         reply_asks_kitchen_save_confirm(body)
#         or PRICE_CONFIRM_RE.search(body)
#         or REORDER_CONFIRM_RE.search(body)
#         or CATALOG_CONFIRM_RE.search(body)
#         or BILL_CONFIRM_RE.search(body)
#         or GENERIC_CONFIRM_RE.search(body)
#         or CONFIRM_OPTIONS in body
#         or DISH_PICK_OPTIONS in body
#         or is_dish_brainstorm_reply(body)
#         or DISH_PICK_ASK_RE.search(body)
#     )
#
#
# def paragraph_asks_chef(text: str) -> bool:
#     p = (text or "").strip()
#     if not p:
#         return False
#     return bool(
#         "?" in p
#         or reply_asks_any_confirm_gate(p)
#         or is_dish_brainstorm_reply(p)
#         or DISH_PICK_ASK_RE.search(p)
#         or re.search(r"\b(?:Would you like|Let me know which|Should I|Say \*\*)", p, re.I)
#     )
#
#
# def collapse_multiple_question_blocks(reply: str) -> str:
#     text = strip_generic_closers(reply)
#     blocks = re.split(r"\n\n+", text)
#     ask_indices = [i for i, block in enumerate(blocks) if paragraph_asks_chef(block)]
#     if len(ask_indices) <= 1:
#         return text
#     keep = ask_indices[-1]
#     return "\n\n".join(
#         block for i, block in enumerate(blocks) if i == keep or not paragraph_asks_chef(block)
#     ).strip()
#
#
# def confirm_gate_closer(kind: ConfirmGateKind, subject: str) -> str:
#     label = (subject or "").strip()
#     if kind == "kitchen_build":
#         return (
#             f"Ready to add **{label or 'this dish'}** to Kitchen with the recipe and suggested add-ons? "
#             f"{CONFIRM_OPTIONS}"
#         )
#     if kind == "kitchen_finalize":
#         return f"Ready to save **{label or 'this dish'}** to Kitchen now? {CONFIRM_OPTIONS}"
#     if kind == "dish_pick":
#         return f"Would you like to confirm a dish or customize more? {DISH_PICK_OPTIONS}"
#     if kind == "catalog_create":
#         return f"Please confirm adding **{label or 'this item'}** to the catalog. {CONFIRM_OPTIONS}"
#     if kind == "price_change":
#         suffix = f" for **{label}**" if label else ""
#         return f"Please confirm this price change{suffix}. {CONFIRM_OPTIONS}"
#     if kind == "reorder_change":
#         suffix = f" for **{label}**" if label else ""
#         return f"Please confirm this reorder level change{suffix}. {CONFIRM_OPTIONS}"
#     if kind == "bill_upload":
#         return f"Please confirm processing these bills. {CONFIRM_OPTIONS}"
#     if kind == "suggested_save":
#         return f"Please confirm saving **{label or 'this suggestion'}** to Suggested. {CONFIRM_OPTIONS}"
#     return f"Please confirm before I proceed. {CONFIRM_OPTIONS}"
#
#
# def _workflow_confirm_kind(workflow_state: dict[str, Any] | None) -> ConfirmGateKind | None:
#     if not workflow_state:
#         return None
#     workflow_id = str(workflow_state.get("workflowId") or workflow_state.get("workflow_id") or "")
#     step_id = str(workflow_state.get("stepId") or workflow_state.get("step_id") or "")
#     if workflow_id == "add_dish_from_chat" and step_id == "pick_dish":
#         return "dish_pick"
#     if workflow_id == "add_dish_from_chat" and step_id == "confirm_finalize":
#         return "kitchen_finalize"
#     if workflow_id == "add_dish_from_chat" and step_id in ("confirm_recipe", "draft_recipe"):
#         return "kitchen_build"
#     if workflow_id in ("add_ingredient_from_chat", "add_addon_from_chat") and step_id == "confirm_create":
#         return "catalog_create"
#     return None
#
#
# def infer_confirm_gate_kind(
#     reply: str,
#     workflow_state: dict[str, Any] | None = None,
# ) -> ConfirmGateKind | None:
#     wf_kind = _workflow_confirm_kind(workflow_state)
#     if wf_kind:
#         return wf_kind
#
#     text = (reply or "").strip()
#     if not text:
#         return None
#     if is_dish_brainstorm_reply(text) or DISH_PICK_ASK_RE.search(text):
#         return "dish_pick"
#     if reply_asks_kitchen_save_confirm(text):
#         return "kitchen_build"
#     if PRICE_CONFIRM_RE.search(text):
#         return "price_change"
#     if REORDER_CONFIRM_RE.search(text):
#         return "reorder_change"
#     if BILL_CONFIRM_RE.search(text):
#         return "bill_upload"
#     if re.search(r"\bsave (?:it|this) to suggested\b", text, re.I):
#         return "suggested_save"
#     if CATALOG_CONFIRM_RE.search(text) or re.search(r"\bcheck for duplicates before adding\b", text, re.I):
#         return "catalog_create"
#     if GENERIC_CONFIRM_RE.search(text):
#         return "generic"
#     return None
#
#
# def apply_confirm_gate_closer(reply: str, kind: ConfirmGateKind, subject: str) -> str:
#     text = strip_generic_closers(reply)
#     text = TRAILING_CONFIRM_LINE_RE.sub("", text).strip()
#     if CONFIRM_OPTIONS in text or DISH_PICK_OPTIONS in text:
#         return text
#     return f"{text}\n\n{confirm_gate_closer(kind, subject)}"
#
#
# def kitchen_build_confirm_closer(dish: str) -> str:
#     return confirm_gate_closer("kitchen_build", dish)
#
#
# def apply_kitchen_build_confirm_closer(reply: str, dish: str) -> str:
#     return apply_confirm_gate_closer(reply, "kitchen_build", dish)
#
#
# def _infer_subject(
#     kind: ConfirmGateKind,
#     reply: str,
#     state: ChatState | None,
#     workflow_state: dict[str, Any] | None,
# ) -> str:
#     if workflow_state:
#         locked = str(workflow_state.get("lockedName") or workflow_state.get("locked_name") or "").strip()
#         if locked:
#             from tools.core.catalog_draft_helpers import clean_menu_dish_name
#
#             return clean_menu_dish_name(locked) or locked
#
#     if state:
#         from agents.head.orchestration import infer_locked_dish
#
#         locked = infer_locked_dish(state)
#         if locked:
#             return locked
#
#     if kind in ("kitchen_build", "suggested_save") and state:
#         from tools.core.recipe_build import extract_dish_name_from_history
#
#         thread = _thread_from_state(state)
#         creative = str((state.get("consult_results") or {}).get("create") or "")
#         if creative:
#             name = extract_dish_name_from_history([{"role": "assistant", "content": creative}])
#             if name:
#                 return name
#         return extract_dish_name_from_history(thread) or ""
#
#     price_match = re.search(r"Update \*\*([^*]+)\*\* sell price to", reply, re.I)
#     if price_match:
#         return price_match.group(1).strip()
#
#     reorder_match = re.search(
#         r"Update(?: pantry ingredient)? \*\*([^*]+)\*\* reorder level to",
#         reply,
#         re.I,
#     )
#     if reorder_match:
#         return reorder_match.group(1).strip()
#
#     catalog_match = re.search(
#         r"Identified (?:menu )?(?:dish|pantry ingredient)[^:]*:\s*\n• \*\*([^*]+)\*\*",
#         reply,
#         re.I,
#     )
#     if catalog_match:
#         return catalog_match.group(1).strip()
#
#     return ""
#
#
# def _thread_from_state(state: ChatState) -> list[dict[str, str]]:
#     from langchain_core.messages import AIMessage, HumanMessage
#
#     rows: list[dict[str, str]] = []
#     for msg in state.get("messages") or []:
#         if isinstance(msg, HumanMessage) and msg.content:
#             rows.append({"role": "user", "content": str(msg.content)})
#         elif isinstance(msg, AIMessage) and msg.content:
#             rows.append({"role": "assistant", "content": str(msg.content)})
#     return rows
#
#
# def reply_at_confirm_gate(reply: str, state: ChatState | None = None) -> bool:
#     workflow_state = state.get("workflow_state") if state else None
#     if _workflow_confirm_kind(workflow_state):
#         return True
#     return reply_asks_any_confirm_gate(reply)
#
#
# def sanitize_head_reply(
#     reply: str,
#     *,
#     state: ChatState | None = None,
#     allow_next_step: bool = False,
# ) -> str:
#     text = strip_generic_closers((reply or "").strip())
#     if not text:
#         return text
#
#     workflow_state = state.get("workflow_state") if state else None
#     kind = infer_confirm_gate_kind(text, workflow_state)
#     if kind:
#         subject = _infer_subject(kind, text, state, workflow_state)
#         text = apply_confirm_gate_closer(text, kind, subject)
#
#     text = collapse_multiple_question_blocks(text)
#
#     if allow_next_step and not reply_at_confirm_gate(text, state) and "?" not in text:
#         text = f"{text}\n\nWhat would you like to do next?"
#
#     return text
