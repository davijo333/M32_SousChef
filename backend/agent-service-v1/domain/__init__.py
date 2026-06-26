"""Shared domain types — session, turn context, specialist IDs."""

from domain.messages import MessageRole, TurnMessage
from domain.specialists import SPECIALIST_LABELS, SpecialistId

__all__ = [
    "MessageRole",
    "TurnMessage",
    "SpecialistId",
    "SPECIALIST_LABELS",
]
