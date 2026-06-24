"""1a-supplier Bill Parser — wholesale invoices, ingredient lines only."""

from __future__ import annotations

from openai import OpenAI

from bill_parser_common import (
    ParsedBill,
    ParsedLineItem,
    QuickScanResult,
    QuickLineItem,
    load_bill_image,
    vision_json,
)

QUICK_PROMPT = """Wholesale supplier INVOICE for a breakfast diner (Sysco, Costco, US Foods, etc.).

Return JSON only:
{
  "vendor": "vendor name if visible else empty",
  "lines": [
    { "rawName": "line description as printed", "confidence": 0.9 }
  ]
}

Rules:
- One entry per product line (skip subtotal/tax/total-only rows).
- Ingredient / grocery products only.
- confidence 0.0-1.0 from OCR clarity."""

DETAIL_PROMPT = """Wholesale supplier INVOICE for a breakfast diner.

Return JSON only:
{
  "vendor": "vendor name if visible",
  "billDate": "YYYY-MM-DD or empty",
  "invoiceNumber": "id or empty",
  "lines": [
    {
      "rawName": "description",
      "quantity": 1,
      "unit": "each|lb|dz|gallon|case|...",
      "unitPrice": 0.0,
      "lineTotal": 0.0,
      "confidence": 0.9
    }
  ]
}

Rules:
- Ingredient purchase lines only.
- Numeric quantity, unitPrice, lineTotal.
- Skip tax/subtotal/total rows unless separate line items."""


def quick_scan(client: OpenAI, image_bytes: bytes, mime_type: str) -> QuickScanResult:
    data = vision_json(client, image_bytes, mime_type, QUICK_PROMPT)
    lines = [
        QuickLineItem(
            rawName=str(row.get("rawName", "")).strip(),
            suggestedCategory="ingredient",
            confidence=float(row.get("confidence", 0.8)),
        )
        for row in data.get("lines", [])
        if str(row.get("rawName", "")).strip()
    ]
    return QuickScanResult(
        billType="supplier",
        vendor=str(data.get("vendor", "")),
        lines=lines,
    )


def detail_parse(client: OpenAI, image_bytes: bytes, mime_type: str) -> ParsedBill:
    data = vision_json(client, image_bytes, mime_type, DETAIL_PROMPT)
    lines = [
        ParsedLineItem(
            rawName=str(row.get("rawName", "")).strip(),
            quantity=float(row.get("quantity", 1) or 1),
            unit=str(row.get("unit", "each") or "each"),
            unitPrice=float(row.get("unitPrice", 0) or 0),
            lineTotal=float(row.get("lineTotal", 0) or 0),
            confidence=float(row.get("confidence", 0.8)),
            suggestedCategory="ingredient",
        )
        for row in data.get("lines", [])
        if str(row.get("rawName", "")).strip()
    ]
    return ParsedBill(
        billType="supplier",
        vendor=str(data.get("vendor", "")),
        billDate=str(data.get("billDate", "")),
        invoiceNumber=str(data.get("invoiceNumber", "")),
        lines=lines,
    )


def parse_supplier_bill(
    client: OpenAI,
    data: bytes,
    filename: str,
    content_type: str,
) -> tuple[ParsedBill, QuickScanResult]:
    image_bytes, mime_type = load_bill_image(data, filename, content_type)
    quick = quick_scan(client, image_bytes, mime_type)
    detail = detail_parse(client, image_bytes, mime_type)
    from bill_parser_common import merge_quick_into_detail

    bill = merge_quick_into_detail(quick, detail)
    return bill, quick
