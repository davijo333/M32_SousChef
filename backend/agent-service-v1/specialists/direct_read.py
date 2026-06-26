"""Direct read-tool calls for catalogued query workflows — skip ReAct."""

from __future__ import annotations

from domain.context import TurnContext
from workflows.engine.intent import (
    _looks_like_addon_list_query,
    _looks_like_menu_catalog_query,
    extract_named_entity,
)
from workflows.engine.loader import get_workflow
from workflows.engine.transitions import find_step


def _search_query(ctx: TurnContext) -> str:
    from tools.core.catalog_lookup import normalize_catalog_search_query

    return (
        (ctx.workflow_state.locked_name if ctx.workflow_state else "")
        or extract_named_entity(ctx.user_message)
        or normalize_catalog_search_query(ctx.user_message)
        or ctx.user_message.strip()
    )


def menu_catalog_lookup_reply(ctx: TurnContext, query: str) -> str:
    """Search dishes, add-ons, and pantry ingredients; list add-ons when chef asks."""
    from tools.core.catalog_lookup import normalize_catalog_search_query
    from tools.core.catalog_reads import format_catalog_search
    from tools.core.reads import read_menu

    message = ctx.user_message or ""
    if _looks_like_addon_list_query(message):
        reply = read_menu(ctx.restaurant_id, "addons", limit=50)
        if reply.startswith("No add-ons"):
            return reply
        return f"Add-ons on the menu:\n{reply}"

    search_q = (
        normalize_catalog_search_query(query)
        or normalize_catalog_search_query(message)
        or query.strip()
    )
    if not search_q:
        return "Tell me a dish, add-on, or ingredient name to look up, or ask to list add-ons."

    return format_catalog_search(ctx.restaurant_id, search_q, limit=12)


def try_direct_read(ctx: TurnContext, step_id: str | None) -> str | None:
    """Run step.tool deterministically for read-mode workflows."""
    if not ctx.workflow_state:
        return None
    wf = get_workflow(ctx.workflow_state.workflow_id)
    if not wf or wf.get("mode") != "read":
        return None
    step = find_step(wf, step_id or ctx.workflow_state.step_id)
    if not step or not step.get("tool"):
        return None
    return invoke_step_tool(ctx, step)


def invoke_step_tool(ctx: TurnContext, step: dict) -> str:
    from tools.core.reads import read_business, read_inventory, read_menu

    tool = str(step.get("tool") or "").strip()
    parts = tool.split(None, 1)
    if len(parts) == 2:
        namespace, action = parts[0], parts[1]
    else:
        namespace, action = "query_inventory", parts[0]
    action = action.replace("-", "_")

    query = _search_query(ctx)
    wf_id = ctx.workflow_state.workflow_id if ctx.workflow_state else ""

    if namespace == "query_inventory" and action in ("ingredient_detail", "search", "detail", "catalog_search"):
        if _looks_like_menu_catalog_query(ctx.user_message):
            return menu_catalog_lookup_reply(ctx, query)

    if namespace == "query_menu" and action in ("search_dishes", "search"):
        if wf_id == "inventory_menu_lookup" or _looks_like_menu_catalog_query(ctx.user_message):
            return menu_catalog_lookup_reply(ctx, query)

    if namespace == "query_menu":
        return read_menu(
            ctx.restaurant_id,
            action,
            cues_text=ctx.cues_text,
            query=query,
            limit=12,
        )
    if namespace == "query_inventory":
        return read_inventory(
            ctx.restaurant_id,
            action,
            user_id=ctx.user_id,
            query=query,
            slug=query,
            bill_ids=ctx.recent_bill_ids or None,
        )
    if namespace == "query_business":
        return read_business(
            ctx.restaurant_id,
            action,
            user_id=ctx.user_id,
            finance_period=ctx.finance_period,
            dish_name=query,
            slug=query,
            bill_ids=ctx.recent_bill_ids or None,
        )
    return f"Unsupported read tool namespace: {namespace}"
