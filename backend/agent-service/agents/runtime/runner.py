# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """LangGraph agent runner — supervisor graph for Sous Chef, direct ReAct for specialists."""
#
# from __future__ import annotations
#
# import re
# from typing import Any, Literal
#
# from agents.shared.prompts import ASSISTANT_NAMES, AgentContext
# from agents.runtime.specialists import result_from_core_ctx, run_react_agent
# from agents.head.graph import run_supervisor_chat
# from tools.core.bills import (
#     detect_upload_confirm,
#     format_upload_batch_callout,
#     normalize_upload_batch_slices,
#     upload_batch_is_mixed,
#     upload_batch_ready,
# )
# from tools.core.recipe_build import (
#     auto_default_selections,
#     extract_dish_name_from_history,
#     extract_recipe_draft_from_history,
#     infer_qty_unit,
#     plan_recipe_build,
#     thread_has_recipe_draft,
#     thread_has_kitchen_build_in_thread,
# )
# from agents.head.orchestration import detect_pantry_add_zero_confirm
# from tools.core.catalog_draft_helpers import (
#     apply_catalog_draft_correction,
#     extract_dish_name_correction_from_thread,
#     infer_catalog_draft_from_history,
#     is_valid_recipe_dish_name,
# )
# from tools.core.writes import CoreToolContext, PendingAction
#
# ChatMessage = dict[str, str]
#
#
# def _upload_handoff_note(upload_batch: dict | None, *, confirmed: bool) -> str:
#     if not upload_batch or not upload_batch_ready(upload_batch):
#         return ""
#     if confirmed:
#         return (
#             "\n\nThe chef confirmed processing for the uploaded bill batch. "
#             "Purchase orders → Inventory first, then sales receipts → Inventory (after POs). "
#             "Same order as Upload orders: POs first, then SOs."
#         )
#     callout = format_upload_batch_callout(upload_batch)
#     mixed = upload_batch_is_mixed(upload_batch)
#     routing = (
#         "Summarize what you identified (counts and filenames) and ask for confirmation before processing. "
#         "Do not process yet."
#     )
#     if mixed:
#         routing += (
#             " Explain that purchase orders and sales receipts are both processed by Inventory, "
#             "with POs first — same as Upload orders."
#         )
#     return f"\n\n{callout}\n\n{routing}"
#
#
# def _catalog_draft_note(catalog_draft: dict | None) -> str:
#     if not catalog_draft or not str(catalog_draft.get("name") or "").strip():
#         return ""
#     item_type = str(catalog_draft.get("itemType") or "ingredient")
#     name = str(catalog_draft.get("name") or "").strip()
#     brand = str(catalog_draft.get("brandName") or "").strip()
#     category = str(catalog_draft.get("category") or "").strip()
#     classification = str(catalog_draft.get("classification") or "").strip()
#     description = str(catalog_draft.get("description") or "").strip()
#     source = str(catalog_draft.get("source") or "photo")
#     lines = [
#         f"The chef shared a catalog **{item_type}** ({source}). Vision identified **{name}**.",
#     ]
#     if brand:
#         lines.append(f"Brand: {brand}.")
#     if category:
#         lines.append(f"Category: {category}.")
#     if classification and item_type == "dish":
#         lines.append(f"Classification: {classification}.")
#     if description:
#         lines.append(f"Description: {description[:160]}.")
#     if catalog_draft.get("chefCorrected"):
#         lines.append(
#             "Chef corrected the dish name after photo vision — use this name, not the original photo label."
#         )
#     lines.append(
#         "Before create/update: search for duplicates/similar items and show matches when in doubt. "
#         "New pantry items from chat start at qty **0** with label **new**. "
#     )
#     if item_type == "dish":
#         lines.append(
#             "For a full kitchen build use apply_menu plan_recipe_build → finalize_recipe_build "
#             "(Inventory Agent tools)."
#         )
#     else:
#         lines.append(
#             "Use apply_inventory create_ingredient or apply_menu create_dish after chef confirms."
#         )
#     return "\n\n" + " ".join(lines)
#
#
# def _recipe_build_note(recipe_build: dict | None, *, confirm_suggestion: bool) -> str:
#     if not recipe_build:
#         return ""
#     dish = str(recipe_build.get("dishName") or "dish")
#     brief = str(recipe_build.get("visualBrief") or "").strip()
#     lines = [
#         f"\n\nActive recipe build for **{dish}**.",
#         "Pass visual_brief from Creative when calling plan_recipe_build.",
#         "No store-product or image picking in chat — finalize_recipe_build auto-generates photos.",
#     ]
#     if brief:
#         lines.append(f"Visual brief: {brief[:200]}")
#     if confirm_suggestion:
#         lines.append(
#             "The chef just confirmed — call finalize_recipe_build now. "
#             "Do not ask for ingredient quantities, units, or photo picks."
#         )
#     return " ".join(lines)
#
#
# def _run_direct_specialist(
#     *,
#     agent_context: AgentContext,
#     restaurant_id: str,
#     user_id: str,
#     upload_batch: dict | None,
#     catalog_draft: dict | None,
#     recipe_build: dict | None,
#     recent_bill_ids: list[str],
#     chef_name: str,
#     restaurant_name: str,
#     message: str,
#     history: list[ChatMessage],
#     finance_period: str,
#     cues_text: str,
#     confirm_suggestion: bool,
#     confirm_inventory: bool,
#     confirm_business: bool,
#     connect_agent: AgentContext | None,
#     handoff: Literal["inventory", "business", "create"] | None,
# ) -> dict[str, Any]:
#     confirmed = confirm_inventory or confirm_business or detect_upload_confirm(message)
#     core_ctx = CoreToolContext(
#         user_id=user_id,
#         upload_batch=upload_batch,
#         catalog_draft=catalog_draft,
#         recipe_build=recipe_build,
#         confirm_inventory=confirm_inventory,
#         confirm_business=confirm_business,
#         confirm_suggestion=confirm_suggestion,
#     )
#     if core_ctx.recipe_build and message.strip():
#         from tools.core.recipe_build import apply_recipe_selections, parse_selections_from_message
#
#         picks = parse_selections_from_message(message, core_ctx.recipe_build)
#         if picks:
#             core_ctx.recipe_build = apply_recipe_selections(core_ctx.recipe_build, picks)
#
#     handoff_note = ""
#     if handoff:
#         handoff_note = (
#             "\n\nThe chef was just connected to you from another assistant. "
#             "Read the full conversation history and take over seamlessly."
#         )
#     handoff_note += _upload_handoff_note(upload_batch, confirmed=confirmed)
#     handoff_note += _catalog_draft_note(catalog_draft)
#     handoff_note += _recipe_history_note(history, catalog_draft)
#     handoff_note += _recipe_build_note(core_ctx.recipe_build, confirm_suggestion=confirm_suggestion)
#     handoff_note += _kitchen_build_confirm_note(
#         confirm_suggestion=confirm_suggestion,
#         catalog_draft=catalog_draft,
#         recipe_build=core_ctx.recipe_build,
#         history=history,
#     )
#     if (
#         agent_context == "inventory"
#         and confirmed
#         and upload_batch
#         and upload_batch_ready(upload_batch)
#     ):
#         slices = normalize_upload_batch_slices(upload_batch)
#         if any(str(row.get("billType")) == "supplier" for row in slices):
#             handoff_note += (
#                 "\n\nThe chef confirmed **purchase order** processing and you are Inventory. "
#                 "Process with apply_inventory action process_purchase_bills. "
#                 "Do NOT tell them to connect to Business — you own supplier invoices."
#             )
#         if any(str(row.get("billType")) == "customer" for row in slices):
#             handoff_note += (
#                 "\n\nThe chef confirmed **sales receipt** processing — use apply_inventory "
#                 "action process_sales_bills (after POs are processed)."
#             )
#
#     llm_user_message = message
#     if connect_agent and connect_agent != "head":
#         llm_user_message = (
#             "The chef clicked Connect in chat to speak with you. Review the conversation above "
#             "and take over — briefly acknowledge the thread, then help with what they need."
#         )
#
#     reply = run_react_agent(
#         agent_context,
#         restaurant_id=restaurant_id,
#         user_id=user_id,
#         recent_bill_ids=recent_bill_ids,
#         chef_name=chef_name,
#         restaurant_name=restaurant_name,
#         finance_period=finance_period,
#         cues_text=cues_text,
#         core_ctx=core_ctx,
#         history=history,
#         user_message=llm_user_message,
#         handoff_note=handoff_note,
#     )
#
#     if not reply:
#         reply = _fallback_reply(agent_context)
#
#     if upload_batch and upload_batch_ready(upload_batch) and not confirmed:
#         callout = format_upload_batch_callout(upload_batch)
#         if callout and callout not in reply:
#             reply = f"{callout}\n\n{reply}" if reply else callout
#
#     if connect_agent and handoff and handoff != "head":
#         specialist = ASSISTANT_NAMES[handoff]
#         if not re.search(r"you're now connected with", reply, re.I):
#             reply = f"You're now connected with the **{specialist}**.\n\n{reply}"
#
#     result = {
#         "reply": reply,
#         "agent_context": agent_context,
#         "handoff": handoff,
#         **result_from_core_ctx(core_ctx),
#     }
#     return result
#
#
# def _resolve_catalog_draft(
#     catalog_draft: dict | None,
#     message: str,
#     history: list[ChatMessage],
# ) -> dict | None:
#     catalog_draft = apply_catalog_draft_correction(catalog_draft, message, history)
#     if catalog_draft and str(catalog_draft.get("itemType") or "").strip().lower() == "dish":
#         return catalog_draft
#     recovered = infer_catalog_draft_from_history(history)
#     if not recovered:
#         return catalog_draft
#     return apply_catalog_draft_correction(recovered, message, history)
#
#
# def _try_kitchen_build_direct_finalize(
#     restaurant_id: str,
#     *,
#     confirm_suggestion: bool,
#     catalog_draft: dict | None,
#     recipe_build: dict | None,
#     history: list[ChatMessage],
#     message: str = "",
# ) -> dict[str, Any] | None:
#     """Skip LLM when chef confirmed and we already have a ready recipe build plan."""
#     effective_confirm = (
#         confirm_suggestion
#         or detect_pantry_add_zero_confirm(message)
#         or bool(
#             re.search(r"\b(yes|confirm|go ahead|proceed|save(?:\s+it)?)\b", message, re.I)
#             and thread_has_recipe_draft(history)
#         )
#     )
#     if not effective_confirm:
#         return None
#     plan = recipe_build or _prebuild_recipe_plan(restaurant_id, history, catalog_draft)
#     if not plan:
#         return None
#     plan = auto_default_selections(plan)
#     if plan.get("status") != "ready_to_finalize":
#         return None
#     dish_name = str(plan.get("dishName") or "").strip()
#     if not dish_name:
#         return None
#     pending = PendingAction(
#         kind="finalize_recipe_build",
#         dishName=dish_name,
#         description=str(plan.get("description") or ""),
#         classification=str(plan.get("classification") or "other"),
#         sellPrice=float(plan["sellPrice"]) if plan.get("sellPrice") is not None else None,
#         recipeBuildPlan=plan,
#     )
#     return {
#         "reply": (
#             f"Confirmed — building **{dish_name}** in your kitchen "
#             "(dish, pantry ingredients, and recipe)."
#         ),
#         "agent_context": "head",
#         "pending_action": pending.model_dump(),
#         "recipe_build": None,
#         "activity": {"orchestrator": "head", "consulted_agents": ["inventory"]},
#     }
#
#
# def _prebuild_recipe_plan(
#     restaurant_id: str,
#     history: list[ChatMessage],
#     catalog_draft: dict | None,
# ) -> dict | None:
#     extracted = extract_recipe_draft_from_history(history)
#     ingredients = extracted.get("ingredients") or []
#     if not ingredients:
#         return None
#     catalog = catalog_draft or {}
#     dish_name = str(catalog.get("name") or "").strip()
#     if str(catalog.get("source") or "").strip().lower() == "pricing":
#         dish_name = ""
#     if not dish_name or not is_valid_recipe_dish_name(dish_name):
#         dish_name = extract_dish_name_from_history(history)
#     if not dish_name:
#         return None
#     try:
#         plan = plan_recipe_build(
#             restaurant_id,
#             None,
#             dish_name=dish_name,
#             description=str(catalog.get("description") or extracted.get("description") or ""),
#             visual_brief=str(extracted.get("visualBrief") or ""),
#             classification=str(catalog.get("classification") or "other"),
#             ingredients=ingredients,
#             instructions=extracted.get("instructions") or None,
#         )
#     except ValueError:
#         return None
#     return auto_default_selections(plan)
#
#
# def _recipe_history_note(history: list[ChatMessage], catalog_draft: dict | None) -> str:
#     extracted = extract_recipe_draft_from_history(history)
#     ingredients = extracted.get("ingredients") or []
#     if not ingredients:
#         return ""
#     class_hint = str((catalog_draft or {}).get("classification") or "other")
#     lines = [
#         "\n\nRecipe draft from conversation — use these exact rows in plan_recipe_build "
#         "(name, qty, unit) and pass recipe_instructions for the steps:"
#     ]
#     for row in ingredients:
#         name = str(row.get("name") or "")
#         qty = row.get("qty")
#         unit = row.get("unit")
#         if qty is None:
#             qty, unit = infer_qty_unit(name, class_hint)
#         elif not unit:
#             unit = infer_qty_unit(name, class_hint)[1]
#         lines.append(f"- {name}: {qty} {unit}")
#     if extracted.get("instructions"):
#         lines.append("\nInstructions:")
#         for step in extracted["instructions"]:
#             lines.append(f"- {step}")
#     if extracted.get("visualBrief"):
#         lines.append(f"\nVisual brief (pass as visual_brief): {extracted['visualBrief']}")
#     lines.append(
#         "Do NOT ask the chef for quantities or units — you already proposed this recipe. "
#         "Do NOT ask for store product or image picks in chat. "
#         "Call plan_recipe_build then finalize_recipe_build in this turn."
#     )
#     return "\n".join(lines)
#
#
# def _kitchen_build_confirm(
#     message: str,
#     *,
#     confirm_suggestion: bool,
#     catalog_draft: dict | None,
#     recipe_build: dict | None,
#     history: list[ChatMessage] | None = None,
# ) -> bool:
#     pantry_add_zero = detect_pantry_add_zero_confirm(message)
#     effective_confirm = confirm_suggestion or pantry_add_zero or bool(
#         re.search(r"\b(save(?:\s+it)?|proceed|yes proceed)\b", (message or "").strip(), re.I)
#     )
#     if not effective_confirm:
#         return False
#     if history and thread_has_kitchen_build_in_thread(history):
#         return False
#     if recipe_build:
#         return True
#     if history and thread_has_recipe_draft(history):
#         return True
#     if not catalog_draft:
#         return False
#     if str(catalog_draft.get("itemType") or "").strip().lower() != "dish":
#         return False
#     text = message.strip().lower()
#     if pantry_add_zero:
#         return True
#     if not re.search(r"\b(yes|confirm|go ahead|do it|build it|create|add|save|proceed)\b", text):
#         return False
#     return bool(
#         re.search(r"\b(dish|ingredient|recipe|menu)\b", text)
#         or re.search(r"\b(add|create|build|save|proceed)\b", text)
#     )
#
#
# def _kitchen_build_confirm_note(
#     *,
#     confirm_suggestion: bool,
#     catalog_draft: dict | None,
#     recipe_build: dict | None,
#     history: list[ChatMessage] | None = None,
# ) -> str:
#     if not confirm_suggestion or recipe_build:
#         return ""
#     dish_name = ""
#     if catalog_draft and str(catalog_draft.get("itemType") or "").strip().lower() == "dish":
#         dish_name = str(catalog_draft.get("name") or "dish").strip()
#     elif history:
#         dish_name = extract_dish_name_from_history(history)
#     if dish_name and (catalog_draft or (history and thread_has_recipe_draft(history))):
#         return (
#             f"\n\nThe chef CONFIRMED a full kitchen build for **{dish_name}** (dish + pantry ingredients + recipe). "
#             "Call apply_menu **plan_recipe_build** with dish name, classification/description from the thread, "
#             "recipe_ingredients (each with name, qty, unit — propose sensible amounts; never ask the chef), "
#             "and recipe_instructions from your recipe steps. Then call **finalize_recipe_build** in this turn. "
#             "Do not ask for another confirmation or for quantities."
#         )
#     return ""
#
#
# def _coerce_catalog_writes_to_inventory(
#     agent_context: AgentContext,
#     message: str,
#     *,
#     confirm_suggestion: bool,
#     confirm_inventory: bool,
#     confirm_business: bool,
#     catalog_draft: dict | None,
#     recipe_build: dict | None,
# ) -> tuple[AgentContext, bool, bool, bool]:
#     """Route catalog DB mutations through Inventory Agent."""
#     inv = confirm_inventory or confirm_business
#     sug = confirm_suggestion
#     if agent_context == "create" and _kitchen_build_confirm(
#         message,
#         confirm_suggestion=sug,
#         catalog_draft=catalog_draft,
#         recipe_build=recipe_build,
#         history=None,
#     ):
#         return "inventory", True, sug, False
#     if agent_context == "create" and sug and re.search(
#         r"\b(save|add|create|confirm|go ahead)\b", message, re.I
#     ):
#         return "inventory", True, sug, False
#     if agent_context == "business" and (confirm_business or inv) and re.search(
#         r"\b(process|confirm|go ahead|apply|update).+\b(bill|receipt|sales|price)\b",
#         message,
#         re.I,
#     ):
#         return "inventory", True, sug, False
#     if agent_context == "business" and confirm_business:
#         return "inventory", True, sug, False
#     return agent_context, inv, sug, confirm_business
#
#
# def run_agent_chat(
#     *,
#     restaurant_id: str,
#     user_id: str = "",
#     recent_bill_ids: list[str] | None = None,
#     chef_name: str,
#     restaurant_name: str,
#     message: str,
#     context: AgentContext,
#     agent_context: AgentContext,
#     history: list[ChatMessage],
#     finance_period: str = "week",
#     cues_text: str = "",
#     connect_agent: AgentContext | None = None,
#     upload_batch: dict | None = None,
#     catalog_draft: dict | None = None,
#     recipe_build: dict | None = None,
#     confirm_suggestion: bool = False,
#     confirm_inventory: bool = False,
#     confirm_business: bool = False,
#     workflow_state: dict | None = None,
# ) -> dict[str, Any]:
#     handoff: Literal["inventory", "business", "create"] | None = None
#     bills = recent_bill_ids or []
#     confirmed = confirm_inventory or confirm_business or detect_upload_confirm(message)
#
#     catalog_draft = _resolve_catalog_draft(catalog_draft, message, history)
#     pantry_add_zero = detect_pantry_add_zero_confirm(message)
#     if pantry_add_zero and not confirm_suggestion:
#         confirm_suggestion = True
#
#     if connect_agent and connect_agent != "head":
#         handoff = connect_agent  # type: ignore[assignment]
#         agent_context = connect_agent
#
#     agent_context, confirm_inventory, confirm_suggestion, confirm_business = (
#         _coerce_catalog_writes_to_inventory(
#             agent_context,
#             message,
#             confirm_suggestion=confirm_suggestion,
#             confirm_inventory=confirm_inventory,
#             confirm_business=confirm_business,
#             catalog_draft=catalog_draft,
#             recipe_build=recipe_build,
#         )
#     )
#
#     if context == "head" and agent_context == "head" and not handoff:
#         if _kitchen_build_confirm(
#             message,
#             confirm_suggestion=confirm_suggestion,
#             catalog_draft=catalog_draft,
#             recipe_build=recipe_build,
#             history=history,
#         ):
#             direct = _try_kitchen_build_direct_finalize(
#                 restaurant_id,
#                 confirm_suggestion=confirm_suggestion,
#                 catalog_draft=catalog_draft,
#                 recipe_build=recipe_build,
#                 history=history,
#                 message=message,
#             )
#             if direct:
#                 return direct
#
#             prebuilt = _prebuild_recipe_plan(restaurant_id, history, catalog_draft)
#             active_recipe_build = recipe_build or prebuilt
#             result = _run_direct_specialist(
#                 agent_context="inventory",
#                 restaurant_id=restaurant_id,
#                 user_id=user_id,
#                 upload_batch=upload_batch,
#                 catalog_draft=catalog_draft,
#                 recipe_build=active_recipe_build,
#                 recent_bill_ids=bills,
#                 chef_name=chef_name,
#                 restaurant_name=restaurant_name,
#                 message=message,
#                 history=history,
#                 finance_period=finance_period,
#                 cues_text=cues_text,
#                 confirm_suggestion=confirm_suggestion,
#                 confirm_inventory=confirm_inventory or confirm_suggestion,
#                 confirm_business=confirm_business,
#                 connect_agent=connect_agent,
#                 handoff=None,
#             )
#             result["agent_context"] = "head"
#             result["activity"] = {"orchestrator": "head", "consulted_agents": ["inventory"]}
#             inv_reply = str(result.get("reply") or "").strip()
#             if inv_reply:
#                 result["reply"] = (
#                     "I consulted the **Inventory Agent** and used their tools for this step.\n\n"
#                     f"**Inventory Agent**\n{inv_reply}"
#                 )
#             if upload_batch and upload_batch_ready(upload_batch) and not confirmed:
#                 callout = format_upload_batch_callout(upload_batch)
#                 reply = str(result.get("reply") or "")
#                 if callout and callout not in reply:
#                     result["reply"] = f"{callout}\n\n{reply}" if reply else callout
#             return result
#
#         result = run_supervisor_chat(
#             restaurant_id=restaurant_id,
#             user_id=user_id,
#             upload_batch=upload_batch,
#             catalog_draft=catalog_draft,
#             recipe_build=recipe_build,
#             recent_bill_ids=bills,
#             chef_name=chef_name,
#             restaurant_name=restaurant_name,
#             message=message,
#             history=history,
#             finance_period=finance_period,
#             cues_text=cues_text,
#             confirm_suggestion=confirm_suggestion,
#             confirm_inventory=confirm_inventory,
#             confirm_business=confirm_business,
#             connect_agent=connect_agent,
#             workflow_state=workflow_state,
#         )
#         if upload_batch and upload_batch_ready(upload_batch) and not confirmed:
#             callout = format_upload_batch_callout(upload_batch)
#             reply = str(result.get("reply") or "")
#             if callout and callout not in reply:
#                 result["reply"] = f"{callout}\n\n{reply}" if reply else callout
#         return result
#
#     result = _run_direct_specialist(
#         agent_context=agent_context,
#         restaurant_id=restaurant_id,
#         user_id=user_id,
#         upload_batch=upload_batch,
#         catalog_draft=catalog_draft,
#         recipe_build=recipe_build,
#         recent_bill_ids=bills,
#         chef_name=chef_name,
#         restaurant_name=restaurant_name,
#         message=message,
#         history=history,
#         finance_period=finance_period,
#         cues_text=cues_text,
#         confirm_suggestion=confirm_suggestion,
#         confirm_inventory=confirm_inventory,
#         confirm_business=confirm_business,
#         connect_agent=connect_agent,
#         handoff=handoff,
#     )
#     if context != "head":
#         result["activity"] = {"orchestrator": "head", "consulted_agents": [agent_context]}
#     return result
#
#
# def _fallback_reply(agent_context: AgentContext) -> str:
#     inventory = ASSISTANT_NAMES["inventory"]
#     business = ASSISTANT_NAMES["business"]
#     creative = ASSISTANT_NAMES["create"]
#     if agent_context == "head":
#         return (
#             f"Ask me what to prioritize today. For stock, sales, or specials, I can point you to "
#             f"the {inventory}, {business}, or {creative}."
#         )
#     if agent_context == "inventory":
#         return (
#             f"Ask me about stock, expiry, or reorder. For sales or new dishes, switch to "
#             f"the {business} or {creative}."
#         )
#     if agent_context == "business":
#         return (
#             f"Ask me about sales, margins, or purchases. For stock or specials, switch to "
#             f"the {inventory} or {creative}."
#         )
#     return (
#         f"Tell me what kind of special you'd like. For stock or sales, use the {inventory} or {business}."
#     )
