"""Suggest product-packaging images via web image search (Google-style shopping results)."""

from __future__ import annotations

import json
import logging
import re

from pydantic import BaseModel

logger = logging.getLogger(__name__)

IMAGE_COUNT = 2
MAX_IMAGE_SUGGESTIONS = 10

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

_DISH_BAD_LABEL_RE = re.compile(
    r"\b(packaging|product box|grocery product|bottle label|nutrition facts|"
    r"logo|branded|carton|package only|retail listing|shopping bag|"
    r"menu board|text overlay|watermark)\b",
    re.IGNORECASE,
)

_PACKAGING_LABEL_RE = re.compile(
    r"\b(bottle|bottles|carton|cartons|jug|gallon|can of|"
    r"grocery|retail|amazon|walmart|costco|target\.com|"
    r"nutrition facts|ingredient list|product shot|product photo|"
    r"packaged|coffee beans|ground coffee|whole bean|"
    r"bag of|bagged|12oz|16 oz|ounce bag|keurig|k cup|kcups|"
    r"wholesale|sysco)\b",
    re.IGNORECASE,
)

_SERVED_DISH_LABEL_RE = re.compile(
    r"\b(plated|on plate|served|in a glass|in glass|cup of|in cup|in a cup|"
    r"sandwich|burger|croissant|bowl|stack|melt|latte|frappe|iced coffee|"
    r"whipped cream|cafe|restaurant|menu photo|breakfast plate|diner|"
    r"food photo|prepared|homemade|single serving)\b",
    re.IGNORECASE,
)

# Grocery brand phrases in labels almost always mean packaging, not a served dish.
_PACKAGING_BRAND_PHRASES = (
    "lavazza",
    "oatly",
    "planet oat",
    "kirkland",
    "starbucks",
    "jimmy dean",
    "sysco",
    "trader joe",
    "whole foods 365",
    "north country",
    "tyson",
    "tillamook",
    "kraft",
    "boar s head",
)

_TEXT_OVERLAY_LABEL_RE = re.compile(
    r"\b(recipe card|recipe title|typography|pinterest|blog post|headline|"
    r"menu graphic|promotional|caption|title card|food poster|advertisement|"
    r"instagram post|social media|named dish|branded menu|labeled photo|"
    r"text on image|words on photo|title overlay)\b",
    re.IGNORECASE,
)

# Full dishes / sandwiches — wrong for add-on modifier photos.
_ADDON_DISH_LABEL_RE = re.compile(
    r"\b(sandwich|burger|croissant|bagel|bread|sub sandwich|melt|stack|wrap|"
    r"grilled cheese|open faced|open-face|breakfast plate|entree|plated meal|"
    r"combo meal|full dish|toastie|panini|hoagie|baguette)\b",
    re.IGNORECASE,
)

_ADDON_COMPONENT_LABEL_RE = re.compile(
    r"\b(slice|strip|strips|links?|patty|shot|dollop|scoop|portion|single|"
    r"piece|slices|crispy|fried egg|cheddar|swiss|vegetables|veggie|spinach|"
    r"tomato|pepper|on plate|close up|ingredient|component|topping|modifier)\b",
    re.IGNORECASE,
)

_BAD_LABEL_RE = re.compile(
    r"\b(police|meme|gif|chart|diagram|electron|wiring|vehicle|car|truck|"
    r"nsfw|porn|anime|cartoon|clipart|icon|logo only|mugshot|crime|"
    r"ripeness|color is|stock photo|chewing gum)\b",
    re.IGNORECASE,
)

# Prep words stripped when matching labels — "ripe mango" must match "mango", not "ripe"
_PREP_TOKENS = frozenset(
    {
        "ripe",
        "fresh",
        "frozen",
        "diced",
        "sliced",
        "chopped",
        "crushed",
        "whole",
        "organic",
        "raw",
        "unsweetened",
        "sweetened",
        "plain",
        "large",
        "small",
        "medium",
    }
)


