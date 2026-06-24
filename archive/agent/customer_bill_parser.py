"""1a-customer Bill Parser — POS sales receipts, menu item lines only."""

from __future__ import annotations

from openai import OpenAI

from bill_parser_common import (
    ParsedBill,
    ParsedLineItem,
    QuickScanResult,
    QuickLineItem,
    load_bill_image,
    merge_quick_into_detail,
    vision_json,
)

QUICK_PROMPT = """POS SALES RECEIPT for a breakfast café (Square, Toast, Clover style).

Return JSON only:
{
  "vendor": "POS vendor if visible else empty",
  "lines": [
    { "rawName": "menu item sold as printed", "confidence": 0.9 }
  ]
}

Rules:
- One entry per menu item / drink sold.
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
      "quantity": 1,
      "unit": "each",
      "unitPrice": 0.0,
      "lineTotal": 0.0,
      "confidence": 0.9
    }
  ]
}

Rules:
- Menu items and drinks only.
- quantity = servings sold.
- unitPrice / lineTotal from receipt when visible."""


def quick_scan(client: OpenAI, image_bytes: bytes, mime_type: str) -> QuickScanResult:
    data = vision_json(client, image_bytes, mime_type, QUICK_PROMPT)
    lines = [
        QuickLineItem(
            rawName=str(row.get("rawName", "")).strip(),
            suggestedCategory="menu_item",
            confidence=float(row.get("confidence", 0.8)),
        )
        for row in data.get("lines", [])
        if str(row.get("rawName", "")).strip()
    ]
    return QuickScanResult(
        billType="customer",
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
            suggestedCategory="menu_item",
        )
        for row in data.get("lines", [])
        if str(row.get("rawName", "")).strip()
    ]
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
