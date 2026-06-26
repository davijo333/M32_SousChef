"""Chat message types."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

MessageRole = Literal["user", "assistant", "system"]


@dataclass(frozen=True)
class TurnMessage:
    role: MessageRole
    content: str
