"""Factory for the 9 consolidated core @tool functions."""

from __future__ import annotations

from typing import Any

from langchain_core.tools import tool

from tools.core.bills import format_chat_upload_batch, summarize_upload_handoff
from tools.core.reads import read_business, read_inventory, read_kitchen, read_menu
from tools.core.writes import CoreToolContext, NavigationAction, PendingAction
from tools.core.menu_actions import resolve_dish_slug, resolve_ingredient_slug, suggest_price_change_text
from tools.core.models import (
    CLASSIFICATIONS,
    SUGGESTION_NOTE_KINDS,
    SuggestedDishDraft,
    SuggestionNote,
)
from tools.core.navigation import AGENT_CHAT_TARGETS, NAV_TARGETS


def make_core_tools_for_agent(
    agent: str,
    *,
    restaurant_id: str,
    user_id: str = "",
    finance_period: str = "week",
    cues_text: str = "",
    recent_bill_ids: list[str] | None = None,
    ctx: CoreToolContext,
) -> list[Any]:
    rid = restaurant_id
    bills = recent_bill_ids or ctx.upload_batch.get("readyBillIds") or []

    if agent == "head":
        return [
            _query_kitchen(rid, finance_period),
            _orchestrate(rid, finance_period, cues_text, ctx),
        ]
    if agent == "inventory":
        return [
            _query_inventory(rid, user_id, bills),
            _apply_inventory(rid, user_id, ctx),
            _upload_bills(user_id, ctx),
        ]
    if agent == "business":
        return [
            _query_business(rid, user_id, finance_period, bills),
            _apply_business(rid, ctx),
        ]
    return [
        _query_menu(rid, cues_text),
        _apply_menu(rid, ctx),
    ]


def _query_kitchen(restaurant_id: str, finance_period: str):
    @tool
    def query_kitchen() -> str:
        """Return combined inventory and business snapshots for daily triage."""
        return read_kitchen(restaurant_id, finance_period)

    return query_kitchen


def _orchestrate(restaurant_id: str, finance_period: str, cues_text: str, ctx: CoreToolContext):
    @tool
    def orchestrate(
        action: str,
        question: str = "",
        agent: str = "",
        reason: str = "",
        page: str = "",
    ) -> str:
        """Route, consult specialists, navigate, or suggest handoff.
        Actions: consult_inventory, consult_business, consult_creative, suggest_handoff,
        navigate_to, open_chat_agent.
        """
        act = action.strip().lower().replace("-", "_")
        if act == "consult_inventory":
            from context.builders import build_inventory_context

            snapshot = build_inventory_context(restaurant_id)
            return f"Inventory consult for: {question or 'general'}\n\n{snapshot}"
        if act == "consult_business":
            from context.builders import build_business_context

            snapshot = build_business_context(restaurant_id, finance_period)
            return f"Business consult for: {question or 'general'}\n\n{snapshot}"
        if act in ("consult_creative", "consult_menu"):
            from context.builders import build_creative_context

            snapshot = build_creative_context(restaurant_id, cues_text)
            return f"Creative consult for: {question or 'general'}\n\n{snapshot}"
        if act == "suggest_handoff":
            target = agent.strip().lower()
            if target in ("creative", "create"):
                target = "create"
            if target not in ("inventory", "business", "create"):
                return "Invalid agent — use inventory, business, or create."
            labels = {
                "inventory": "Inventory Agent",
                "business": "Business Agent",
                "create": "Creative Agent",
            }
            return (
                f"Recommend handoff to **{labels[target]}** — {reason or question}. "
                f"The chef can tap Connect to {labels[target]} in chat."
            )
        if act == "navigate_to":
            key = (page or question or agent).strip().lower().replace("-", "_").replace(" ", "_")
            if key not in NAV_TARGETS:
                return f"Unknown page — use: {', '.join(NAV_TARGETS.keys())}."
            path, label = NAV_TARGETS[key]
            ctx.push_navigation(NavigationAction(path=path, label=label))
            return f"Open **{label}** at [{path}]({path})."
        if act == "open_chat_agent":
            target = agent.strip().lower() or page.strip().lower()
            if target not in AGENT_CHAT_TARGETS:
                return "Invalid agent — use inventory, business, or create."
            agent_key, label = AGENT_CHAT_TARGETS[target]
            ctx.push_navigation(
                NavigationAction(path="/dashboard", label=label, agent=agent_key)  # type: ignore[arg-type]
            )
            return (
                f"Connect the chef to **{label}** for {reason or question or 'this task'}. "
                "They can use the Connect button in chat."
            )
        return (
            "Unknown action. Use: consult_inventory, consult_business, consult_creative, "
            "suggest_handoff, navigate_to, open_chat_agent."
        )

    return orchestrate


