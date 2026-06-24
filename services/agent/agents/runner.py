"""LangGraph agent runner — supervisor graph for Sous Chef, direct ReAct for specialists."""

from __future__ import annotations

import re
from typing import Any, Literal

from agents.handoff import detect_handoff_from_message, detect_upload_batch_handoff
from agents.prompts import ASSISTANT_NAMES, AgentContext
from agents.specialists import result_from_core_ctx, run_react_agent
from agents.supervisor import run_supervisor_chat
from tools.core.bills import (
    detect_upload_confirm,
    format_upload_batch_callout,
    normalize_upload_batch_slices,
    upload_batch_is_mixed,
    upload_batch_ready,
)
from tools.core.writes import CoreToolContext

ChatMessage = dict[str, str]


def _upload_handoff_note(upload_batch: dict | None, *, confirmed: bool) -> str:
    if not upload_batch or not upload_batch_ready(upload_batch):
        return ""
    if confirmed:
        return (
            "\n\nThe chef confirmed processing for the uploaded bill batch. "
            "Purchase orders → Inventory (you, if connected). Sales receipts → Business after POs. "
            "Same order as Upload orders: POs first, then SOs."
        )
    callout = format_upload_batch_callout(upload_batch)
    mixed = upload_batch_is_mixed(upload_batch)
    routing = (
        "Summarize what you identified (counts and filenames) and ask for confirmation before processing. "
        "Do not process yet."
    )
    if mixed:
        routing += (
            " Explain that purchase orders go to Inventory and sales receipts to Business, "
            "with POs processed first — same as Upload orders."
        )
    return f"\n\n{callout}\n\n{routing}"


def _run_direct_specialist(
    *,
    agent_context: AgentContext,
    restaurant_id: str,
    user_id: str,
    upload_batch: dict | None,
    recent_bill_ids: list[str],
    chef_name: str,
    restaurant_name: str,
    message: str,
    history: list[ChatMessage],
    finance_period: str,
    cues_text: str,
    confirm_suggestion: bool,
    confirm_inventory: bool,
    confirm_business: bool,
    connect_agent: AgentContext | None,
    handoff: Literal["inventory", "business", "create"] | None,
) -> dict[str, Any]:
    confirmed = confirm_inventory or confirm_business or detect_upload_confirm(message)
    core_ctx = CoreToolContext(
        user_id=user_id,
        upload_batch=upload_batch,
        confirm_inventory=confirm_inventory,
        confirm_business=confirm_business,
        confirm_suggestion=confirm_suggestion,
    )

    handoff_note = ""
    if handoff:
        handoff_note = (
            "\n\nThe chef was just connected to you from another assistant. "
            "Read the full conversation history and take over seamlessly."
        )
    handoff_note += _upload_handoff_note(upload_batch, confirmed=confirmed)
    if (
        agent_context == "inventory"
        and confirmed
        and upload_batch
        and upload_batch_ready(upload_batch)
    ):
        slices = normalize_upload_batch_slices(upload_batch)
        if any(str(row.get("billType")) == "supplier" for row in slices):
            handoff_note += (
                "\n\nThe chef confirmed **purchase order** processing and you are the Inventory Agent. "
                "Process with apply_inventory action process_purchase_bills. "
                "Do NOT tell them to connect to Business Agent — you own supplier invoices."
            )

    llm_user_message = message
    if connect_agent and connect_agent != "head":
        llm_user_message = (
            "The chef clicked Connect in chat to speak with you. Review the conversation above "
            "and take over — briefly acknowledge the thread, then help with what they need."
        )

    reply = run_react_agent(
        agent_context,
        restaurant_id=restaurant_id,
        user_id=user_id,
        recent_bill_ids=recent_bill_ids,
        chef_name=chef_name,
        restaurant_name=restaurant_name,
        finance_period=finance_period,
        cues_text=cues_text,
        core_ctx=core_ctx,
        history=history,
        user_message=llm_user_message,
        handoff_note=handoff_note,
    )

    if not reply:
        reply = _fallback_reply(agent_context)

    if upload_batch and upload_batch_ready(upload_batch) and not confirmed:
        callout = format_upload_batch_callout(upload_batch)
        if callout and callout not in reply:
            reply = f"{callout}\n\n{reply}" if reply else callout

    if handoff and handoff != "head":
        specialist = ASSISTANT_NAMES[handoff]
        if not re.search(r"you're now connected with", reply, re.I):
            reply = f"You're now connected with the **{specialist}**.\n\n{reply}"

    result = {
        "reply": reply,
        "agent_context": agent_context,
        "handoff": handoff,
        **result_from_core_ctx(core_ctx),
    }
    return result