def _substantive_tokens(name: str) -> list[str]:
    tokens = [t for t in _normalize(name).split() if len(t) > 2 and t not in _PREP_TOKENS]
    if tokens:
        return tokens
    return [t for t in _normalize(name).split() if len(t) > 2]


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
    lower_core = core.lower()
    if lower_core in ("ice", "ice cubes", "ice cube", "bagged ice cubes grocery"):
        queries.extend(
            [
                f"bagged ice cubes {extra} grocery product".strip(),
                "bagged ice product packaging",
                f"ice bag {extra} grocery".strip() if extra else "ice bag grocery product",
            ]
        )

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


def _is_packaging_label(label: str) -> bool:
    if _DISH_BAD_LABEL_RE.search(label) or _PACKAGING_LABEL_RE.search(label):
        return True
    norm = _normalize(label)
    return any(phrase in norm for phrase in _PACKAGING_BRAND_PHRASES)


def _is_text_overlay_label(label: str) -> bool:
    if _TEXT_OVERLAY_LABEL_RE.search(label):
        return True
    if re.search(r"\b(easy|best|ultimate|homemade)\b.+\b(recipe|ideas)\b", label, re.IGNORECASE):
        return True
    return False


def _is_bad_dish_label(label: str) -> bool:
    return _is_packaging_label(label) or _is_text_overlay_label(label)


def _is_bad_addon_label(label: str) -> bool:
    return (
        _is_packaging_label(label)
        or _is_text_overlay_label(label)
        or bool(_ADDON_DISH_LABEL_RE.search(label))
    )


def _addon_component_hint(name: str, classification: str) -> str:
    lower = name.lower()
    cls = classification.lower().strip()
    if cls == "cheese" or "cheese" in lower:
        return "single cheese slice close up no sandwich"
    if "bacon" in lower:
        return "crispy bacon strips on plate no packaging"
    if "sausage" in lower:
        return "cooked breakfast sausage links on plate"
    if "egg" in lower:
        return "single fried egg on plate"
    if cls == "veggie" or "veggie" in lower:
        return "diced vegetables spinach tomato bell pepper no bread no sandwich"
    if "espresso" in lower or "shot" in lower:
        return "single espresso shot in small cup no bottle"
    if "whipped" in lower or "cream" in lower:
        return "dollop whipped cream close up no bottle"
    return "single food component ingredient only no sandwich no bread"


