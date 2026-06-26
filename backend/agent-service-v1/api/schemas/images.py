"""Image suggestion API schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from workers.image_suggestions import IMAGE_COUNT, ImageSuggestion


class SuggestImagesRequest(BaseModel):
    name: str
    item_type: str = "ingredient"
    brand_name: str = ""
    quantity: float = 0
    unit: str = ""
    extra_keywords: str = ""
    ingredient_names: list[str] = Field(default_factory=list)
    classification: str = ""
    refresh: bool = False
    exclude_urls: list[str] = Field(default_factory=list)
    count: int = IMAGE_COUNT


class SuggestImagesResponse(BaseModel):
    images: list[ImageSuggestion]
