# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Shared models for consolidated core tools."""
#
# from __future__ import annotations
#
# from pydantic import BaseModel, Field
#
# SUGGESTION_NOTE_KINDS = [
#     "expiring_ingredients",
#     "seasonal",
#     "high_margin",
#     "low_stock",
#     "cue",
#     "other",
# ]
#
# CLASSIFICATIONS = ["sandwich", "byo-sandwich", "coffee", "tea", "juice", "other"]
#
#
# class SuggestionNote(BaseModel):
#     kind: str
#     text: str
#
#
# class SuggestedDishDraft(BaseModel):
#     name: str
#     description: str
#     classification: str
#     ingredient_slugs: list[str] = Field(default_factory=list)
#     notes: list[SuggestionNote] = Field(default_factory=list)
