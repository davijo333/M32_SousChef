"""Shared bill parser types and vision helpers."""

from __future__ import annotations

import base64
import json
from typing import Literal

from openai import OpenAI
from pydantic import BaseModel, Field

BillType = Literal["supplier", "customer"]


MenuItemKind = Literal["dish", "addon"]


class ParsedLineItem(BaseModel):
    rawName: str
    quantity: float = 1
    unit: str = "each"
    unitPrice: float = 0
    lineTotal: float = 0
    confidence: float = Field(default=0.8, ge=0, le=1)
    suggestedCategory: Literal["ingredient", "menu_item"]
    menuItemKind: MenuItemKind | None = None
    classification: str | None = None
    ingredientCategory: str | None = None
    description: str | None = None


class ParsedBill(BaseModel):
    billType: BillType
    vendor: str = ""
    billDate: str = ""
    invoiceNumber: str = ""
    lines: list[ParsedLineItem]


class QuickLineItem(BaseModel):
    """Fast scan — names only, for kicking off normalizer / recipe agents."""

    rawName: str
    suggestedCategory: Literal["ingredient", "menu_item"]
    menuItemKind: MenuItemKind | None = None
    classification: str | None = None
    ingredientCategory: str | None = None
    description: str | None = None
    confidence: float = Field(default=0.8, ge=0, le=1)


class QuickScanResult(BaseModel):
    billType: BillType
    vendor: str = ""
    lines: list[QuickLineItem]


def load_bill_image(data: bytes, filename: str, content_type: str) -> tuple[bytes, str]:
    lower = filename.lower()
    if content_type == "application/pdf" or lower.endswith(".pdf"):
        import fitz  # PyMuPDF

        doc = fitz.open(stream=data, filetype="pdf")
        if not doc:
            return data, "image/png"
        page = doc[0]
        pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
        return pix.tobytes("png"), "image/png"
    mime = content_type if content_type.startswith("image/") else "image/png"
    return data, mime


def vision_json(client: OpenAI, image_bytes: bytes, mime_type: str, prompt: str) -> dict:
    b64 = base64.standard_b64encode(image_bytes).decode("ascii")
    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime_type};base64,{b64}"},
                    },
                ],
            }
        ],
        response_format={"type": "json_object"},
    )
    raw = completion.choices[0].message.content or "{}"
    return json.loads(raw)


def merge_quick_into_detail(quick: QuickScanResult, detail: ParsedBill) -> ParsedBill:
    """Prefer detail lines; fall back to quick names if detail parse returned fewer rows."""
    if len(detail.lines) >= len(quick.lines):
        return detail
    detail_by_name = {line.rawName.lower().strip(): line for line in detail.lines}
    merged: list[ParsedLineItem] = []
    for q in quick.lines:
        key = q.rawName.lower().strip()
        if key in detail_by_name:
            merged.append(detail_by_name[key])
        else:
            merged.append(
                ParsedLineItem(
                    rawName=q.rawName,
                    suggestedCategory=q.suggestedCategory,
                    menuItemKind=q.menuItemKind,
                    classification=q.classification,
                    ingredientCategory=q.ingredientCategory,
                    description=q.description,
                    confidence=q.confidence,
                )
            )
    for line in detail.lines:
        key = line.rawName.lower().strip()
        if key not in {m.rawName.lower().strip() for m in merged}:
            merged.append(line)
    return ParsedBill(
        billType=detail.billType,
        vendor=detail.vendor or quick.vendor,
        billDate=detail.billDate,
        invoiceNumber=detail.invoiceNumber,
        lines=merged,
    )