def _query_inventory(restaurant_id: str, user_id: str, recent_bill_ids: list[str]):
    @tool
    def query_inventory(
        action: str = "pantry_summary",
        query: str = "",
        slug: str = "",
        bill_id: str = "",
        within_days: int = 7,
        limit: int = 15,
    ) -> str:
        """Query pantry stock, expiry, reorder, search, and purchase bill queue.
        Actions: pantry_summary, low_stock, expiring, search, ingredient_detail,
        purchase_queue, purchase_bill_summary.
        """
        return read_inventory(
            restaurant_id,
            action,
            user_id=user_id,
            query=query,
            slug=slug,
            bill_id=bill_id,
            bill_ids=recent_bill_ids or None,
            within_days=within_days,
            limit=limit,
        )

    return query_inventory


def _apply_inventory(restaurant_id: str, user_id: str, ctx: CoreToolContext):
    @tool
    def apply_inventory(
        action: str,
        slug: str = "",
        reorder_threshold: float | None = None,
        bill_ids: list[str] | None = None,
    ) -> str:
        """Mutate pantry — reorder thresholds or process purchase bills (requires confirmation).
        Actions: update_reorder_threshold, process_purchase_bills.
        process_purchase_bills uses the chat upload batch or pending supplier queue — no bill IDs needed.
        """
        act = action.strip().lower().replace("-", "_")
        if act == "update_reorder_threshold":
            if not slug or reorder_threshold is None:
                return "Provide slug and reorder_threshold."
            ing = None
            from db.mongo import find_one

            ing = find_one(
                "ingredients",
                restaurant_id,
                {"slug": slug.strip().lower()},
                {"name": 1, "slug": 1, "reorderThreshold": 1},
            )
            if not ing:
                return f"Ingredient '{slug}' not found."
            preview = (
                f"Update **{ing['name']}** ({ing.get('slug')}) reorder threshold: "
                f"{ing.get('reorderThreshold', 0)} → {reorder_threshold}."
            )
            if not ctx.confirm_inventory:
                return preview + "\n\nAsk the chef to confirm before applying."
            ctx.push_pending(
                PendingAction(
                    kind="update_reorder_threshold",
                    slug=ing.get("slug", slug),
                    reorderThreshold=float(reorder_threshold),
                    ingredientName=str(ing.get("name", slug)),
                )
            )
            return preview + "\n\nConfirmed — applying reorder threshold."

        if act == "process_purchase_bills":
            if ctx.batch_auto_process:
                return "Purchase orders from this chat upload are already processing."
            ids = [bid.strip() for bid in (bill_ids or []) if bid.strip()]
            if not ids:
                batch_ids = ctx.upload_batch.get("readyBillIds") or []
                ids = [str(bid).strip() for bid in batch_ids if str(bid).strip()]
            if not ids and user_id:
                from tools.core.bills import get_bills_for_user

                pending = get_bills_for_user(
                    user_id,
                    bill_type="supplier",
                    status="pending_review",
                    limit=20,
                )
                from tools.core.bills import _bill_id_str

                ids = [_bill_id_str(bill) for bill in pending]
            if not ids:
                return "No purchase bills are ready to process."
            preview = (
                f"Process {len(ids)} purchase order(s). Updates pantry stock from uploaded invoices."
            )
            if not ctx.confirm_inventory:
                return preview + "\n\nAsk the chef to confirm before processing."
            ctx.push_pending(
                PendingAction(
                    kind="process_purchase_bills",
                    billIds=ids,
                    billType="supplier",
                )
            )
            return preview + "\n\nConfirmed — processing purchase orders."

        return "Unknown action. Use: update_reorder_threshold, process_purchase_bills."

    return apply_inventory


def _upload_bills(user_id: str, ctx: CoreToolContext):
    @tool
    def upload_bills(action: str = "summarize") -> str:
        """Summarize uploaded bills; report chat batch or pending queue status.
        Actions: summarize, batch_status, validate_queue.
        """
        act = action.strip().lower().replace("-", "_")
        batch = ctx.upload_batch
        if act in ("batch_status", "status", "classify_batch") and batch:
            return format_chat_upload_batch(batch)
        if act in ("summarize", "summarize_upload", "handoff"):
            if batch and int(batch.get("ready") or 0) > 0:
                return format_chat_upload_batch(batch)
            return summarize_upload_handoff(
                user_id,
                recent_bill_ids=batch.get("readyBillIds") if batch else None,
            )
        if act in ("validate_queue", "queue"):
            return summarize_upload_handoff(user_id, recent_bill_ids=None)
        return "Unknown action. Use: summarize, batch_status, classify_batch, validate_queue."

    return upload_bills


