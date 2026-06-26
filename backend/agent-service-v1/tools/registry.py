"""Map specialist ID → LangChain tools."""

from __future__ import annotations

from typing import Any

from domain.specialists import SpecialistId
from tools.core.factory import make_core_tools_for_agent
from tools.core.writes import CoreToolContext


def get_tools_for_specialist(
    specialist_id: SpecialistId,
    *,
    restaurant_id: str,
    user_id: str = "",
    finance_period: str = "week",
    cues_text: str = "",
    core_ctx: CoreToolContext,
    recent_bill_ids: list[str] | None = None,
) -> list[Any]:
    """Return tool callables scoped to the worker contract."""
    agent_key = specialist_id
    return make_core_tools_for_agent(
        agent_key,
        restaurant_id=restaurant_id,
        user_id=user_id,
        finance_period=finance_period,
        cues_text=cues_text,
        recent_bill_ids=recent_bill_ids,
        ctx=core_ctx,
    )
