"""Suggest product-packaging images via web image search (Google-style shopping results)."""

from __future__ import annotations

import json
import re

from pydantic import BaseModel

IMAGE_COUNT = 2

# Session cache — duplicate bill lines often share product names
_image_cache: dict[str, list[ImageSuggestion]] = {}

# Reject animated / meme / unrelated result patterns
_BAD_URL_FRAGMENTS = (
    ".gif",
    "giphy.com",
    "tenor.com",
    "imgflip.com",
    "meme",
    "reddit.com/r/",
    "police",
    "mugshot",
)

_BAD_LABEL_RE = re.compile(
    r"\b(police|meme|gif|chart|diagram|electron|wiring|vehicle|car|truck|"
    r"nsfw|porn|anime|cartoon|clipart|icon|logo only|mugshot|crime)\b",
    re.IGNORECASE,
)

# Prefer grocery / retail product photography
_INGREDIENT_SEARCH_SUFFIX = "grocery product packaging photo"


class ImageSuggestion(BaseModel):
    url: str
    label: str
    source: str = "web"
    score: float = 0.0


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9\s]", " ", text.lower()).strip()


def _core_product_name(name: str) -> str:
    cleaned = re.sub(
        r"\s*\d+\s*(ct|count|counts|dz|dozen|lb|lbs|oz|gallon|gal|pack|packs|case|cases)\b.*$",
        "",
        name,
        flags=re.IGNORECASE,
    ).strip()
    return cleaned or name.strip()


def _pack_descriptor(name: str) -> str:
    m = re.search(
        r"(\d+)\s*(ct|count|counts|dz|dozen|lb|lbs|oz|gallon|gal|pack|packs|case|cases)\b",
        name,
        re.IGNORECASE,
    )
    if not m:
        return ""
    num, unit = m.group(1), m.group(2).lower()
    unit_map = {
        "ct": "count",
        "count": "count",
        "dz": "dozen",
        "lb": "lb",
        "oz": "oz",
        "gallon": "gallon",
        "pack": "pack",
        "case": "case",
    }
    return f"{num} {unit_map.get(unit, unit)}"


def _short_brand(brand_name: str) -> str:
    brand = brand_name.strip()
    return brand.split()[0] if brand else ""


def _ingredient_queries(
    name: str,
    brand_name: str = "",
    quantity: float = 0,
    unit: str = "",
    extra_keywords: str = "",
) -> list[str]:
    """Build Google-style shopping queries: brand + product + pack size."""
    brand = brand_name.strip()
    pack = _pack_descriptor(name)
    core = _core_product_name(name)
    extra = extra_keywords.strip()

    queries: list[str] = []

    if extra:
        if brand:
            queries.append(f"{brand}, {name}, {extra}")
        queries.append(f"{extra} {name} product")
        queries.append(f"{core} {extra} grocery")

    # Primary — matches how users search Google Shopping (see screenshot)
    if brand:
        queries.append(f"{brand}, {name}")
        queries.append(f"{brand} {name} product")
        queries.append(f"{_short_brand(brand)} {core} {pack}".strip() if pack else f"{_short_brand(brand)} {name}")

    queries.append(f"{name} product box")
    if pack:
        queries.append(f"{core} {pack} grocery product")

    if quantity and unit:
        queries.append(f"{core} {quantity:g} {unit}")

    queries.append(f"{core} buy grocery")
    queries.append(f"{core} {_INGREDIENT_SEARCH_SUFFIX}")
    if brand:
        queries.append(f"{brand} {core} {_INGREDIENT_SEARCH_SUFFIX}")

    # Deduplicate preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for q in queries:
        key = q.lower().strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(q.strip())
    return unique


