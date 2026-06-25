"""1a-customer Bill Parser — POS sales receipts, dishes and add-ons."""

from __future__ import annotations

import re

from openai import OpenAI

from .bill_parser_common import (
    ParsedBill,
    ParsedLineItem,
    QuickScanResult,
    QuickLineItem,
    load_bill_image,
    merge_quick_into_detail,
    vision_json,
)

ADDON_PATTERN = re.compile(
    r"\b(add[\s-]?on|extra|side of|\+|w/\s|with\s+extra)\b",
    re.IGNORECASE,
)


def _classify_menu_kind(raw_name: str) -> str:
    """Return 'addon' or 'dish' based on line text."""
    if ADDON_PATTERN.search(raw_name):
        return "addon"
    lower = raw_name.lower().strip()
    if lower.startswith("+") or lower.startswith("add ") or lower.startswith("extra "):
        return "addon"
    return "dish"


def _infer_menu_classification(raw_name: str, kind: str) -> str:
    lower = raw_name.lower()
    if kind == "addon":
        if any(w in lower for w in ("cheese", "cheddar", "swiss", "american")):
            return "cheese"
        if any(w in lower for w in ("bacon", "sausage", "egg", "ham", "protein")):
            return "protein"
        if any(w in lower for w in ("spinach", "tomato", "pepper", "veggie", "avocado")):
            return "veggie"
        if any(w in lower for w in ("whipped", "cream", "syrup", "shot", "foam")):
            return "coffee"
        return "addon"
    if any(w in lower for w in ("coffee", "espresso", "frappe", "mocha", "cappuccino", "latte")):
        return "coffee"
    if any(w in lower for w in ("tea", "chai")):
        return "tea"
    if "juice" in lower:
        return "juice"
    if any(w in lower for w in ("byo", "build your own", "build-your-own")):
        return "byo-sandwich"
    if any(w in lower for w in ("bagel", "croissant", "sandwich", "sourdough", "stack", "melt")):
        return "sandwich"
    return "other"


def _line_classification(row: dict, raw_name: str, kind: str) -> str:
    explicit = str(row.get("classification", "")).strip().lower()
    if explicit:
        return explicit
    return _infer_menu_classification(raw_name, kind)


QUICK_PROMPT = """POS SALES RECEIPT for a breakfast café (Square, Toast, Clover style).

Return JSON only:
{
  "vendor": "POS vendor if visible else empty",
  "lines": [
    { "rawName": "menu item sold as printed", "itemKind": "dish|addon", "classification": "sandwich|byo-sandwich|coffee|tea|juice|cheese|protein|veggie|other", "confidence": 0.9 }
  ]
}

Rules:
- One entry per menu item / drink / add-on sold.
- itemKind: "addon" for extras, sides, modifiers (+ cheese, extra bacon); "dish" for main items.
- classification: menu group — sandwich/byo-sandwich/coffee/tea/juice for dishes; cheese/protein/veggie/coffee for add-ons.
- Skip subtotal, tax, tip, total-only rows.
- confidence 0.0-1.0."""

DETAIL_PROMPT = """POS SALES RECEIPT for a breakfast café.

Return JSON only:
{
  "vendor": "POS name if visible",
  "billDate": "YYYY-MM-DD or empty",
  "invoiceNumber": "receipt id or empty",
  "lines": [
    {
      "rawName": "item name including size if shown",
      "itemKind": "dish|addon",
      "classification": "sandwich|byo-sandwich|coffee|tea|juice|cheese|protein|veggie|other",
      "quantity": 1,
      "unit": "each",
      "unitPrice": 0.0,
      "lineTotal": 0.0,
      "confidence": 0.9
    }
  ]
}

Rules:
- Menu items, drinks, and add-ons only.
- itemKind: "addon" for extras/modifiers; "dish" for mains.
- classification: sandwich, byo-sandwich, coffee, tea, juice for dishes; cheese, protein, veggie, coffee for add-ons.
- quantity = servings sold.
- unitPrice / lineTotal from receipt when visible."""


def _line_kind(row: dict, raw_name: str) -> str:
    kind = str(row.get("itemKind", "")).strip().lower()
    if kind in ("addon", "add-on", "add_on"):
        return "addon"
    if kind == "dish":
        return "dish"
    return _classify_menu_kind(raw_name)


def quick_scan(client: OpenAI, image_bytes: bytes, mime_type: str) -> QuickScanResult:
    data = vision_json(client, image_bytes, mime_type, QUICK_PROMPT)
    lines = []
    for row in data.get("lines", []):
        raw = str(row.get("rawName", "")).strip()
        if not raw:
            continue
        kind = _line_kind(row, raw)
        lines.append(
            QuickLineItem(
                rawName=raw,
                suggestedCategory="menu_item",
                menuItemKind=kind,
                classification=_line_classification(row, raw, kind),
                description=raw,
                confidence=float(row.get("confidence", 0.8)),
            )
        )
    return QuickScanResult(
        billType="customer",
        vendor=str(data.get("vendor", "")),
        lines=lines,
    )


def detail_parse(client: OpenAI, image_bytes: bytes, mime_type: str) -> ParsedBill:
    data = vision_json(client, image_bytes, mime_type, DETAIL_PROMPT)
    lines = []
    for row in data.get("lines", []):
        raw = str(row.get("rawName", "")).strip()
        if not raw:
            continue
        kind = _line_kind(row, raw)
        lines.append(
            ParsedLineItem(
                rawName=raw,
                quantity=float(row.get("quantity", 1) or 1),
                unit=str(row.get("unit", "each") or "each"),
                unitPrice=float(row.get("unitPrice", 0) or 0),
                lineTotal=float(row.get("lineTotal", 0) or 0),
                confidence=float(row.get("confidence", 0.8)),
                suggestedCategory="menu_item",
                menuItemKind=kind,
                classification=_line_classification(row, raw, kind),
                description=raw,
            )
        )
    return ParsedBill(
        billType="customer",
        vendor=str(data.get("vendor", "")),
        billDate=str(data.get("billDate", "")),
        invoiceNumber=str(data.get("invoiceNumber", "")),
        lines=lines,
    )


def parse_customer_bill(
    client: OpenAI,
    data: bytes,
    filename: str,
    content_type: str,
) -> tuple[ParsedBill, QuickScanResult]:
    image_bytes, mime_type = load_bill_image(data, filename, content_type)
    quick = quick_scan(client, image_bytes, mime_type)
    detail = detail_parse(client, image_bytes, mime_type)
    bill = merge_quick_into_detail(quick, detail)
    return bill, quick
