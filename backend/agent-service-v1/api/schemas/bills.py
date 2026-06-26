"""Bill parse/classify API schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from workers.image_suggestions import ImageSuggestion


class PrepareCatalogBatchResult(BaseModel):
    key: str
    normalized_name: str
    brand_name: str = ""
    images: list[ImageSuggestion] = Field(default_factory=list)


class ParsePipelineResponse(BaseModel):
    bill: dict
    unique_item_count: int = 0
    enriched: list[PrepareCatalogBatchResult] = Field(default_factory=list)
    menu_items: list[dict] = Field(default_factory=list)


class ClassifyBillResponse(BaseModel):
    billType: str
    confidence: float
    reason: str = ""
