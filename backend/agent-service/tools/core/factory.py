# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Factory for the 9 consolidated core @tool functions."""
#
# from __future__ import annotations
#
# from typing import Any
#
# from langchain_core.tools import tool
#
# from config import settings
#
# from tools.core.bills import format_chat_upload_batch, summarize_upload_handoff
# from tools.core.reads import read_business, read_inventory, read_kitchen, read_menu
# from tools.core.writes import CoreToolContext, NavigationAction, PendingAction
# from tools.core.menu_actions import (
#     resolve_addon_slug,
#     resolve_dish_slug,
#     resolve_ingredient_slug,
#     resolve_ingredient_slugs,
#     ingredient_tokens_for_pending,
# )
# from tools.core.models import (
#     CLASSIFICATIONS,
#     SUGGESTION_NOTE_KINDS,
#     SuggestedDishDraft,
#     SuggestionNote,
# )
# from tools.core.recipe_build import (
#     apply_recipe_selections,
#     auto_default_selections,
#     dish_create_collision_message,
#     format_recipe_build_plan,
#     parse_selections_from_message,
#     plan_recipe_build,
# )
# from tools.core.catalog_draft_helpers import is_valid_recipe_dish_name
# from tools.core.catalog_lookup import (
#     check_create_addon,
#     check_create_dish,
#     check_create_ingredient,
#     check_update_addon,
#     check_update_dish,
#     check_update_ingredient,
#     format_create_collision,
#     format_dish_summary,
#     format_addon_summary,
#     format_ingredient_summary,
#     format_update_miss,
# )
# from tools.core.navigation import AGENT_CHAT_TARGETS, NAV_TARGETS
#
#
# def _recipe_client():
#     from openai import OpenAI
#
#     key = settings.OPENAI_API_KEY
#     return OpenAI(api_key=key) if key else None
#
#
# def _catalog_draft_defaults(ctx: CoreToolContext) -> dict[str, Any]:
#     draft = ctx.catalog_draft or {}
#     if not draft:
#         return {}
#     return {
#         "name": str(draft.get("name") or "").strip(),
#         "brand_name": str(draft.get("brandName") or "").strip(),
#         "category": str(draft.get("category") or "").strip(),
#         "classification": str(draft.get("classification") or "").strip(),
#         "description": str(draft.get("description") or "").strip(),
#         "image_url": str(draft.get("imageUrl") or "").strip(),
#         "item_type": str(draft.get("itemType") or "").strip(),
#     }
#
#
# def _catalog_confirmed(ctx: CoreToolContext) -> bool:
#     """Inventory owns catalog writes — confirm_inventory (or legacy confirm_suggestion)."""
#     return bool(ctx.confirm_inventory or ctx.confirm_suggestion)
#
#
# def make_core_tools_for_agent(
#     agent: str,
#     *,
#     restaurant_id: str,
#     user_id: str = "",
#     finance_period: str = "week",
#     cues_text: str = "",
#     recent_bill_ids: list[str] | None = None,
#     ctx: CoreToolContext,
# ) -> list[Any]:
#     rid = restaurant_id
#     bills = recent_bill_ids or ctx.upload_batch.get("readyBillIds") or []
#
#     if agent == "head":
#         return [
#             _query_kitchen(rid, finance_period),
#             _orchestrate(rid, finance_period, cues_text, ctx),
#         ]
#     if agent == "inventory":
#         return [
#             _query_inventory(rid, user_id, bills),
#             _apply_inventory(rid, user_id, ctx),
#             _upload_bills(user_id, ctx),
#             _query_menu(rid, cues_text),
#             _apply_menu(rid, ctx),
#         ]
#     if agent == "business":
#         return [
#             _query_business(rid, user_id, finance_period, bills),
#             _query_inventory(rid, user_id, bills),
#         ]
#     return [
#         _query_menu(rid, cues_text),
#         _query_inventory(rid, user_id, bills),
#     ]
#
#
# def _query_kitchen(restaurant_id: str, finance_period: str):
#     @tool
#     def query_kitchen() -> str:
#         """Return combined inventory and business snapshots for daily triage."""
#         return read_kitchen(restaurant_id, finance_period)
#
#     return query_kitchen
#
#
# def _orchestrate(restaurant_id: str, finance_period: str, cues_text: str, ctx: CoreToolContext):
#     @tool
#     def orchestrate(
#         action: str,
#         question: str = "",
#         agent: str = "",
#         reason: str = "",
#         page: str = "",
#     ) -> str:
#         """Route, consult specialists, navigate, or suggest handoff.
#         Actions: consult_inventory, consult_business, consult_creative, suggest_handoff,
#         navigate_to, open_chat_agent.
#         """
#         act = action.strip().lower().replace("-", "_")
#         if act == "consult_inventory":
#             from context.builders import build_inventory_context
#
#             snapshot = build_inventory_context(restaurant_id)
#             return f"Inventory consult for: {question or 'general'}\n\n{snapshot}"
#         if act == "consult_business":
#             from context.builders import build_business_context
#
#             snapshot = build_business_context(restaurant_id, finance_period)
#             return f"Business consult for: {question or 'general'}\n\n{snapshot}"
#         if act in ("consult_creative", "consult_menu"):
#             from context.builders import build_creative_context
#
#             snapshot = build_creative_context(restaurant_id, cues_text)
#             return f"Creative consult for: {question or 'general'}\n\n{snapshot}"
#         if act == "suggest_handoff":
#             target = agent.strip().lower()
#             if target in ("creative", "create"):
#                 target = "create"
#             if target not in ("inventory", "business", "create"):
#                 return "Invalid agent — use inventory, business, or create."
#             labels = {
#                 "inventory": "Inventory",
#                 "business": "Business",
#                 "create": "Creative",
#             }
#             return (
#                 f"Sous Chef will consult **{labels[target]}** — {reason or question}. "
#                 "No agent switch needed; the chef stays in Sous Chef chat."
#             )
#         if act == "navigate_to":
#             key = (page or question or agent).strip().lower().replace("-", "_").replace(" ", "_")
#             if key not in NAV_TARGETS:
#                 return f"Unknown page — use: {', '.join(NAV_TARGETS.keys())}."
#             path, label = NAV_TARGETS[key]
#             ctx.push_navigation(NavigationAction(path=path, label=label))
#             return f"Open **{label}** at [{path}]({path})."
#         if act == "open_chat_agent":
#             target = agent.strip().lower() or page.strip().lower()
#             if target not in AGENT_CHAT_TARGETS:
#                 return "Invalid agent — use inventory, business, or create."
#             agent_key, label = AGENT_CHAT_TARGETS[target]
#             ctx.push_navigation(
#                 NavigationAction(path="/dashboard", label=label, agent=agent_key)  # type: ignore[arg-type]
#             )
#             return (
#                 f"Sous Chef will consult **{label}** for {reason or question or 'this task'}. "
#                 "The chef stays in Sous Chef chat — use consult mode, not a manual agent switch."
#             )
#         return (
#             "Unknown action. Use: consult_inventory, consult_business, consult_creative, "
#             "suggest_handoff, navigate_to, open_chat_agent."
#         )
#
#     return orchestrate
#
#
# def _query_inventory(restaurant_id: str, user_id: str, recent_bill_ids: list[str]):
#     @tool
#     def query_inventory(
#         action: str = "pantry_summary",
#         query: str = "",
#         slug: str = "",
#         bill_id: str = "",
#         within_days: int = 7,
#         limit: int = 15,
#     ) -> str:
#         """Query pantry stock, expiry, reorder, search, and purchase bill queue.
#         Actions: pantry_summary, low_stock, expiring, search, ingredient_detail,
#         dish_detail, addon_detail, catalog_search, purchase_queue, purchase_bill_summary.
#         All qty and reorder figures come from the ingredients collection (DB).
#         """
#         return read_inventory(
#             restaurant_id,
#             action,
#             user_id=user_id,
#             query=query,
#             slug=slug,
#             bill_id=bill_id,
#             bill_ids=recent_bill_ids or None,
#             within_days=within_days,
#             limit=limit,
#         )
#
#     return query_inventory
#
#
# def _apply_inventory(restaurant_id: str, user_id: str, ctx: CoreToolContext):
#     @tool
#     def apply_inventory(
#         action: str,
#         slug: str = "",
#         name: str = "",
#         reorder_threshold: float | None = None,
#         bill_ids: list[str] | None = None,
#         category: str = "misc",
#         inventory_unit: str = "each",
#         current_qty: float | None = None,
#         brand_name: str = "",
#         image_url: str = "",
#         sell_price: float | None = None,
#     ) -> str:
#         """Mutate kitchen catalog — pantry, bills, and pricing (confirmation required).
#         Actions: create_ingredient, update_ingredient, delete_ingredient,
#         update_reorder_threshold, process_purchase_bills, process_sales_bills,
#         apply_price_change.
#         Always call query_inventory search before create/update when unsure.
#         Chat photo/link drafts pre-fill name and image — qty stays 0 with label new on create.
#         """
#         act = action.strip().lower().replace("-", "_")
#         from db.mongo import find_one
#
#         draft = _catalog_draft_defaults(ctx)
#
#         if act == "create_ingredient":
#             ing_name = (name.strip() or draft.get("name", "")).strip()
#             if not ing_name:
#                 return "Provide name for create_ingredient, or attach a product photo / image link."
#             unit = inventory_unit.strip() or "each"
#             qty = 0.0
#             threshold = float(reorder_threshold) if reorder_threshold is not None else 1.0
#             cat = category.strip() or draft.get("category", "") or "misc"
#             brand = brand_name.strip() or draft.get("brand_name", "")
#             img = image_url.strip() or draft.get("image_url", "")
#
#             lookup = check_create_ingredient(restaurant_id, ing_name, brand_name=brand)
#             if lookup.get("exact"):
#                 collision = format_create_collision("ingredient", ing_name, lookup)
#                 return collision or f"Ingredient **{ing_name}** already exists."
#             collision = format_create_collision("ingredient", ing_name, lookup)
#             if collision and not ctx.confirm_inventory:
#                 return collision
#
#             preview = (
#                 f"Create pantry item **{ing_name}** ({cat}, {unit})"
#                 f" with qty **0** (label **new**), reorder at {threshold}."
#             )
#             if brand:
#                 preview += f" Brand: {brand}."
#             if img:
#                 preview += " Includes attached/catalog image."
#             if not ctx.confirm_inventory:
#                 return preview + "\n\nAsk the chef to confirm before creating."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="create_ingredient",
#                     ingredientName=ing_name,
#                     category=cat,
#                     inventoryUnit=unit,
#                     currentQty=qty,
#                     reorderThreshold=threshold,
#                     brandName=brand or None,
#                     imageUrl=img or None,
#                     label="new",
#                 )
#             )
#             return preview + "\n\nConfirmed — creating ingredient."
#
#         if act == "update_ingredient":
#             lookup = check_update_ingredient(restaurant_id, slug=slug, name=name)
#             ing = lookup.get("found")
#             if not ing:
#                 miss = format_update_miss("ingredient", slug or name, lookup)
#                 return miss or "Ingredient not found — provide slug or name."
#             ing_slug = str(ing.get("slug", slug))
#             if not ctx.confirm_inventory:
#                 current = format_ingredient_summary(ing)
#                 return (
#                     f"Current pantry item:\n{current}\n\n"
#                     "Tell me what to change (qty, reorder, category, brand, name), then confirm."
#                 )
#             changes: list[str] = []
#             if name.strip() and name.strip().lower() != str(ing.get("name", "")).lower():
#                 changes.append(f"name → {name.strip()}")
#             if category.strip():
#                 changes.append(f"category → {category.strip()}")
#             if inventory_unit.strip():
#                 changes.append(f"unit → {inventory_unit.strip()}")
#             if current_qty is not None:
#                 changes.append(f"qty → {current_qty}")
#             if reorder_threshold is not None:
#                 changes.append(f"reorder → {reorder_threshold}")
#             if brand_name.strip():
#                 changes.append(f"brand → {brand_name.strip()}")
#             if not changes:
#                 return "Provide fields to update (name, category, inventory_unit, current_qty, reorder_threshold, brand_name)."
#             preview = f"Update **{ing['name']}** ({ing_slug}): {', '.join(changes)}."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="update_ingredient",
#                     slug=ing_slug,
#                     ingredientName=name.strip() or None,
#                     category=category.strip() or None,
#                     inventoryUnit=inventory_unit.strip() or None,
#                     currentQty=float(current_qty) if current_qty is not None else None,
#                     reorderThreshold=float(reorder_threshold) if reorder_threshold is not None else None,
#                     brandName=brand_name.strip() or None,
#                 )
#             )
#             return preview + "\n\nConfirmed — updating ingredient."
#
#         if act == "delete_ingredient":
#             ing = resolve_ingredient_slug(restaurant_id, slug=slug, name=name)
#             if not ing:
#                 return "Ingredient not found — provide slug or name."
#             ing_slug = str(ing.get("slug", slug))
#             preview = (
#                 f"Remove **{ing['name']}** ({ing_slug}) from pantry "
#                 "and unlink it from any dishes or add-ons."
#             )
#             if not ctx.confirm_inventory:
#                 return preview + "\n\nAsk the chef to confirm before deleting."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="delete_ingredient",
#                     slug=ing_slug,
#                     ingredientName=str(ing.get("name", name)),
#                 )
#             )
#             return preview + "\n\nConfirmed — deleting ingredient."
#
#         if act == "update_reorder_threshold":
#             ing = resolve_ingredient_slug(restaurant_id, slug=slug, name=name)
#             if not ing:
#                 return "Ingredient not found — provide slug or name."
#             if reorder_threshold is None:
#                 return "Provide reorder_threshold."
#             preview = (
#                 f"Update pantry ingredient **{ing['name']}** reorder level to **{reorder_threshold:g}** "
#                 f"{ing.get('inventoryUnit', 'each')}."
#             )
#             if not ctx.confirm_inventory:
#                 return preview + "\n\nAsk the chef to confirm before applying."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="update_reorder_threshold",
#                     slug=ing.get("slug", slug),
#                     reorderThreshold=float(reorder_threshold),
#                     ingredientName=str(ing.get("name", name)),
#                 )
#             )
#             return preview + "\n\nConfirmed — applying reorder threshold."
#
#         if act == "process_purchase_bills":
#             if ctx.batch_auto_process:
#                 return "Purchase orders from this chat upload are already processing."
#             ids = [bid.strip() for bid in (bill_ids or []) if bid.strip()]
#             if not ids:
#                 batch_ids = ctx.upload_batch.get("readyBillIds") or []
#                 ids = [str(bid).strip() for bid in batch_ids if str(bid).strip()]
#             if not ids and user_id:
#                 from tools.core.bills import get_bills_for_user
#
#                 pending = get_bills_for_user(
#                     user_id,
#                     bill_type="supplier",
#                     status="pending_review",
#                     limit=20,
#                 )
#                 from tools.core.bills import _bill_id_str
#
#                 ids = [_bill_id_str(bill) for bill in pending]
#             if not ids:
#                 return "No purchase bills are ready to process."
#             preview = (
#                 f"Process {len(ids)} purchase order(s). Updates pantry stock from uploaded invoices."
#             )
#             if not ctx.confirm_inventory:
#                 return preview + "\n\nAsk the chef to confirm before processing."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="process_purchase_bills",
#                     billIds=ids,
#                     billType="supplier",
#                 )
#             )
#             return preview + "\n\nConfirmed — processing purchase orders."
#
#         if act == "apply_price_change":
#             dish = resolve_dish_slug(restaurant_id, slug=slug, name=name)
#             if not dish:
#                 return "Dish not found — provide slug or name."
#             if sell_price is None or sell_price <= 0:
#                 return "Provide sell_price for apply_price_change."
#             preview = f"Update **{dish['name']}** sell price to ${sell_price:.2f}."
#             if not ctx.confirm_inventory:
#                 return preview + "\n\nAsk the chef to confirm before applying."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="update_dish_price",
#                     slug=str(dish.get("slug", slug)),
#                     dishName=str(dish.get("name", name)),
#                     sellPrice=float(sell_price),
#                 )
#             )
#             return preview + "\n\nConfirmed — updating price."
#
#         if act == "process_sales_bills":
#             if ctx.batch_auto_process:
#                 return "Sales receipts from this chat upload are already processing."
#             prereq = read_business(restaurant_id, "purchase_prerequisite")
#             if "No processed supplier" in prereq:
#                 return prereq
#             ids = [bid.strip() for bid in (bill_ids or []) if bid.strip()]
#             if not ids:
#                 batch_ids = ctx.upload_batch.get("readyBillIds") or []
#                 ids = [str(bid).strip() for bid in batch_ids if str(bid).strip()]
#             if not ids and user_id:
#                 from tools.core.bills import get_bills_for_user, _bill_id_str
#
#                 pending = get_bills_for_user(
#                     user_id,
#                     bill_type="customer",
#                     status="pending_review",
#                     limit=20,
#                 )
#                 ids = [_bill_id_str(bill) for bill in pending]
#             if not ids:
#                 return "No sales bills are ready to process."
#             preview = (
#                 f"Process {len(ids)} sales receipt(s). Updates menu catalog and deducts pantry."
#             )
#             if not ctx.confirm_inventory:
#                 return preview + "\n\nAsk the chef to confirm before processing."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="process_sales_bills",
#                     billIds=ids,
#                     billType="customer",
#                 )
#             )
#             return preview + "\n\nConfirmed — processing sales receipts."
#
#         return (
#             "Unknown action. Use: create_ingredient, update_ingredient, delete_ingredient, "
#             "update_reorder_threshold, process_purchase_bills, process_sales_bills, "
#             "apply_price_change."
#         )
#
#     return apply_inventory
#
#
# def _upload_bills(user_id: str, ctx: CoreToolContext):
#     @tool
#     def upload_bills(action: str = "summarize") -> str:
#         """Summarize uploaded bills; report chat batch or pending queue status.
#         Actions: summarize, batch_status, validate_queue.
#         """
#         act = action.strip().lower().replace("-", "_")
#         batch = ctx.upload_batch
#         if act in ("batch_status", "status", "classify_batch") and batch:
#             return format_chat_upload_batch(batch)
#         if act in ("summarize", "summarize_upload", "handoff"):
#             if batch and int(batch.get("ready") or 0) > 0:
#                 return format_chat_upload_batch(batch)
#             return summarize_upload_handoff(
#                 user_id,
#                 recent_bill_ids=batch.get("readyBillIds") if batch else None,
#             )
#         if act in ("validate_queue", "queue"):
#             return summarize_upload_handoff(user_id, recent_bill_ids=None)
#         return "Unknown action. Use: summarize, batch_status, classify_batch, validate_queue."
#
#     return upload_bills
#
#
# def _query_business(restaurant_id: str, user_id: str, finance_period: str, recent_bill_ids: list[str]):
#     @tool
#     def query_business(
#         action: str = "finance_summary",
#         bill_id: str = "",
#         view: str = "highest",
#         limit: int = 8,
#         slug: str = "",
#         dish_name: str = "",
#     ) -> str:
#         """Query sales, margins, promotions, and sales bill queue (read-only).
#         Actions: finance_summary, top_selling, slow_sellers, margins, dish_pricing,
#         addon_pricing, sales_vs_purchases, sales_queue, sales_bill_summary,
#         purchase_prerequisite, top_used_ingredients, promotion_opportunities,
#         suggest_price_change, suggest_reorder_threshold.
#         Sell prices come from dishes/addons collections; margins use recipe food cost.
#         """
#         return read_business(
#             restaurant_id,
#             action,
#             user_id=user_id,
#             finance_period=finance_period,
#             bill_id=bill_id,
#             bill_ids=recent_bill_ids or None,
#             view=view,
#             limit=limit,
#             slug=slug,
#             dish_name=dish_name,
#         )
#
#     return query_business
#
#
# def _query_menu(restaurant_id: str, cues_text: str):
#     @tool
#     def query_menu(
#         action: str = "cues",
#         query: str = "",
#         limit: int = 12,
#     ) -> str:
#         """Query cues, dishes, suggestions, and promotion targets for ideation.
#         Actions: cues, search_dishes, suggested, active, addons, dish_detail,
#         addon_detail, promotion_targets. Sell prices from dishes/addons DB rows.
#         """
#         return read_menu(restaurant_id, action, cues_text=cues_text, query=query, limit=limit)
#
#     return query_menu
#
#
# def _apply_menu(restaurant_id: str, ctx: CoreToolContext):
#     @tool
#     def apply_menu(
#         action: str,
#         name: str = "",
#         description: str = "",
#         classification: str = "other",
#         slug: str = "",
#         sell_price: float | None = None,
#         image_mode: str = "pair",
#         ingredient_slugs: list[str] | None = None,
#         notes: list[dict[str, Any]] | None = None,
#         link_mode: str = "add",
#         qty_per_serving: float | None = None,
#         unit: str = "each",
#         image_url: str = "",
#         recipe_ingredients: list[dict[str, Any]] | None = None,
#         recipe_instructions: list[str] | None = None,
#         recipe_selections: str = "",
#         visual_brief: str = "",
#         linked_dish_slugs: list[str] | None = None,
#     ) -> str:
#         """Menu writes: dishes, add-ons, ingredient links, suggestions, descriptions, and catalog images.
#         Actions: plan_recipe_build, update_recipe_selections, finalize_recipe_build,
#         add_suggested_dish, draft_special_only, create_dish, update_dish, delete_dish,
#         create_addon, update_addon, delete_addon, link_dish_ingredients, link_addon_ingredients,
#         enrich_dish_description, generate_dish_image, generate_ingredient_image.
#         For full kitchen builds (dish + pantry ingredients + images) use plan_recipe_build,
#         NOT add_suggested_dish. add_suggested_dish is ideas-only (Recipes → Suggested).
#         """
#         act = action.strip().lower().replace("-", "_")
#         draft = _catalog_draft_defaults(ctx)
#
#         if act in ("plan_recipe_build", "plan_recipe", "recipe_plan"):
#             dish_name = (name.strip() or "").strip()
#             if not dish_name or not is_valid_recipe_dish_name(dish_name):
#                 draft_name = str(draft.get("name") or "").strip()
#                 if (
#                     str(draft.get("source") or "").strip().lower() != "pricing"
#                     and is_valid_recipe_dish_name(draft_name)
#                 ):
#                     dish_name = draft_name
#             if not dish_name:
#                 return "Provide dish name for plan_recipe_build (menu dish name, not agent label)."
#             rows = recipe_ingredients or []
#             if not rows:
#                 return (
#                     "Provide recipe_ingredients — list of {name, qty, unit} for each pantry item "
#                     "in the recipe."
#                 )
#             try:
#                 plan = plan_recipe_build(
#                     restaurant_id,
#                     _recipe_client(),
#                     dish_name=dish_name,
#                     description=description.strip() or draft.get("description", ""),
#                     visual_brief=visual_brief.strip(),
#                     classification=classification.strip() or draft.get("classification", "other"),
#                     sell_price=sell_price,
#                     ingredients=rows,
#                     instructions=recipe_instructions,
#                 )
#             except ValueError as exc:
#                 return str(exc)
#             ctx.recipe_build = plan
#             return format_recipe_build_plan(plan)
#
#         if act in ("update_recipe_selections", "select_recipe_ingredients", "recipe_select"):
#             if not ctx.recipe_build:
#                 return "No recipe plan in progress — call plan_recipe_build first."
#             ctx.recipe_build = apply_recipe_selections(ctx.recipe_build, {})
#             return (
#                 "Store product image picking was removed from chat — pantry uses general ingredient names. "
#                 + format_recipe_build_plan(ctx.recipe_build)
#             )
#
#         if act in ("finalize_recipe_build", "commit_recipe_build", "build_recipe"):
#             if not ctx.recipe_build:
#                 return "No recipe plan — call plan_recipe_build with dish name and ingredients first."
#             plan = auto_default_selections(ctx.recipe_build)
#             ctx.recipe_build = plan
#             collision = dish_create_collision_message(restaurant_id, str(plan.get("dishName", "")))
#             if collision:
#                 return collision
#             if plan.get("status") != "ready_to_finalize":
#                 return format_recipe_build_plan(plan)
#             preview = (
#                 f"Build **{plan['dishName']}** in Kitchen control: add missing pantry items "
#                 "(qty 0, label new), link ingredients, generate packaging + dish images."
#             )
#             if not ctx.confirm_suggestion:
#                 return preview + "\n\nAsk the chef to confirm before building."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="finalize_recipe_build",
#                     dishName=str(plan.get("dishName", "")),
#                     description=str(plan.get("description") or ""),
#                     classification=str(plan.get("classification") or "other"),
#                     sellPrice=float(plan["sellPrice"]) if plan.get("sellPrice") is not None else None,
#                     recipeBuildPlan=plan,
#                 )
#             )
#             return preview + "\n\nConfirmed — building recipe in kitchen."
#
#         if act == "draft_special_only":
#             if classification not in CLASSIFICATIONS:
#                 classification = "other"
#             draft = SuggestedDishDraft(
#                 name=name.strip(),
#                 description=description.strip(),
#                 classification=classification,
#                 ingredient_slugs=ingredient_slugs or [],
#                 notes=[],
#             )
#             return "Draft only (not saved):\n" + draft.model_dump_json()
#
#         if act == "generate_dish_image":
#             dish = resolve_dish_slug(restaurant_id, slug=slug, name=name)
#             if not dish:
#                 return "Dish not found — provide slug or name."
#             mode = "secondary" if image_mode.lower() == "secondary" else "pair"
#             ctx.push_pending(
#                 PendingAction(
#                     kind="generate_dish_image",
#                     slug=str(dish.get("slug", slug)),
#                     dishName=str(dish.get("name", name)),
#                     imageMode=mode,
#                 )
#             )
#             return f"Generating {mode} images for **{dish['name']}**…"
#
#         if act == "generate_ingredient_image":
#             ing = resolve_ingredient_slug(restaurant_id, slug=slug, name=name)
#             if not ing:
#                 return f"Ingredient '{slug or name}' not found."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="generate_ingredient_image",
#                     slug=str(ing.get("slug", slug)),
#                     ingredientName=str(ing.get("name", slug)),
#                 )
#             )
#             return f"Generating packaging images for **{ing['name']}**…"
#
#         if act == "create_dish":
#             dish_name = (name.strip() or draft.get("name", "")).strip()
#             if not dish_name:
#                 return "Provide name for create_dish, or attach a menu photo / image link."
#             dish_class = classification.strip() or draft.get("classification", "") or "other"
#             if dish_class not in CLASSIFICATIONS:
#                 dish_class = "other"
#             dish_desc = description.strip() or draft.get("description", "")
#             img = image_url.strip() or draft.get("image_url", "")
#             link_tokens, missing_ing = ingredient_tokens_for_pending(
#                 restaurant_id, ingredient_slugs or []
#             )
#
#             lookup = check_create_dish(restaurant_id, dish_name)
#             if lookup.get("exact"):
#                 collision = format_create_collision("dish", dish_name, lookup)
#                 return collision or f"Dish **{dish_name}** already exists."
#             collision = format_create_collision("dish", dish_name, lookup)
#             if collision and not _catalog_confirmed(ctx):
#                 return collision
#
#             preview = (
#                 f"Create dish **{dish_name}** ({dish_class})"
#                 + (f" at ${sell_price:.2f}" if sell_price else "")
#                 + (f" with {len(link_tokens)} linked ingredient(s)." if link_tokens else ".")
#             )
#             if missing_ing:
#                 preview += f" Will add {len(missing_ing)} new pantry item(s) at qty 0."
#             if dish_desc:
#                 preview += f" Description: {dish_desc[:120]}."
#             if img:
#                 preview += " Includes attached/catalog image."
#             if not _catalog_confirmed(ctx):
#                 return preview + "\n\nAsk the chef to confirm before creating."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="create_dish",
#                     dishName=dish_name,
#                     description=dish_desc,
#                     classification=dish_class,
#                     sellPrice=float(sell_price) if sell_price else 0,
#                     ingredientSlugs=link_tokens,
#                     imageUrl=img or None,
#                 )
#             )
#             return preview + "\n\nConfirmed — creating dish."
#
#         if act == "delete_dish":
#             dish = resolve_dish_slug(restaurant_id, slug=slug, name=name)
#             if not dish:
#                 return "Dish not found — provide slug or name."
#             dish_slug = str(dish.get("slug", slug))
#             preview = f"Delete dish **{dish['name']}** ({dish_slug}) from the menu."
#             if not _catalog_confirmed(ctx):
#                 return preview + "\n\nAsk the chef to confirm before deleting."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="delete_dish",
#                     slug=dish_slug,
#                     dishName=str(dish.get("name", name)),
#                 )
#             )
#             return preview + "\n\nConfirmed — deleting dish."
#
#         if act == "link_dish_ingredients":
#             dish = resolve_dish_slug(restaurant_id, slug=slug, name=name)
#             if not dish:
#                 return "Dish not found — provide slug or name."
#             tokens = ingredient_slugs or []
#             if not tokens:
#                 return "Provide ingredient_slugs to link, unlink, or set on the dish."
#             mode = link_mode.strip().lower().replace("-", "_") or "add"
#             if mode not in ("add", "remove", "set"):
#                 return "link_mode must be add, remove, or set."
#             resolved, missing = ingredient_tokens_for_pending(restaurant_id, tokens)
#             dish_slug = str(dish.get("slug", slug))
#             qty = float(qty_per_serving) if qty_per_serving is not None else 1.0
#             link_unit = unit.strip() or "each"
#             if mode == "add":
#                 preview = (
#                     f"Link {len(resolved)} ingredient(s) to **{dish['name']}** "
#                     f"({qty} {link_unit} each)."
#                 )
#             elif mode == "remove":
#                 preview = f"Remove {len(resolved)} ingredient link(s) from **{dish['name']}**."
#             else:
#                 preview = f"Set **{dish['name']}** ingredient links to {len(resolved)} item(s)."
#             if missing:
#                 preview += f" Will add {len(missing)} new pantry item(s) at qty 0."
#             if not _catalog_confirmed(ctx):
#                 return preview + "\n\nAsk the chef to confirm before updating links."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="link_dish_ingredients",
#                     slug=dish_slug,
#                     dishName=str(dish.get("name", name)),
#                     ingredientSlugs=resolved,
#                     linkMode=mode,  # type: ignore[arg-type]
#                     qtyPerServing=qty,
#                     unit=link_unit,
#                 )
#             )
#             return preview + "\n\nConfirmed — updating dish ingredient links."
#
#         if act == "update_dish":
#             lookup = check_update_dish(restaurant_id, slug=slug, name=name)
#             dish = lookup.get("found")
#             if not dish:
#                 miss = format_update_miss("dish", slug or name, lookup)
#                 return miss or "Dish not found — provide slug or name."
#             if not _catalog_confirmed(ctx):
#                 current = format_dish_summary(dish)
#                 return (
#                     f"Current menu item:\n{current}\n\n"
#                     "Tell me what to change (name, price, classification, description), then confirm."
#                 )
#             changes = []
#             new_name = name.strip()
#             dish_slug = str(dish.get("slug", slug))
#             if new_name and new_name.lower() != str(dish.get("name", "")).lower() and slug.strip():
#                 changes.append(f"name → {new_name}")
#             dish_class = classification.strip() or draft.get("classification", "")
#             if dish_class and dish_class in CLASSIFICATIONS:
#                 changes.append(f"classification → {dish_class}")
#             if sell_price is not None:
#                 changes.append(f"sell price → ${sell_price:.2f}")
#             dish_desc = description.strip() or draft.get("description", "")
#             if dish_desc:
#                 changes.append("description")
#             img = image_url.strip() or draft.get("image_url", "")
#             if img:
#                 changes.append("catalog image")
#             if not changes:
#                 return "Provide name, classification, sell_price, description, and/or image_url to update."
#             preview = f"Update **{dish['name']}**: {', '.join(changes)}."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="update_dish",
#                     slug=dish_slug,
#                     dishName=new_name if new_name and slug.strip() else None,
#                     description=dish_desc or None,
#                     classification=dish_class if dish_class in CLASSIFICATIONS else None,
#                     sellPrice=float(sell_price) if sell_price is not None else None,
#                     imageUrl=img or None,
#                 )
#             )
#             return preview + "\n\nConfirmed — updating dish."
#
#         if act == "enrich_dish_description":
#             dish = resolve_dish_slug(restaurant_id, slug=slug, name=name)
#             if not dish:
#                 return "Dish not found — provide slug or name."
#             if not description.strip():
#                 return "Provide description text for enrich_dish_description."
#             preview = f"Update **{dish['name']}** POS description."
#             if not _catalog_confirmed(ctx):
#                 return preview + "\n\nAsk the chef to confirm before saving."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="enrich_dish_description",
#                     slug=str(dish.get("slug", slug)),
#                     dishName=str(dish.get("name", name)),
#                     description=description.strip(),
#                 )
#             )
#             return preview + "\n\nConfirmed — saving description."
#
#         if act == "create_addon":
#             addon_name = (name.strip() or draft.get("name", "")).strip()
#             if not addon_name:
#                 return "Provide name for create_addon, or attach a menu photo / image link."
#             addon_class = classification.strip() or draft.get("classification", "") or "addon"
#             addon_desc = description.strip() or draft.get("description", "")
#             img = image_url.strip() or draft.get("image_url", "")
#             link_tokens, missing_ing = ingredient_tokens_for_pending(
#                 restaurant_id, ingredient_slugs or []
#             )
#             dish_links = [token.strip() for token in (linked_dish_slugs or []) if token.strip()]
#
#             lookup = check_create_addon(restaurant_id, addon_name)
#             if lookup.get("exact"):
#                 collision = format_create_collision("addon", addon_name, lookup)
#                 return collision or f"Add-on **{addon_name}** already exists."
#             collision = format_create_collision("addon", addon_name, lookup)
#             if collision and not _catalog_confirmed(ctx):
#                 return collision
#
#             preview = (
#                 f"Create add-on **{addon_name}** ({addon_class})"
#                 + (f" at ${sell_price:.2f}" if sell_price else "")
#                 + (f" with {len(link_tokens)} linked ingredient(s)." if link_tokens else ".")
#             )
#             if missing_ing:
#                 preview += f" Will add {len(missing_ing)} new pantry item(s) at qty 0."
#             if dish_links:
#                 preview += f" Linked to {len(dish_links)} dish(es)."
#             if addon_desc:
#                 preview += f" Description: {addon_desc[:120]}."
#             if img:
#                 preview += " Includes attached/catalog image."
#             if not _catalog_confirmed(ctx):
#                 return preview + "\n\nAsk the chef to confirm before creating."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="create_addon",
#                     dishName=addon_name,
#                     description=addon_desc,
#                     classification=addon_class,
#                     sellPrice=float(sell_price) if sell_price else 0,
#                     ingredientSlugs=link_tokens,
#                     linkedDishSlugs=dish_links,
#                     imageUrl=img or None,
#                 )
#             )
#             return preview + "\n\nConfirmed — creating add-on."
#
#         if act == "update_addon":
#             lookup = check_update_addon(restaurant_id, slug=slug, name=name)
#             addon = lookup.get("found")
#             if not addon:
#                 miss = format_update_miss("addon", slug or name, lookup)
#                 return miss or "Add-on not found — provide slug or name."
#             if not _catalog_confirmed(ctx):
#                 current = format_addon_summary(addon)
#                 return (
#                     f"Current add-on:\n{current}\n\n"
#                     "Tell me what to change (name, price, classification, description, linked dishes), then confirm."
#                 )
#             changes = []
#             new_name = name.strip()
#             addon_slug = str(addon.get("slug", slug))
#             if new_name and new_name.lower() != str(addon.get("name", "")).lower() and slug.strip():
#                 changes.append(f"name → {new_name}")
#             addon_class = classification.strip() or draft.get("classification", "")
#             if addon_class:
#                 changes.append(f"classification → {addon_class}")
#             if sell_price is not None:
#                 changes.append(f"sell price → ${sell_price:.2f}")
#             addon_desc = description.strip() or draft.get("description", "")
#             if addon_desc:
#                 changes.append("description")
#             img = image_url.strip() or draft.get("image_url", "")
#             if img:
#                 changes.append("catalog image")
#             dish_links = linked_dish_slugs
#             if dish_links is not None:
#                 changes.append(f"linked dishes → {len(dish_links)}")
#             if not changes:
#                 return "Provide name, classification, sell_price, description, linked_dish_slugs, and/or image_url to update."
#             preview = f"Update add-on **{addon['name']}**: {', '.join(changes)}."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="update_addon",
#                     slug=addon_slug,
#                     dishName=new_name if new_name and slug.strip() else None,
#                     description=addon_desc or None,
#                     classification=addon_class or None,
#                     sellPrice=float(sell_price) if sell_price is not None else None,
#                     imageUrl=img or None,
#                     linkedDishSlugs=dish_links if dish_links is not None else [],
#                 )
#             )
#             return preview + "\n\nConfirmed — updating add-on."
#
#         if act == "delete_addon":
#             addon = resolve_addon_slug(restaurant_id, slug=slug, name=name)
#             if not addon:
#                 return "Add-on not found — provide slug or name."
#             addon_slug = str(addon.get("slug", slug))
#             preview = f"Delete add-on **{addon['name']}** ({addon_slug}) from the menu."
#             if not _catalog_confirmed(ctx):
#                 return preview + "\n\nAsk the chef to confirm before deleting."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="delete_addon",
#                     slug=addon_slug,
#                     dishName=str(addon.get("name", name)),
#                 )
#             )
#             return preview + "\n\nConfirmed — deleting add-on."
#
#         if act == "link_addon_ingredients":
#             addon = resolve_addon_slug(restaurant_id, slug=slug, name=name)
#             if not addon:
#                 return "Add-on not found — provide slug or name."
#             tokens = ingredient_slugs or []
#             if not tokens:
#                 return "Provide ingredient_slugs to link, unlink, or set on the add-on."
#             mode = link_mode.strip().lower().replace("-", "_") or "add"
#             if mode not in ("add", "remove", "set"):
#                 return "link_mode must be add, remove, or set."
#             resolved, missing = ingredient_tokens_for_pending(restaurant_id, tokens)
#             addon_slug = str(addon.get("slug", slug))
#             qty = float(qty_per_serving) if qty_per_serving is not None else 1.0
#             link_unit = unit.strip() or "each"
#             if mode == "add":
#                 preview = (
#                     f"Link {len(resolved)} ingredient(s) to add-on **{addon['name']}** "
#                     f"({qty} {link_unit} each)."
#                 )
#             elif mode == "remove":
#                 preview = f"Remove {len(resolved)} ingredient link(s) from add-on **{addon['name']}**."
#             else:
#                 preview = f"Set add-on **{addon['name']}** ingredient links to {len(resolved)} item(s)."
#             if missing:
#                 preview += f" Will add {len(missing)} new pantry item(s) at qty 0."
#             if not _catalog_confirmed(ctx):
#                 return preview + "\n\nAsk the chef to confirm before updating links."
#             ctx.push_pending(
#                 PendingAction(
#                     kind="link_addon_ingredients",
#                     slug=addon_slug,
#                     dishName=str(addon.get("name", name)),
#                     ingredientSlugs=resolved,
#                     linkMode=mode,  # type: ignore[arg-type]
#                     qtyPerServing=qty,
#                     unit=link_unit,
#                 )
#             )
#             return preview + "\n\nConfirmed — updating add-on ingredient links."
#
#         if act != "add_suggested_dish":
#             return (
#                 "Unknown action. Use: plan_recipe_build, update_recipe_selections, "
#                 "finalize_recipe_build, add_suggested_dish, draft_special_only, create_dish, "
#                 "update_dish, delete_dish, create_addon, update_addon, delete_addon, "
#                 "link_dish_ingredients, link_addon_ingredients, enrich_dish_description, "
#                 "generate_dish_image, generate_ingredient_image."
#             )
#
#         if description.strip() and any(
#             word in description.lower()
#             for word in ("ingredient", "recipe", "pantry", "link")
#         ):
#             return (
#                 "This sounds like a full kitchen build — use **plan_recipe_build** with "
#                 "recipe_ingredients, then finalize_recipe_build. add_suggested_dish is for "
#                 "ideas only (Recipes → Suggested), not pantry + menu catalog."
#             )
#
#         if classification not in CLASSIFICATIONS:
#             classification = "other"
#         parsed_notes = []
#         for note in notes or []:
#             kind = str(note.get("kind", "other"))
#             if kind not in SUGGESTION_NOTE_KINDS:
#                 kind = "other"
#             parsed_notes.append(SuggestionNote(kind=kind, text=str(note.get("text", "")).strip()))
#         if not parsed_notes:
#             return "Error: add at least one rationale note before saving."
#         draft = SuggestedDishDraft(
#             name=name.strip(),
#             description=description.strip(),
#             classification=classification,
#             ingredient_slugs=ingredient_slugs or [],
#             notes=parsed_notes,
#         )
#         if not ctx.confirm_suggestion:
#             return (
#                 "Draft ready — ask the chef to confirm (e.g. 'add it', 'save that') before persisting.\n"
#                 + draft.model_dump_json()
#             )
#         ctx.suggestion_sink.append(draft)
#         return f"Saved suggestion draft for **{draft.name}**."
#
#     return apply_menu