def _addon_queries(
    name: str,
    extra_keywords: str = "",
    classification: str = "",
) -> list[str]:
    hint = _addon_component_hint(name, classification)
    extra = extra_keywords.strip()
    component_hint = "single ingredient modifier no sandwich no bread no packaging"

    queries: list[str] = []
    if extra:
        queries.append(f"{hint} {extra} {ADDON_STYLE}")
    queries.extend(
        [
            f"{name} {hint} {ADDON_STYLE}",
            f"{hint} {component_hint} food photo",
            f"{name} ingredient only {ADDON_STYLE}",
            f"{hint} white background food photography",
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


def _is_relevant_addon_label(label: str, name: str, classification: str = "") -> bool:
    if _BAD_LABEL_RE.search(label) or _is_bad_addon_label(label):
        return False
    label_norm = _normalize(label)
    name_tokens = [t for t in _normalize(name).split() if len(t) > 2]
    component = bool(_ADDON_COMPONENT_LABEL_RE.search(label))
    name_hits = sum(1 for t in name_tokens if t in label_norm) if name_tokens else 0

    if component and name_hits >= 1:
        return True
    if component and classification:
        cls_tokens = [t for t in _normalize(classification).split() if len(t) > 2]
        if cls_tokens and any(t in label_norm for t in cls_tokens):
            return True
    if component and re.search(
        r"\b(bacon|cheese|egg|sausage|espresso|vegetable|spinach|tomato|pepper|cream)\b",
        label_norm,
    ):
        return True
    return False


def _addon_heuristic_score(name: str, classification: str, label: str) -> float:
    if _is_bad_addon_label(label):
        return 0.0
    label_norm = _normalize(label)
    name_tokens = {t for t in _normalize(name).split() if len(t) > 2}
    label_tokens = set(label_norm.split())
    score = 0.1 + len(name_tokens & label_tokens) * 0.15
    if _ADDON_COMPONENT_LABEL_RE.search(label):
        score += 0.35
    if _ADDON_DISH_LABEL_RE.search(label):
        score -= 0.5
    if classification and _normalize(classification) in label_norm:
        score += 0.1
    return round(min(1.0, max(0.0, score)), 3)


def _dish_queries(
    name: str,
    extra_keywords: str = "",
    ingredient_names: list[str] | None = None,
) -> list[str]:
    del ingredient_names  # pantry names bias search toward grocery packaging
    extra = extra_keywords.strip()
    served_hint = "plated served food photo no packaging no bottle no carton"

    queries: list[str] = []
    if extra:
        queries.append(f"{name} {extra} {DISH_STYLE}")
    if _is_drink(name):
        queries.extend(
            [
                f"{name} iced drink in glass cafe {served_hint}",
                f"{name} latte in ceramic cup restaurant photo",
                f"{name} coffee shop drink served in cup {DISH_STYLE}",
                f"{name} cafe beverage single serving no bottle",
            ]
        )
    else:
        queries.extend(
            [
                f"{name} sandwich on plate cafe {served_hint}",
                f"{name} breakfast plate restaurant food photo",
                f"{name} plated single serving {DISH_STYLE}",
                f"{name} diner menu photo no packaging",
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
    name_tokens = _substantive_tokens(name)
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


def _is_relevant_dish_label(label: str, name: str, ingredient_names: list[str]) -> bool:
    del ingredient_names  # ingredient tokens alone must not approve packaging shots
    if _BAD_LABEL_RE.search(label) or _is_bad_dish_label(label):
        return False
    label_norm = _normalize(label)
    name_tokens = [t for t in _normalize(name).split() if len(t) > 2]
    name_hits = sum(1 for t in name_tokens if t in label_norm) if name_tokens else 0
    name_match = name_hits >= max(1, len(name_tokens) // 2) if name_tokens else False
    served = bool(_SERVED_DISH_LABEL_RE.search(label))

    if name_match and served:
        return True
    if name_match and _is_drink(name):
        if re.search(r"\b(cup|glass|mug|latte|iced|drink|frappe|mocha)\b", label_norm):
            return True
    if name_match and not _is_drink(name):
        if re.search(r"\b(sandwich|plate|croissant|melt|burger|stack|egg|bacon)\b", label_norm):
            return True
    if served and name_hits >= 1:
        return True
    if served and _is_drink(name):
        drink_tokens = [t for t in name_tokens if t in ("coffee", "mocha", "latte", "frappe", "juice", "tea")]
        if drink_tokens and any(t in label_norm for t in drink_tokens):
            return True
    return False


def _dish_heuristic_score(name: str, ingredient_names: list[str], label: str) -> float:
    if _is_bad_dish_label(label):
        return 0.0
    name_tokens = {t for t in _normalize(name).split() if len(t) > 2}
    label_norm = _normalize(label)
    label_tokens = set(label_norm.split())
    overlap = len(name_tokens & label_tokens)
    score = 0.1 + overlap * 0.15
    if _SERVED_DISH_LABEL_RE.search(label):
        score += 0.35
    if _is_drink(name) and re.search(r"\b(cup|glass|mug|iced|latte)\b", label_norm):
        score += 0.15
    ing_tokens: set[str] = set()
    for ing in ingredient_names:
        ing_tokens.update(t for t in _normalize(ing).split() if len(t) > 2)
    ing_overlap = len(ing_tokens & label_tokens)
    if ing_overlap and not _SERVED_DISH_LABEL_RE.search(label):
        score -= 0.25
    return round(min(1.0, max(0.0, score)), 3)


# Consistent dish photo style — one serving, no packaging, brands, or readable text
DISH_STYLE = (
    "single plated dish only one serving no packaging no brand logos "
    "no text on image no recipe title no words overlay cafe food photograph clean background"
)

# Add-on / modifier — one ingredient component only (not a full sandwich or dish)
ADDON_STYLE = (
    "single food component only one ingredient modifier no sandwich no bread "
    "no packaging no brand logos no text on image white background food photo"
)


def _web_image_search(
    query: str,
    limit: int = IMAGE_COUNT,
    *,
    item_type: str = "ingredient",
    menu_name: str = "",
    classification: str = "",
    strict: bool = True,
) -> list[ImageSuggestion]:
    """Search the web for product photos (packaging, retail listings)."""
    try:
        from ddgs import DDGS
    except ImportError:
        logger.warning("ddgs not installed — run: pip install ddgs")
        return []

    try:
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
            if item_type == "dish":
                if _is_bad_dish_label(title):
                    continue
                if strict and not _is_relevant_dish_label(title, menu_name, []):
                    continue
            elif item_type == "addon":
                if _is_bad_addon_label(title):
                    continue
                if strict and not _is_relevant_addon_label(title, menu_name, classification):
                    continue
            elif strict and not _is_relevant_label(title, query, ""):
                continue
            results.append(ImageSuggestion(url=url_str, label=title, source="web"))
            if len(results) >= limit:
                break
        return results
    except Exception:
        logger.exception("Web image search failed for query=%r", query[:80])
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
    name_tokens = set(_substantive_tokens(name))
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
    *,
    ingredient_names: list[str] | None = None,
    classification: str = "",
) -> list[ImageSuggestion]:
    """Score and sort images — best match first (agent-rated when OpenAI available)."""
    if not images:
        return []

    is_dish = item_type == "dish"
    is_addon = item_type == "addon"
    ingredients = [n.strip() for n in (ingredient_names or []) if n and n.strip()]
    rated: list[ImageSuggestion] = []

    if client:
        try:
            payload = [{"i": i, "label": img.label} for i, img in enumerate(images)]
            if is_addon:
                user_content = (
                    f"Menu add-on/modifier: {name}\n"
                    f"Category: {classification or 'modifier'}\n\n"
                    f"Image labels from search:\n{json.dumps(payload)}\n\n"
                    "Score each label 0.0–1.0 for how likely it shows ONLY the single "
                    "ingredient component for this add-on — e.g. one cheese slice, crispy "
                    "bacon strips, one fried egg, diced veggies without bread, one espresso "
                    "shot in a small cup, dollop of whipped cream.\n"
                    "Score 0.0 for: full sandwiches, bread, complete dishes, product "
                    "packaging, grocery brands, logos, readable text on the photo, or "
                    "unrelated items.\n"
                    'Return: {"ratings": [{"i": 0, "score": 0.92}, ...]}'
                )
                system_content = (
                    "You rate web image search labels for restaurant menu add-ons. "
                    "Add-ons must show a single modifier ingredient only — never a full "
                    "sandwich, burger, or plated meal. No packaging, brands, or readable "
                    "words on the photo. Return only valid JSON."
                )
            elif is_dish:
                user_content = (
                    f"Menu item type: dish\n"
                    f"Dish name: {name}\n"
                    f"Key ingredients: {', '.join(ingredients) if ingredients else 'unknown'}\n\n"
                    f"Image labels from search:\n{json.dumps(payload)}\n\n"
                    "Score each label 0.0–1.0 for how likely it shows exactly ONE prepared "
                    "dish serving — plated food or cafe drink photo only.\n"
                    "Score 0.0 for: product packaging, grocery/retail brands, logos, "
                    "readable text or watermarks on the image, recipe titles overlaid on "
                    "the photo, promotional graphics, multiple dishes, or unrelated items.\n"
                    'Return: {"ratings": [{"i": 0, "score": 0.92}, ...]}'
                )
                system_content = (
                    "You rate web image search labels for a restaurant menu app. "
                    "Prefer a single appetizing plated dish or drink with no brand logos "
                    "and no readable words or recipe titles on the photo. "
                    "Score 0.0 for packaging photos, grocery brands, GIFs, memes, "
                    "menu boards with text, or unrelated products. "
                    "Return only valid JSON."
                )
            else:
                user_content = (
                    f"Product type: {item_type}\n"
                    f"Product name: {name}\n"
                    f"Brand: {brand_name or 'unknown'}\n\n"
                    f"Image labels from search:\n{json.dumps(payload)}\n\n"
                    "Score each label 0.0–1.0 for how likely it shows the correct "
                    "grocery product packaging photo for this pantry item. "
                    "When a brand is provided, prefer photos of that brand's packaging.\n"
                    'Return: {"ratings": [{"i": 0, "score": 0.92}, ...]}'
                )
                system_content = (
                    "You rate web image search labels for a restaurant inventory app. "
                    "Prefer grocery product packaging photos; brand-specific packaging is "
                    "allowed and encouraged when brand is known. Score 0.0 for GIFs, memes, "
                    "police cars, charts, diagrams, or unrelated products. "
                    "Return only valid JSON."
                )
            resp = client.chat.completions.create(  # type: ignore[union-attr]
                model="gpt-4o-mini",
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system_content},
                    {"role": "user", "content": user_content},
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
                if is_addon:
                    fallback = _addon_heuristic_score(name, classification, img.label)
                elif is_dish:
                    fallback = _dish_heuristic_score(name, ingredients, img.label)
                else:
                    fallback = _heuristic_score(name, brand_name, img.label)
                score = scores.get(i, fallback)
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
                score=(
                    _addon_heuristic_score(name, classification, img.label)
                    if is_addon
                    else _dish_heuristic_score(name, ingredients, img.label)
                    if is_dish
                    else _heuristic_score(name, brand_name, img.label)
                ),
            )
            for img in images
        ]

    rated.sort(key=lambda x: x.score, reverse=True)
    return rated


def _collect_relaxed_web_pool(
    *,
    queries: list[str],
    item_type: str,
    menu_name: str,
    classification: str,
    pool_target: int,
    excluded: set[str],
    is_dish: bool,
    is_addon: bool,
    name: str,
    brand_name: str,
    ingredients: list[str],
) -> list[ImageSuggestion]:
    """Looser web pool when strict relevance filters return nothing."""
    seen_urls: set[str] = set()
    pool: list[ImageSuggestion] = []
    search_type = item_type if (is_dish or is_addon) else "ingredient"

    for query in queries[:10]:
        for item in _web_image_search(
            query,
            limit=max(pool_target, IMAGE_COUNT + 8),
            item_type=search_type,
            menu_name=menu_name if (is_dish or is_addon) else "",
            classification=classification if is_addon else "",
            strict=False,
        ):
            if item.url.lower() in seen_urls or item.url.lower() in excluded:
                continue
            if is_dish:
                pool.append(
                    ImageSuggestion(
                        url=item.url,
                        label=item.label,
                        source=item.source,
                        score=_dish_heuristic_score(name, ingredients, item.label),
                    )
                )
            elif is_addon:
                pool.append(
                    ImageSuggestion(
                        url=item.url,
                        label=item.label,
                        source=item.source,
                        score=_addon_heuristic_score(name, classification, item.label),
                    )
                )
            else:
                pool.append(item)
            seen_urls.add(item.url.lower())
            if len(pool) >= pool_target:
                break
        if len(pool) >= pool_target:
            break

    pool.sort(key=lambda x: x.score, reverse=True)
    return pool[:pool_target]


def _build_ai_image_prompt(
    name: str,
    item_type: str,
    *,
    brand_name: str = "",
    extra_keywords: str = "",
    ingredient_names: list[str] | None = None,
    classification: str = "",
    variant: int = 0,
) -> str:
    """Prompt for OpenAI image generation — follows catalog photo guidelines."""
    ingredients = ", ".join(ingredient_names or [])
    brief = extra_keywords.strip()
    angles = (
        "45-degree angle, shallow depth of field",
        "overhead flat lay on a wooden table",
        "close-up hero shot with soft natural light",
        "side angle on a ceramic plate",
    )
    angle = angles[variant % len(angles)]

    if item_type == "dish":
        parts = [
            f'Professional restaurant menu food photograph of "{name}".',
            brief,
            f"Key ingredients visible: {ingredients}." if ingredients else "",
            DISH_STYLE,
            f"{angle}.",
            "Photorealistic, appetizing, no text, no logos, no watermarks, no recipe title overlay.",
        ]
        return " ".join(p for p in parts if p)

    if item_type == "addon":
        parts = [
            f'Professional menu add-on component photo of "{name}" ({classification or "modifier"}).',
            brief,
            ADDON_STYLE,
            f"{angle}.",
            "Single ingredient component only — not a full sandwich or entree. No text or logos.",
        ]
        return " ".join(p for p in parts if p)

    brand = brand_name.strip()
    parts = [
        f"Professional grocery product packaging photo of {brand + ' ' if brand else ''}{name}.",
        brief,
        "Retail product on clean white background. Sharp focus on packaging label.",
        f"{angle}.",
    ]
    return " ".join(p for p in parts if p)


def _generate_ai_images(
    client: object,
    *,
    name: str,
    item_type: str,
    brand_name: str = "",
    extra_keywords: str = "",
    ingredient_names: list[str] | None = None,
    classification: str = "",
    count: int = IMAGE_COUNT,
) -> list[ImageSuggestion]:
    """Generate catalog photos with OpenAI when web search finds nothing."""
    if not client or count < 1:
        return []

    want = max(1, min(count, MAX_IMAGE_SUGGESTIONS))
    results: list[ImageSuggestion] = []

    for i in range(want):
        prompt = _build_ai_image_prompt(
            name,
            item_type,
            brand_name=brand_name,
            extra_keywords=extra_keywords,
            ingredient_names=ingredient_names,
            classification=classification,
            variant=i,
        )
        try:
            response = client.images.generate(
                model="dall-e-3",
                prompt=prompt[:4000],
                size="1024x1024",
                quality="standard",
                n=1,
            )
            url = response.data[0].url if response.data else ""
            if url:
                results.append(
                    ImageSuggestion(
                        url=str(url),
                        label=f"{name} generated menu photo",
                        source="openai",
                        score=0.99,
                    )
                )
        except Exception:
            logger.exception("OpenAI image generation failed for %r", name)

    return results


def suggest_images(
    client: object | None,
    name: str,
    item_type: str,
    *,
    brand_name: str = "",
    quantity: float = 0,
    unit: str = "",
    extra_keywords: str = "",
    ingredient_names: list[str] | None = None,
    use_gpt: bool = False,
    refresh: bool = False,
    exclude_urls: list[str] | None = None,
    count: int = IMAGE_COUNT,
    classification: str = "",
) -> list[ImageSuggestion]:
    """Return up to `count` product-packaging style images from web search."""
    want = max(1, min(count, MAX_IMAGE_SUGGESTIONS))
    pool_target = want + 6
    is_dish = item_type == "dish"
    is_addon = item_type == "addon"
    is_menu_photo = is_dish or is_addon
    ingredients = [n.strip() for n in (ingredient_names or []) if n and n.strip()]
    if is_menu_photo:
        cache_key = (
            f"{item_type}:{name.strip().lower()}:"
            f"{classification.strip().lower()}:"
            f"{extra_keywords.strip().lower()}:"
            f"{','.join(sorted(i.lower() for i in ingredients))}"
        )
    else:
        cache_key = f"{item_type}:{name.strip().lower()}:{brand_name.strip().lower()}"
    if not refresh and cache_key in _image_cache:
        return _image_cache[cache_key]

    pack = _pack_descriptor(name)
    excluded = {u.strip().lower() for u in (exclude_urls or []) if u}

    if item_type == "ingredient":
        queries = _ingredient_queries(name, brand_name, quantity, unit, extra_keywords)
    elif item_type == "addon":
        queries = _addon_queries(name, extra_keywords, classification)
    else:
        queries = _dish_queries(name, extra_keywords, ingredients)

    seen_urls: set[str] = set()
    pool: list[ImageSuggestion] = []

    for query in queries[:10]:
        for item in _web_image_search(
            query,
            limit=max(pool_target, IMAGE_COUNT + 8),
            item_type=item_type if is_menu_photo else "ingredient",
            menu_name=name if is_menu_photo else "",
            classification=classification if is_addon else "",
        ):
            if item.url.lower() in seen_urls or item.url.lower() in excluded:
                continue
            if is_dish:
                if _is_bad_dish_label(item.label):
                    continue
                if not _is_relevant_dish_label(item.label, name, ingredients):
                    continue
                pool.append(item)
            elif is_addon:
                if _is_bad_addon_label(item.label):
                    continue
                if not _is_relevant_addon_label(item.label, name, classification):
                    continue
                pool.append(item)
            else:
                if not _is_relevant_label(item.label, name, brand_name):
                    continue
                pool.append(_label_with_context(item, brand_name, pack, quantity, unit))
            seen_urls.add(item.url.lower())
            if len(pool) >= pool_target:
                break
        if len(pool) >= pool_target:
            break

    pool = pool[:pool_target]
    result: list[ImageSuggestion] = []

    if (use_gpt or client) and client and pool:
        rated = rate_images(
            client,
            name,
            item_type,
            brand_name,
            pool,
            ingredient_names=ingredients,
            classification=classification,
        )
        if is_dish:
            rated = [r for r in rated if not _is_bad_dish_label(r.label)]
        elif is_addon:
            rated = [r for r in rated if not _is_bad_addon_label(r.label)]
        result = rated[:want]
    elif is_dish:
        scored = [
            ImageSuggestion(
                url=img.url,
                label=img.label,
                source=img.source,
                score=_dish_heuristic_score(name, ingredients, img.label),
            )
            for img in pool
            if not _is_bad_dish_label(img.label)
        ]
        scored.sort(key=lambda x: x.score, reverse=True)
        result = scored[:want]
    elif is_addon:
        scored = [
            ImageSuggestion(
                url=img.url,
                label=img.label,
                source=img.source,
                score=_addon_heuristic_score(name, classification, img.label),
            )
            for img in pool
            if not _is_bad_addon_label(img.label)
        ]
        scored.sort(key=lambda x: x.score, reverse=True)
        result = scored[:want]
    else:
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
        result = scored[:want]

    if not result:
        relaxed = _collect_relaxed_web_pool(
            queries=queries,
            item_type=item_type,
            menu_name=name if is_menu_photo else "",
            classification=classification if is_addon else "",
            pool_target=pool_target,
            excluded=excluded,
            is_dish=is_dish,
            is_addon=is_addon,
            name=name,
            brand_name=brand_name,
            ingredients=ingredients,
        )
        if relaxed:
            result = relaxed[:want]

    if not result and client:
        ai_count = min(want, max(IMAGE_COUNT, 2))
        result = _generate_ai_images(
            client,
            name=name,
            item_type=item_type,
            brand_name=brand_name,
            extra_keywords=extra_keywords,
            ingredient_names=ingredients,
            classification=classification,
            count=ai_count,
        )

    if result:
        _image_cache[cache_key] = result
    return result