def _dish_queries(name: str, extra_keywords: str = "") -> list[str]:
    extra = extra_keywords.strip()
    queries: list[str] = []
    if extra:
        queries.extend(
            [
                f"{name}, {extra}, {DISH_STYLE}",
                f"{extra} {name} cafe menu photo",
            ]
        )
    queries.extend(
        [
            f"{name}, {DISH_STYLE}",
            f"{name} breakfast cafe menu photo",
            f"{name} coffee shop drink photo" if _is_drink(name) else f"{name} diner plated food photo",
        ]
    )
    seen: set[str] = set()
    unique: list[str] = []
    for q in queries:
        key = q.lower().strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(q.strip())
    return unique


def _is_drink(name: str) -> bool:
    lower = name.lower()
    return any(
        k in lower
        for k in ("coffee", "latte", "cappuccino", "mocha", "frappe", "tea", "juice", "espresso")
    )


def _is_valid_product_image_url(url: str) -> bool:
    lower = url.lower().split("?")[0]
    if not lower.startswith("http"):
        return False
    if any(bad in lower for bad in _BAD_URL_FRAGMENTS):
        return False
    if lower.endswith((".svg", ".ico", ".bmp")):
        return False
    return True


def _is_relevant_label(label: str, name: str, brand_name: str) -> bool:
    if _BAD_LABEL_RE.search(label):
        return False
    name_tokens = [t for t in _normalize(name).split() if len(t) > 2]
    if not name_tokens:
        return True
    label_norm = _normalize(label)
    hits = sum(1 for t in name_tokens if t in label_norm)
    if hits >= 1:
        return True
    if brand_name.strip():
        brand_tokens = [t for t in _normalize(brand_name).split() if len(t) > 2]
        if any(t in label_norm for t in brand_tokens):
            return True
    return hits >= max(1, len(name_tokens) // 3)


# Consistent dish photo style appended to searches
DISH_STYLE = "cafe menu food photograph white background"


def _web_image_search(query: str, limit: int = IMAGE_COUNT) -> list[ImageSuggestion]:
    """Search the web for product photos (packaging, retail listings)."""
    try:
        from ddgs import DDGS

        raw = DDGS().images(query, max_results=max(limit + 8, 10))
        results: list[ImageSuggestion] = []
        for item in raw:
            url = item.get("image") or item.get("thumbnail")
            if not url or not str(url).startswith("http"):
                continue
            url_str = str(url)
            if not _is_valid_product_image_url(url_str):
                continue
            title = str(item.get("title") or query)[:120]
            if not _is_relevant_label(title, query, ""):
                continue
            results.append(ImageSuggestion(url=url_str, label=title, source="web"))
            if len(results) >= limit:
                break
        return results
    except Exception:
        return []


def _label_with_context(
    suggestion: ImageSuggestion,
    brand_name: str,
    pack: str,
    quantity: float,
    unit: str,
) -> ImageSuggestion:
    brand = _short_brand(brand_name)
    parts = [suggestion.label]
    if brand:
        parts.append(f"({brand})")
    if pack:
        parts.append(f"[{pack}]")
    elif quantity and unit:
        parts.append(f"[{quantity:g} {unit}]")
    return ImageSuggestion(url=suggestion.url, label=" ".join(parts), source=suggestion.source)


def _heuristic_score(name: str, brand_name: str, label: str) -> float:
    name_tokens = set(_normalize(name).split())
    brand_tokens = set(_normalize(brand_name).split()) if brand_name.strip() else set()
    label_tokens = set(_normalize(label).split())
    overlap = len(name_tokens & label_tokens)
    brand_overlap = len(brand_tokens & label_tokens)
    score = 0.15 + overlap * 0.12 + brand_overlap * 0.18
    return round(min(1.0, score), 3)


def rate_images(
    client: object | None,
    name: str,
    item_type: str,
    brand_name: str,
    images: list[ImageSuggestion],
) -> list[ImageSuggestion]:
    """Score and sort images — best match first (agent-rated when OpenAI available)."""
    if not images:
        return []

    rated: list[ImageSuggestion] = []

    if client:
        try:
            payload = [{"i": i, "label": img.label} for i, img in enumerate(images)]
            resp = client.chat.completions.create(  # type: ignore[union-attr]
                model="gpt-4o-mini",
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You rate web image search labels for a restaurant inventory app. "
                            "Prefer grocery product packaging photos. Score 0.0 for GIFs, memes, "
                            "police cars, charts, diagrams, or unrelated products. "
                            "Return only valid JSON."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Product type: {item_type}\n"
                            f"Product name: {name}\n"
                            f"Brand: {brand_name or 'unknown'}\n\n"
                            f"Image labels from search:\n{json.dumps(payload)}\n\n"
                            "Score each label 0.0–1.0 for how likely it shows the correct "
                            "product packaging photo (not liquor, unrelated brands, etc.).\n"
                            'Return: {"ratings": [{"i": 0, "score": 0.92}, ...]}'
                        ),
                    },
                ],
            )
            content = resp.choices[0].message.content or "{}"
            data = json.loads(content)
            scores = {
                int(r["i"]): float(r["score"])
                for r in data.get("ratings", [])
                if "i" in r and "score" in r
            }
            for i, img in enumerate(images):
                score = scores.get(i, _heuristic_score(name, brand_name, img.label))
                rated.append(
                    ImageSuggestion(
                        url=img.url,
                        label=img.label,
                        source=img.source,
                        score=round(min(1.0, max(0.0, score)), 3),
                    )
                )
        except Exception:
            rated = []

    if not rated:
        rated = [
            ImageSuggestion(
                url=img.url,
                label=img.label,
                source=img.source,
                score=_heuristic_score(name, brand_name, img.label),
            )
            for img in images
        ]

    rated.sort(key=lambda x: x.score, reverse=True)
    return rated