def _query_business(restaurant_id: str, user_id: str, finance_period: str, recent_bill_ids: list[str]):
    @tool
    def query_business(
        action: str = "finance_summary",
        bill_id: str = "",
        view: str = "highest",
        limit: int = 8,
    ) -> str:
        """Query sales, margins, finance summaries, and sales bill queue.
        Actions: finance_summary, top_selling, margins, sales_vs_purchases,
        sales_queue, sales_bill_summary, purchase_prerequisite.
        """
        return read_business(
            restaurant_id,
            action,
            user_id=user_id,
            finance_period=finance_period,
            bill_id=bill_id,
            bill_ids=recent_bill_ids or None,
            view=view,
            limit=limit,
        )

    return query_business


def _apply_business(restaurant_id: str, ctx: CoreToolContext):
    @tool
    def apply_business(
        action: str,
        bill_ids: list[str] | None = None,
        slug: str = "",
        dish_name: str = "",
        sell_price: float | None = None,
    ) -> str:
        """Process sales bills or pricing actions (confirm required for writes).
        Actions: process_sales_bills, suggest_price_change, apply_price_change.
        """
        act = action.strip().lower().replace("-", "_")

        if act == "suggest_price_change":
            return suggest_price_change_text(restaurant_id, slug=slug, name=dish_name)

        if act == "apply_price_change":
            dish = resolve_dish_slug(restaurant_id, slug=slug, name=dish_name)
            if not dish:
                return "Dish not found — provide slug or name."
            if sell_price is None or sell_price <= 0:
                return "Provide sell_price for apply_price_change."
            preview = f"Update **{dish['name']}** sell price to ${sell_price:.2f}."
            if not ctx.confirm_business:
                return preview + "\n\nAsk the chef to confirm before applying."
            ctx.push_pending(
                PendingAction(
                    kind="update_dish_price",
                    slug=str(dish.get("slug", slug)),
                    dishName=str(dish.get("name", dish_name)),
                    sellPrice=float(sell_price),
                )
            )
            return preview + "\n\nConfirmed — updating price."

        if act != "process_sales_bills":
            return "Unknown action. Use: process_sales_bills, suggest_price_change, apply_price_change."

        if ctx.batch_auto_process:
            return "Sales receipts from this chat upload are already processing."

        prereq = read_business(restaurant_id, "purchase_prerequisite")
        if "No processed supplier" in prereq:
            return prereq

        ids = [bid.strip() for bid in (bill_ids or []) if bid.strip()]
        if not ids:
            batch_ids = ctx.upload_batch.get("readyBillIds") or []
            ids = [str(bid).strip() for bid in batch_ids if str(bid).strip()]
        if not ids and ctx.user_id:
            from tools.core.bills import get_bills_for_user, _bill_id_str

            pending = get_bills_for_user(
                ctx.user_id,
                bill_type="customer",
                status="pending_review",
                limit=20,
            )
            ids = [_bill_id_str(bill) for bill in pending]
        if not ids:
            return "No sales bills are ready to process."
        preview = f"Process {len(ids)} sales receipt(s). Updates menu catalog and deducts pantry."
        if not ctx.confirm_business:
            return preview + "\n\nAsk the chef to confirm before processing."
        ctx.push_pending(
            PendingAction(
                kind="process_sales_bills",
                billIds=ids,
                billType="customer",
            )
        )
        return preview + "\n\nConfirmed — processing sales bills."

    return apply_business


def _query_menu(restaurant_id: str, cues_text: str):
    @tool
    def query_menu(
        action: str = "cues",
        query: str = "",
        limit: int = 12,
    ) -> str:
        """Query cues, pantry for specials, dishes, and suggestions.
        Actions: cues, search_dishes, suggested, active, addons.
        """
        return read_menu(restaurant_id, action, cues_text=cues_text, query=query, limit=limit)

    return query_menu


