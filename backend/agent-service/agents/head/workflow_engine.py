# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Deterministic workflow step state — drives resolve_workflow_consults before regex/LLM."""
#
# from __future__ import annotations
#
# import re
# from dataclasses import dataclass, field
# from typing import Any
#
# from agents.head.orchestration import (
#     detect_add_addon_intent,
#     detect_add_dish_build_message,
#     detect_add_dish_intent,
#     detect_add_ingredient_intent,
#     detect_save_confirm,
#     infer_locked_dish,
# )
# from agents.shared.state import ChatState, SpecialistTarget
# from tools.core.recipe_build import (
#     thread_has_kitchen_build_in_thread,
#     thread_has_recipe_draft,
# )
#
# ADD_DISH = "add_dish_from_chat"
# ADD_INGREDIENT = "add_ingredient_from_chat"
# ADD_ADDON = "add_addon_from_chat"
#
#
# @dataclass
# class WorkflowState:
#     workflow_id: str
#     step_id: str
#     locked_name: str = ""
#     gates_passed: list[str] = field(default_factory=list)
#
#     def to_dict(self) -> dict[str, Any]:
#         return {
#             "workflowId": self.workflow_id,
#             "stepId": self.step_id,
#             "lockedName": self.locked_name or None,
#             "gatesPassed": list(self.gates_passed) or None,
#         }
#
#
# def parse_workflow_state(raw: dict[str, Any] | None) -> WorkflowState | None:
#     if not raw or not isinstance(raw, dict):
#         return None
#     workflow_id = str(raw.get("workflowId") or raw.get("workflow_id") or "").strip()
#     step_id = str(raw.get("stepId") or raw.get("step_id") or "").strip()
#     if not workflow_id or not step_id:
#         return None
#     locked = str(raw.get("lockedName") or raw.get("locked_name") or "").strip()
#     gates_raw = raw.get("gatesPassed") or raw.get("gates_passed") or []
#     gates = [str(g).strip() for g in gates_raw if str(g).strip()] if isinstance(gates_raw, list) else []
#     return WorkflowState(workflow_id=workflow_id, step_id=step_id, locked_name=locked, gates_passed=gates)
#
#
# def detect_workflow_cancel(message: str) -> bool:
#     text = (message or "").strip()
#     if not text:
#         return False
#     if detect_add_dish_intent(text) or detect_add_ingredient_intent(text) or detect_add_addon_intent(text):
#         return False
#     return bool(re.search(r"\b(cancel|never\s*mind|forget\s+it|start\s+over|different\s+topic)\b", text, re.I))
#
#
# def detect_reject_or_edit(message: str) -> bool:
#     text = (message or "").strip().lower()
#     if not text or detect_save_confirm(message):
#         return False
#     return bool(
#         re.search(
#             r"\b(no|nope|not\s+yet|wait|stop|cancel|change|edit|update|instead|replace)\b",
#             text,
#         )
#     )
#
#
# def _thread_history_from_state(state: ChatState) -> list[dict[str, str]]:
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
# def detect_customize(message: str) -> bool:
#     text = (message or "").strip().lower()
#     if not text:
#         return False
#     return bool(
#         re.search(
#             r"\b(customize|customise|modify|change|edit|update|instead|without|don't use|dont use|lets not|let's not)\b",
#             text,
#         )
#     )
#
#
# def extract_picked_dish_from_brainstorm(message: str, thread: list[dict[str, str]]) -> str:
#     from agents.head.reply_sanitizer import extract_dish_names_from_brainstorm
#
#     names: list[str] = []
#     for row in thread:
#         if row.get("role") == "assistant" and row.get("content"):
#             names.extend(extract_dish_names_from_brainstorm(str(row["content"])))
#     if not names:
#         return ""
#     lower = (message or "").lower()
#     for name in names:
#         if name.lower() in lower:
#             return name
#     if re.search(r"\b(#?1|first (one|option)|option\s*1)\b", lower):
#         return names[0]
#     if detect_save_confirm(message):
#         return names[0]
#     return ""
#
#
# def try_start_workflow(state: ChatState) -> tuple[dict[str, Any] | None, WorkflowState | None]:
#     """Start a new write workflow from the chef message when no active state."""
#     message = state.get("user_question") or ""
#
#     add_dish = detect_add_dish_intent(message)
#     if add_dish:
#         wf = WorkflowState(ADD_DISH, "draft_recipe", add_dish)
#         return _route(["create"], wf), wf
#
#     if detect_add_dish_build_message(message) and not detect_add_ingredient_intent(message):
#         wf = WorkflowState(ADD_DISH, "pick_dish", "")
#         return _route(["create"], wf), wf
#
#     ingredient = detect_add_ingredient_intent(message)
#     if ingredient:
#         wf = WorkflowState(ADD_INGREDIENT, "lookup", ingredient)
#         return _route(["inventory"], wf), wf
#
#     addon = detect_add_addon_intent(message)
#     if addon:
#         wf = WorkflowState(ADD_ADDON, "lookup", addon)
#         return _route(["inventory"], wf), wf
#
#     return None, None
#
#
# def resolve_active_workflow(
#     state: ChatState,
#     wf: WorkflowState,
# ) -> dict[str, Any] | None:
#     """Route from persisted workflow step."""
#     message = state.get("user_question") or ""
#     thread = _thread_history_from_state(state)
#     has_recipe = thread_has_recipe_draft(thread)
#     kitchen_built = thread_has_kitchen_build_in_thread(thread)
#     locked = wf.locked_name or infer_locked_dish(state)
#
#     if kitchen_built and wf.workflow_id == ADD_DISH:
#         return _route([], wf=None)
#
#     if wf.workflow_id == ADD_DISH:
#         return _resolve_add_dish(state, wf, message, thread, has_recipe, locked)
#
#     if wf.workflow_id == ADD_INGREDIENT:
#         return _resolve_add_ingredient(wf, message)
#
#     if wf.workflow_id == ADD_ADDON:
#         return _resolve_add_addon(wf, message)
#
#     return None
#
#
# def _thread_shows_kitchen_recipe_confirm_gate(thread: list[dict[str, str]]) -> bool:
#     from agents.head.orchestration import thread_awaiting_kitchen_save_confirm
#     from agents.head.reply_sanitizer import reply_asks_kitchen_save_confirm
#
#     for row in reversed(thread):
#         if row.get("role") != "assistant":
#             continue
#         content = str(row.get("content") or "")
#         if reply_asks_kitchen_save_confirm(content):
#             return True
#         break
#     return thread_awaiting_kitchen_save_confirm(thread)
#
#
# def _resolve_add_dish(
#     state: ChatState,
#     wf: WorkflowState,
#     message: str,
#     thread: list[dict[str, str]],
#     has_recipe: bool,
#     locked: str,
# ) -> dict[str, Any] | None:
#     from agents.head.orchestration import thread_awaiting_kitchen_save_confirm
#
#     awaiting_save = thread_awaiting_kitchen_save_confirm(thread)
#     at_recipe_gate = awaiting_save or _thread_shows_kitchen_recipe_confirm_gate(thread)
#
#     if wf.step_id == "pick_dish":
#         if re.search(r"\b(no|nope|cancel|never\s*mind|not now)\b", message, re.I) and not detect_customize(message):
#             return _route([], wf=None)
#         if detect_customize(message):
#             return _route(["create"], wf)
#         picked = detect_add_dish_intent(message) or extract_picked_dish_from_brainstorm(message, thread)
#         if detect_save_confirm(message) or picked:
#             if picked:
#                 from tools.core.catalog_draft_helpers import clean_menu_dish_name
#
#                 wf.locked_name = clean_menu_dish_name(picked) or picked
#             elif detect_save_confirm(message):
#                 from agents.head.reply_sanitizer import extract_dish_names_from_brainstorm
#                 from tools.core.catalog_draft_helpers import clean_menu_dish_name
#
#                 names: list[str] = []
#                 for row in thread:
#                     if row.get("role") == "assistant" and row.get("content"):
#                         names.extend(extract_dish_names_from_brainstorm(str(row["content"])))
#                 if names:
#                     wf.locked_name = clean_menu_dish_name(names[0]) or names[0]
#             wf.step_id = "draft_recipe"
#             return _route(["create"], wf)
#         return _route(["create"], wf)
#
#     if wf.step_id == "draft_recipe":
#         if detect_save_confirm(message) and (
#             has_recipe or at_recipe_gate or awaiting_save or bool(wf.locked_name)
#         ):
#             wf.step_id = "confirm_finalize"
#             if "confirm_recipe" not in wf.gates_passed:
#                 wf.gates_passed.append("confirm_recipe")
#             return _route(["inventory"], wf, confirm_inventory=True)
#         if detect_reject_or_edit(message):
#             return _route(["create"], wf)
#         return _route(["create"], wf)
#
#     if detect_reject_or_edit(message) and wf.step_id in ("confirm_recipe", "confirm_finalize"):
#         wf.step_id = "draft_recipe"
#         return _route(["create"], wf)
#
#     if wf.step_id == "confirm_recipe":
#         if detect_save_confirm(message):
#             if has_recipe or at_recipe_gate or awaiting_save:
#                 wf.step_id = "confirm_finalize"
#                 if "confirm_recipe" not in wf.gates_passed:
#                     wf.gates_passed.append("confirm_recipe")
#                 return _route(["inventory"], wf, confirm_inventory=True)
#             wf.step_id = "draft_recipe"
#             return _route(["create"], wf)
#         return _route(["inventory"], wf)
#
#     if wf.step_id == "confirm_finalize":
#         if detect_save_confirm(message) or bool(state.get("confirm_inventory")):
#             return _route(["inventory"], wf, confirm_inventory=True)
#         return _route(["inventory"], wf)
#
#     if wf.step_id == "completed":
#         return _route([], wf=None)
#
#     # unknown step — restart draft
#     wf.step_id = "draft_recipe"
#     if locked:
#         wf.locked_name = locked
#     return _route(["create"], wf)
#
#
# def _resolve_add_ingredient(wf: WorkflowState, message: str) -> dict[str, Any] | None:
#     if wf.step_id == "lookup":
#         return _route(["inventory"], wf)
#     if wf.step_id == "confirm_create":
#         if detect_save_confirm(message):
#             return _route(["inventory"], wf, confirm_inventory=True)
#         if detect_reject_or_edit(message):
#             wf.step_id = "lookup"
#             return _route(["inventory"], wf)
#         return _route(["inventory"], wf)
#     wf.step_id = "lookup"
#     return _route(["inventory"], wf)
#
#
# def _resolve_add_addon(wf: WorkflowState, message: str) -> dict[str, Any] | None:
#     if wf.step_id == "lookup":
#         return _route(["inventory"], wf)
#     if wf.step_id == "confirm_create":
#         if detect_save_confirm(message):
#             return _route(["inventory"], wf, confirm_inventory=True)
#         if detect_reject_or_edit(message):
#             wf.step_id = "lookup"
#             return _route(["inventory"], wf)
#         return _route(["inventory"], wf)
#     wf.step_id = "lookup"
#     return _route(["inventory"], wf)
#
#
# def _route(
#     targets: list[SpecialistTarget],
#     wf: WorkflowState | None,
#     *,
#     confirm_inventory: bool = False,
# ) -> dict[str, Any]:
#     update: dict[str, Any] = {
#         "route_mode": "consult" if targets else "answer",
#         "consult_targets": targets[:3],
#         "consult_index": 0,
#         "consult_results": {},
#         "active_agent": "head",
#     }
#     if confirm_inventory:
#         update["confirm_inventory"] = True
#     if wf is None:
#         update["workflow_state"] = None
#     else:
#         update["workflow_state"] = wf.to_dict()
#     return update
#
#
# def advance_workflow_after_turn(
#     wf: WorkflowState | None,
#     *,
#     consult_results: dict[str, str],
#     thread_history: list[dict[str, str]],
#     kitchen_built: bool,
# ) -> WorkflowState | None:
#     """Advance or clear workflow after specialist consult + synthesize."""
#     if not wf:
#         return None
#
#     if kitchen_built or thread_has_kitchen_build_in_thread(thread_history):
#         return None
#
#     if wf.workflow_id == ADD_DISH:
#         if "inventory" in consult_results:
#             inv = str(consult_results.get("inventory") or "")
#             if re.search(r"\b(created dish|updated dish)\b", inv, re.I):
#                 return None
#         if "create" in consult_results and wf.step_id == "draft_recipe":
#             wf.step_id = "confirm_recipe"
#             if not wf.locked_name:
#                 from tools.core.recipe_build import extract_dish_name_from_history
#
#                 creative = str(consult_results.get("create") or "")
#                 locked = extract_dish_name_from_history(
#                     thread_history + ([{"role": "assistant", "content": creative}] if creative else [])
#                 )
#                 if locked:
#                     wf.locked_name = locked
#             if "draft_recipe" not in wf.gates_passed:
#                 wf.gates_passed.append("draft_recipe")
#             return wf
#         if "inventory" in consult_results and wf.step_id == "confirm_finalize":
#             inv = str(consult_results.get("inventory") or "")
#             if re.search(r"\b(created dish|updated dish)\b", inv, re.I):
#                 return None
#         return wf
#
#     if wf.workflow_id in (ADD_INGREDIENT, ADD_ADDON):
#         if "inventory" in consult_results:
#             inv = str(consult_results.get("inventory") or "")
#             if re.search(r"\b(created|added|updated)\b", inv, re.I) and wf.step_id == "confirm_create":
#                 return None
#             if wf.step_id == "lookup" and re.search(r"\b(confirm|preview|qty)\b", inv, re.I):
#                 wf.step_id = "confirm_create"
#                 return wf
#         return wf
#
#     return wf
