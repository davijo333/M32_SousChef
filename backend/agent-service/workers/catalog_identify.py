"""Identify a pantry ingredient or menu dish from a photo or image URL."""

from __future__ import annotations

import re
from typing import Literal
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from openai import OpenAI
from pydantic import BaseModel, Field

from .bill_parser_common import load_bill_image, vision_json

ItemType = Literal["ingredient", "dish"]

IDENTIFY_PROMPT = """You identify a restaurant pantry ingredient or café menu dish from this image.

Return JSON only:
{
  "itemType": "ingredient" or "dish",
  "name": "short kitchen name (2-5 words, no pack sizes or supplier codes)",
  "brandName": "brand if visible on packaging, else empty string",
  "category": "for ingredients: produce|dairy|protein|bakery|beverage|misc; for dishes use classification",
  "classification": "for dishes: sandwich|byo-sandwich|coffee|tea|juice|other; else empty string",
  "description": "short POS description for dishes; empty for ingredients",
  "confidence": 0.0-1.0
}

Ingredients are packaged grocery items (milk carton, produce, protein case). Dishes are prepared menu items (latte, sandwich plate)."""


class CatalogIdentification(BaseModel):
    itemType: ItemType = "ingredient"
    name: str = ""
    brandName: str = ""
    category: str = "misc"
    classification: str = "other"
    description: str = ""
    confidence: float = Field(default=0.7, ge=0.0, le=1.0)
    imageUrl: str = ""
    source: str = ""


_IMAGE_URL = re.compile(r"\.(png|jpe?g|webp|gif)(\?|$)", re.I)


def _normalize_identification(data: dict, *, image_url: str = "", source: str = "") -> CatalogIdentification:
    item_type = str(data.get("itemType", "ingredient")).strip().lower()
    if item_type not in ("ingredient", "dish"):
        item_type = "dish" if item_type == "menu_item" else "ingredient"
    name = str(data.get("name", "")).strip()
    return CatalogIdentification(
        itemType=item_type,  # type: ignore[arg-type]
        name=name,
        brandName=str(data.get("brandName", "")).strip(),
        category=str(data.get("category", "misc")).strip() or "misc",
        classification=str(data.get("classification", "other")).strip() or "other",
        description=str(data.get("description", "")).strip(),
        confidence=float(data.get("confidence", 0.7) or 0.7),
        imageUrl=image_url,
        source=source,
    )


def _fetch_image_bytes(url: str) -> tuple[bytes, str]:
    req = Request(url, headers={"User-Agent": "SousChef/1.0"})
    with urlopen(req, timeout=20) as resp:
        data = resp.read()
        content_type = resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
        if not content_type.startswith("image/"):
            raise ValueError("URL did not return an image")
        return data, content_type


def identify_catalog_from_bytes(
    client: OpenAI,
    image_bytes: bytes,
    mime_type: str,
    *,
    item_type_hint: str = "",
    filename: str = "catalog.jpg",
) -> CatalogIdentification:
    data, mime = load_bill_image(image_bytes, filename, mime_type)
    hint = f"\nChef hint: treat this as a {item_type_hint}." if item_type_hint else ""
    payload = vision_json(client, data, mime, IDENTIFY_PROMPT + hint)
    return _normalize_identification(payload, source="photo")


def identify_catalog_from_url(
    client: OpenAI,
    url: str,
    *,
    item_type_hint: str = "",
) -> CatalogIdentification:
    trimmed = url.strip()
    if not trimmed.startswith(("http://", "https://")):
        raise ValueError("Provide a valid http(s) image or product link.")
    if _IMAGE_URL.search(urlparse(trimmed).path):
        image_bytes, mime = _fetch_image_bytes(trimmed)
        result = identify_catalog_from_bytes(
            client,
            image_bytes,
            mime,
            item_type_hint=item_type_hint,
            filename=trimmed.split("/")[-1] or "catalog.jpg",
        )
        result.imageUrl = trimmed
        result.source = "link"
        return result
    raise ValueError(
        "Link must point to a direct image (.jpg, .png, .webp). "
        "Download the product photo and attach it, or paste a direct image URL."
    )
