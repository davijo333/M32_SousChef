"""Catalog image suggestion routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from openai import OpenAI

from api.schemas.images import SuggestImagesRequest, SuggestImagesResponse
from config.settings import settings
from workers.image_suggestions import MAX_IMAGE_SUGGESTIONS, suggest_images

router = APIRouter()


@router.post("/suggest-images", response_model=SuggestImagesResponse)
def suggest_images_endpoint(req: SuggestImagesRequest) -> SuggestImagesResponse:
    """Fetch product-packaging or plated-dish photos (static images only — no GIFs)."""
    name = (req.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")

    client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None
    try:
        limit = max(1, min(req.count, MAX_IMAGE_SUGGESTIONS))
        images = suggest_images(
            client,
            name,
            req.item_type,
            brand_name=req.brand_name if req.item_type == "ingredient" else "",
            quantity=req.quantity,
            unit=req.unit,
            extra_keywords=req.extra_keywords,
            ingredient_names=req.ingredient_names if req.item_type in ("dish", "addon") else [],
            use_gpt=client is not None,
            refresh=req.refresh,
            exclude_urls=req.exclude_urls,
            count=limit,
            classification=req.classification if req.item_type == "addon" else "",
        )
        return SuggestImagesResponse(images=images)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Image suggest failed: {exc}") from exc