def suggest_images(
    client: object | None,
    name: str,
    item_type: str,
    *,
    brand_name: str = "",
    quantity: float = 0,
    unit: str = "",
    extra_keywords: str = "",
    use_gpt: bool = False,
    refresh: bool = False,
    exclude_urls: list[str] | None = None,
) -> list[ImageSuggestion]:
    """Return IMAGE_COUNT product-packaging style images from web search."""
    cache_key = f"{item_type}:{name.strip().lower()}:{brand_name.strip().lower()}"
    if not refresh and cache_key in _image_cache:
        return _image_cache[cache_key]

    pack = _pack_descriptor(name)
    excluded = {u.strip().lower() for u in (exclude_urls or []) if u}

    if item_type == "ingredient":
        queries = _ingredient_queries(name, brand_name, quantity, unit, extra_keywords)
    else:
        queries = _dish_queries(name, extra_keywords)

    seen_urls: set[str] = set()
    pool: list[ImageSuggestion] = []

    for query in queries[:6]:
        for item in _web_image_search(query, limit=IMAGE_COUNT + 6):
            if item.url.lower() in seen_urls or item.url.lower() in excluded:
                continue
            if not _is_relevant_label(item.label, name, brand_name):
                continue
            seen_urls.add(item.url.lower())
            pool.append(_label_with_context(item, brand_name, pack, quantity, unit))
            if len(pool) >= IMAGE_COUNT + 4:
                break
        if len(pool) >= IMAGE_COUNT + 4:
            break

    pool = pool[: IMAGE_COUNT + 4]

    if (use_gpt or client) and client and pool:
        rated = rate_images(client, name, item_type, brand_name, pool)
        result = rated[:IMAGE_COUNT]
        _image_cache[cache_key] = result
        return result

    scored = [
        ImageSuggestion(
            url=img.url,
            label=img.label,
            source=img.source,
            score=_heuristic_score(name, brand_name, img.label),
        )
        for img in pool
    ]
    scored.sort(key=lambda x: x.score, reverse=True)
    result = scored[:IMAGE_COUNT]
    _image_cache[cache_key] = result
    return result
