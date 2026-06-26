"""Specialist agent identifiers."""

from __future__ import annotations

from typing import Literal

SpecialistId = Literal["inventory", "business", "create"]

SPECIALIST_LABELS: dict[SpecialistId, str] = {
    "inventory": "Inventory Agent",
    "business": "Business Agent",
    "create": "Creator Agent",
}
