"""1b Item Normalizer — clean names and attach product photos (no extra LLM round-trip)."""

from __future__ import annotations

import json
import re

from image_suggestions import ImageSuggestion, suggest_images

_ABBREV: dict[str, str] = {
    "chkn": "chicken",
    "chk": "chicken",
    "brst": "breast",
    "lg": "large",
    "sm": "small",
    "med": "medium",
    "dz": "dozen",
    "bkfast": "breakfast",
    "bf": "breakfast",
    "wht": "white",
    "whl": "whole",
    "grn": "green",
    "org": "organic",
    "frz": "frozen",
    "frsh": "fresh",
    "pk": "pack",
    "ct": "count",
    "gal": "gallon",
    "lb": "lb",
    "lbs": "lb",
    "oz": "oz",
    "cap": "cappuccino",
    "lat": "latte",
    "mch": "mocha",
    "esp": "espresso",
    "veg": "veggie",
    "veggies": "veggies",
    "omlet": "omelet",
    "omlt": "omelet",
}


def _title_words(text: str) -> str:
    small = {"and", "or", "with", "the", "a", "an", "of", "in", "on"}
    words = text.split()
    out: list[str] = []
    for i, word in enumerate(words):
        lower = word.lower()
        if i > 0 and lower in small:
            out.append(lower)
        elif lower in ("bbq", "pos"):
            out.append(lower.upper())
        else:
            out.append(lower.capitalize())
    return " ".join(out)


def normalize_item_name(raw_name: str, item_type: str = "ingredient") -> str:
    """Fast heuristic normalizer — expand abbrevs, strip SKU noise, title case."""
    text = raw_name.strip()
    if not text:
        return raw_name

    # Drop trailing pack / price fragments
    text = re.sub(
        r"\s*[#@]\s*\w+\s*$",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"\s+\d+\s*(ct|count|dz|dozen|lb|lbs|oz|gal|gallon|pk|pack|case|cs)\b.*$",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip()

    tokens = re.sub(r"[^a-zA-Z0-9\s/&-]", " ", text).split()
    expanded: list[str] = []
    for token in tokens:
        lower = token.lower()
        if lower in _ABBREV:
            expanded.append(_ABBREV[lower])
        elif lower.isdigit():
            continue
        else:
            expanded.append(token)

    cleaned = " ".join(expanded).strip() or raw_name.strip()
    if item_type == "dish":
        cleaned = re.sub(r"\s+(combo|meal|platter)\s*$", "", cleaned, flags=re.IGNORECASE)
    return _title_words(re.sub(r"\s+", " ", cleaned))


def _sku_part(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _normalize_key(text: str) -> str:
    return re.sub(r"[^a-z0-9\s]", " ", text.lower()).strip()


def _strip_store_prefix(text: str, store_name: str) -> str:
    store = store_name.strip()
    if not store:
        return text
    text_norm = _normalize_key(text)
    store_norm = _normalize_key(store)
    if not store_norm or not text_norm.startswith(store_norm):
        return text
    remainder = text[len(store) :].lstrip(" -–:,")
    return remainder.strip() or text


def _heuristic_split_brand_product(raw_name: str, store_name: str = "") -> tuple[str, str]:
    """Best-effort split without LLM — store is never the product brand."""
    text = normalize_item_name(raw_name, "ingredient")
    text = _strip_store_prefix(text, store_name)

    possessive = re.match(r"^(.+?)'s\s+(.+)$", text, re.IGNORECASE)
    if possessive:
        return possessive.group(1).strip(), possessive.group(2).strip()

    # e.g. "Taylors of Harrogate English Breakfast Tea"
    of_match = re.match(
        r"^((?:[A-Za-z]+\s+)+of\s+[A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(.+)$",
        text,
    )
    if of_match:
        brand, product = of_match.group(1).strip(), of_match.group(2).strip()
        if len(product.split()) >= 2:
            return brand, product

    return "", text


def split_brand_and_product(
    client: object | None,
    raw_name: str,
    store_name: str = "",
) -> tuple[str, str]:
    """Return (product_brand, product_name). Store where purchased is excluded."""
    heuristic_brand, heuristic_product = _heuristic_split_brand_product(raw_name, store_name)
    if client is None:
        return heuristic_brand, heuristic_product

    source = (raw_name or heuristic_product).strip()
    if not source:
        return heuristic_brand, heuristic_product

    try:
        response = client.chat.completions.create(  # type: ignore[attr-defined]
            model="gpt-4o-mini",
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Split a grocery invoice line into product brand and item name. "
                        "The store/retailer is NOT the brand. "
                        'Return JSON: {"brand": "...", "product_name": "..."}. '
                        "Use empty brand if unknown."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Store (retailer, not brand): {store_name or 'unknown'}\n"
                        f"Line: {source}"
                    ),
                },
            ],
        )
        content = response.choices[0].message.content or "{}"
        data = json.loads(content)
        brand = str(data.get("brand", "")).strip()
        product = str(data.get("product_name", "")).strip()
        if product:
            product = normalize_item_name(product, "ingredient")
        if brand.lower() == store_name.strip().lower():
            brand = ""
        if brand or product:
            return brand or heuristic_brand, product or heuristic_product
    except Exception:
        pass

    return heuristic_brand, heuristic_product


def build_ingredient_sku(
    brand_name: str,
    name: str,
    unit: str,
    raw_name: str = "",
) -> str:
    """SKU from store brand + product name + pack volume in one unit."""
    brand = _sku_part(brand_name or "generic")
    product = _sku_part(normalize_item_name(name or raw_name, "ingredient"))
    source = raw_name or name
    vol = re.search(
        r"\b(\d+(?:\.\d+)?)\s*(oz|lb|lbs|g|kg|ml|l|gal|gallon|ct|count|pk|pack|dz|dozen)\b",
        source,
        flags=re.IGNORECASE,
    )
    if vol:
        qty = vol.group(1).rstrip("0").rstrip(".") if "." in vol.group(1) else vol.group(1)
        u = vol.group(2).lower()
        if u == "lbs":
            u = "lb"
        elif u == "gallon":
            u = "gal"
        elif u == "dozen":
            u = "dz"
        elif u == "count":
            u = "ct"
        elif u == "pack":
            u = "pk"
        unit_part = _sku_part(u)
    else:
        qty = "1"
        unit_part = _sku_part(unit or "each")
    return "-".join(p for p in (brand, product, qty, unit_part) if p)


def extract_sku(raw_name: str) -> str:
    """Pull trailing supplier SKU / item code from raw line text."""
    match = re.search(r"[#@]\s*(\w+)\s*$", raw_name.strip(), flags=re.IGNORECASE)
    return match.group(1) if match else ""


def normalize_with_images(
    client: object | None,
    *,
    key: str,
    raw_name: str,
    name: str,
    item_type: str,
    brand_name: str = "",
    store_name: str = "",
    quantity: float = 0,
    unit: str = "",
) -> dict:
    """Normalize one catalog line and fetch two product photos."""
    product_brand, product_name = split_brand_and_product(
        client,
        raw_name or name,
        store_name or brand_name,
    )
    normalized = normalize_item_name(product_name or raw_name or name, item_type)
    brand = product_brand.strip()
    images: list[ImageSuggestion] = suggest_images(
        client,
        normalized,
        item_type,
        brand_name=brand,
        quantity=quantity,
        unit=unit,
        use_gpt=client is not None,
    )
    return {
        "key": key,
        "normalized_name": normalized,
        "brand_name": brand,
        "sku": build_ingredient_sku(brand, normalized, unit, raw_name or name),
        "images": images,
    }
