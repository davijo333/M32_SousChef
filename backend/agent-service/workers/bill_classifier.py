"""Classify a bill image/PDF as purchase order (supplier) or sales receipt (customer)."""

from __future__ import annotations

import re
from typing import Literal

from openai import OpenAI
from pydantic import BaseModel, Field

from .bill_parser_common import vision_json

BillType = Literal["supplier", "customer"]


class BillClassification(BaseModel):
    billType: BillType
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str = ""


SO_FILENAME = re.compile(r"^\d+\.c_bill\.(pdf|png|jpe?g)$", re.I)
PO_FILENAME = re.compile(r"^bill-\d+_[a-z0-9-]+\.(pdf|png|jpe?g)$", re.I)
SO_MARKER = re.compile(r"\.c_bill\.|[_-]c_bill[._-]", re.I)
PO_MARKER = re.compile(r"\.s_bill\.|[_-]s_bill[._-]", re.I)

CLASSIFY_PROMPT = """You classify restaurant documents for a café kitchen app.

Is this document a:
- **supplier** wholesale PURCHASE ORDER / delivery invoice (Sysco, Costco, US Foods, bulk ingredients, cases, lbs), OR
- **customer** POS SALES RECEIPT (Square, Toast, Clover, menu items sold to guests, tickets)?

Return JSON only:
{"billType": "supplier" or "customer", "confidence": 0.0-1.0, "reason": "one short phrase"}

Sales receipts usually list menu dishes/drinks sold. Purchase orders list bulk ingredients and pack sizes."""


def classify_from_filename(filename: str) -> BillClassification | None:
    name = (filename or "bill").strip()
    lower = name.lower()

    if SO_MARKER.search(lower) and not PO_MARKER.search(lower):
        return BillClassification(
            billType="customer",
            confidence=0.98,
            reason="POS sales receipt filename",
        )
    if PO_MARKER.search(lower) and not SO_MARKER.search(lower):
        return BillClassification(
            billType="supplier",
            confidence=0.98,
            reason="purchase order filename marker",
        )
    if SO_FILENAME.match(lower):
        return BillClassification(
            billType="customer",
            confidence=0.96,
            reason="standard POS receipt file pattern",
        )
    if PO_FILENAME.match(lower):
        return BillClassification(
            billType="supplier",
            confidence=0.94,
            reason="wholesaler invoice file pattern",
        )
    return None


def classify_bill_document(
    client: OpenAI | None,
    data: bytes,
    filename: str,
    content_type: str,
) -> BillClassification:
    from_filename = classify_from_filename(filename)
    if from_filename and from_filename.confidence >= 0.94:
        return from_filename

    if not client or not data:
        return from_filename or BillClassification(
            billType="supplier",
            confidence=0.5,
            reason="defaulting to purchase order — confirm if wrong",
        )

    try:
        payload = vision_json(client, data, content_type, CLASSIFY_PROMPT)
        raw_type = str(payload.get("billType", "")).strip().lower()
        bill_type: BillType = "customer" if raw_type == "customer" else "supplier"
        confidence = float(payload.get("confidence", 0.75))
        reason = str(payload.get("reason", "")).strip() or (
            "POS sales receipt" if bill_type == "customer" else "wholesale purchase invoice"
        )
        return BillClassification(billType=bill_type, confidence=confidence, reason=reason)
    except Exception:
        return from_filename or BillClassification(
            billType="supplier",
            confidence=0.55,
            reason="could not read document — assumed purchase order",
        )
