"""Base specialist runner interface."""

from __future__ import annotations

from abc import ABC, abstractmethod

from domain.context import TurnContext
from domain.specialists import SpecialistId


class BaseSpecialist(ABC):
    id: SpecialistId

    @abstractmethod
    def run(self, ctx: TurnContext, *, step_id: str | None, task_prompt: str) -> str:
        """Execute one consult turn; must use tools for facts and writes."""