def _apply_menu(restaurant_id: str, ctx: CoreToolContext):
    @tool
    def apply_menu(
        action: str,
        name: str = "",
        description: str = "",
        classification: str = "other",
        slug: str = "",
        sell_price: float | None = None,
        image_mode: str = "pair",
        ingredient_slugs: list[str] | None = None,
        notes: list[dict[str, Any]] | None = None,
    ) -> str:
        """Menu writes: suggestions, dishes, descriptions, and catalog images.
        Actions: add_suggested_dish, draft_special_only, create_dish, update_dish,
        enrich_dish_description, generate_dish_image, generate_ingredient_image.
        """
        act = action.strip().lower().replace("-", "_")

        if act == "draft_special_only":
            if classification not in CLASSIFICATIONS:
                classification = "other"
            draft = SuggestedDishDraft(
                name=name.strip(),
                description=description.strip(),
                classification=classification,
                ingredient_slugs=ingredient_slugs or [],
                notes=[],
            )
            return "Draft only (not saved):\n" + draft.model_dump_json()

        if act == "generate_dish_image":
            dish = resolve_dish_slug(restaurant_id, slug=slug, name=name)
            if not dish:
                return "Dish not found — provide slug or name."
            mode = "secondary" if image_mode.lower() == "secondary" else "pair"
            ctx.push_pending(
                PendingAction(
                    kind="generate_dish_image",
                    slug=str(dish.get("slug", slug)),
                    dishName=str(dish.get("name", name)),
                    imageMode=mode,
                )
            )
            return f"Generating {mode} images for **{dish['name']}**…"

        if act == "generate_ingredient_image":
            ing = resolve_ingredient_slug(restaurant_id, slug)
            if not ing:
                return f"Ingredient '{slug}' not found."
            ctx.push_pending(
                PendingAction(
                    kind="generate_ingredient_image",
                    slug=str(ing.get("slug", slug)),
                    ingredientName=str(ing.get("name", slug)),
                )
            )
            return f"Generating packaging images for **{ing['name']}**…"

        if act == "create_dish":
            if not name.strip():
                return "Provide name for create_dish."
            if classification not in CLASSIFICATIONS:
                classification = "other"
            preview = (
                f"Create dish **{name.strip()}** ({classification})"
                + (f" at ${sell_price:.2f}" if sell_price else "")
                + "."
            )
            if not ctx.confirm_suggestion:
                return preview + "\n\nAsk the chef to confirm before creating."
            ctx.push_pending(
                PendingAction(
                    kind="create_dish",
                    dishName=name.strip(),
                    description=description.strip(),
                    classification=classification,
                    sellPrice=float(sell_price) if sell_price else 0,
                    ingredientSlugs=ingredient_slugs or [],
                )
            )
            return preview + "\n\nConfirmed — creating dish."

        if act == "update_dish":
            dish = resolve_dish_slug(restaurant_id, slug=slug, name=name)
            if not dish:
                return "Dish not found — provide slug or name."
            changes = []
            if sell_price is not None:
                changes.append(f"sell price → ${sell_price:.2f}")
            if description.strip():
                changes.append("description")
            if not changes:
                return "Provide sell_price and/or description to update."
            preview = f"Update **{dish['name']}**: {', '.join(changes)}."
            if not ctx.confirm_suggestion:
                return preview + "\n\nAsk the chef to confirm before updating."
            ctx.push_pending(
                PendingAction(
                    kind="update_dish",
                    slug=str(dish.get("slug", slug)),
                    dishName=str(dish.get("name", name)),
                    description=description.strip() or None,
                    sellPrice=float(sell_price) if sell_price is not None else None,
                )
            )
            return preview + "\n\nConfirmed — updating dish."

        if act == "enrich_dish_description":
            dish = resolve_dish_slug(restaurant_id, slug=slug, name=name)
            if not dish:
                return "Dish not found — provide slug or name."
            if not description.strip():
                return "Provide description text for enrich_dish_description."
            preview = f"Update **{dish['name']}** POS description."
            if not ctx.confirm_suggestion:
                return preview + "\n\nAsk the chef to confirm before saving."
            ctx.push_pending(
                PendingAction(
                    kind="enrich_dish_description",
                    slug=str(dish.get("slug", slug)),
                    dishName=str(dish.get("name", name)),
                    description=description.strip(),
                )
            )
            return preview + "\n\nConfirmed — saving description."

        if act != "add_suggested_dish":
            return (
                "Unknown action. Use: add_suggested_dish, draft_special_only, create_dish, "
                "update_dish, enrich_dish_description, generate_dish_image, generate_ingredient_image."
            )

        if classification not in CLASSIFICATIONS:
            classification = "other"
        parsed_notes = []
        for note in notes or []:
            kind = str(note.get("kind", "other"))
            if kind not in SUGGESTION_NOTE_KINDS:
                kind = "other"
            parsed_notes.append(SuggestionNote(kind=kind, text=str(note.get("text", "")).strip()))
        if not parsed_notes:
            return "Error: add at least one rationale note before saving."
        draft = SuggestedDishDraft(
            name=name.strip(),
            description=description.strip(),
            classification=classification,
            ingredient_slugs=ingredient_slugs or [],
            notes=parsed_notes,
        )
        if not ctx.confirm_suggestion:
            return (
                "Draft ready — ask the chef to confirm (e.g. 'add it', 'save that') before persisting.\n"
                + draft.model_dump_json()
            )
        ctx.suggestion_sink.append(draft)
        return f"Saved suggestion draft for **{draft.name}**."

    return apply_menu
