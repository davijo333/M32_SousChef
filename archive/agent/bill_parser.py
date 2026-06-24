"""1a Bill Parser — legacy router; use supplier/customer parsers via bill_pipeline."""

from __future__ import annotations

from typing import Literal

from openai import OpenAI

from bill_parser_common import ParsedBill, ParsedLineItem
from bill_pipeline import run_parse_pipeline

BillType = Literal["supplier", "customer"]


def parse_bill_file(
    client: OpenAI,
    data: bytes,
    filename: str,
    content_type: str,
    bill_type: BillType,
) -> ParsedBill:
    result = run_parse_pipeline(client, data, filename, content_type, bill_type)
    if result.bill.billType != bill_type:
        raise ValueError(f"bill_type_mismatch:{result.bill.billType}:{bill_type}")
    return result.bill


__all__ = ["ParsedBill", "ParsedLineItem", "parse_bill_file", "BillType"]