def run_agent_chat(
    *,
    restaurant_id: str,
    user_id: str = "",
    recent_bill_ids: list[str] | None = None,
    chef_name: str,
    restaurant_name: str,
    message: str,
    context: AgentContext,
    agent_context: AgentContext,
    history: list[ChatMessage],
    finance_period: str = "week",
    cues_text: str = "",
    connect_agent: AgentContext | None = None,
    upload_batch: dict | None = None,
    confirm_suggestion: bool = False,
    confirm_inventory: bool = False,
    confirm_business: bool = False,
) -> dict[str, Any]:
    handoff: Literal["inventory", "business", "create"] | None = None
    bills = recent_bill_ids or []
    confirmed = confirm_inventory or confirm_business or detect_upload_confirm(message)

    if connect_agent and connect_agent != "head":
        handoff = connect_agent  # type: ignore[assignment]
        agent_context = connect_agent
    elif context == "head" and not connect_agent and confirmed:
        if upload_batch_ready(upload_batch):
            slices = normalize_upload_batch_slices(upload_batch)
            if any(str(row.get("billType")) == "supplier" for row in slices):
                handoff = "inventory"
                agent_context = "inventory"
            elif any(str(row.get("billType")) == "customer" for row in slices):
                handoff = "business"
                agent_context = "business"
        elif confirm_inventory:
            handoff = "inventory"
            agent_context = "inventory"
        elif confirm_business:
            handoff = "business"
            agent_context = "business"
    elif context == "head" and not connect_agent and not upload_batch_ready(upload_batch):
        detected = detect_handoff_from_message(message)
        if detected:
            handoff = detected
            agent_context = detected

    if context == "head" and agent_context == "head" and not handoff:
        result = run_supervisor_chat(
            restaurant_id=restaurant_id,
            user_id=user_id,
            upload_batch=upload_batch,
            recent_bill_ids=bills,
            chef_name=chef_name,
            restaurant_name=restaurant_name,
            message=message,
            history=history,
            finance_period=finance_period,
            cues_text=cues_text,
            confirm_suggestion=confirm_suggestion,
            confirm_inventory=confirm_inventory,
            confirm_business=confirm_business,
            connect_agent=connect_agent,
        )
        if upload_batch and upload_batch_ready(upload_batch) and not confirmed:
            callout = format_upload_batch_callout(upload_batch)
            reply = str(result.get("reply") or "")
            if callout and callout not in reply:
                result["reply"] = f"{callout}\n\n{reply}" if reply else callout
        return result

    return _run_direct_specialist(
        agent_context=agent_context,
        restaurant_id=restaurant_id,
        user_id=user_id,
        upload_batch=upload_batch,
        recent_bill_ids=bills,
        chef_name=chef_name,
        restaurant_name=restaurant_name,
        message=message,
        history=history,
        finance_period=finance_period,
        cues_text=cues_text,
        confirm_suggestion=confirm_suggestion,
        confirm_inventory=confirm_inventory,
        confirm_business=confirm_business,
        connect_agent=connect_agent,
        handoff=handoff,
    )


def _fallback_reply(agent_context: AgentContext) -> str:
    inventory = ASSISTANT_NAMES["inventory"]
    business = ASSISTANT_NAMES["business"]
    creative = ASSISTANT_NAMES["create"]
    if agent_context == "head":
        return (
            f"Ask me what to prioritize today. For stock, sales, or specials, I can point you to "
            f"the {inventory}, {business}, or {creative}."
        )
    if agent_context == "inventory":
        return (
            f"Ask me about stock, expiry, or reorder. For sales or new dishes, switch to "
            f"the {business} or {creative}."
        )
    if agent_context == "business":
        return (
            f"Ask me about sales, margins, or purchases. For stock or specials, switch to "
            f"the {inventory} or {creative}."
        )
    return (
        f"Tell me what kind of special you'd like. For stock or sales, use the {inventory} or {business}."
    )
