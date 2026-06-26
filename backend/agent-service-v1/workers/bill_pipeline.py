"""Purchase order + sales order ingest — 1a parsers + 2a normalizer."""

from __future__ import annotations

import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

from openai import OpenAI
from pydantic import BaseModel, Field

from .bill_parser_common import (
    ParsedBill,
    QuickScanResult,
    load_bill_image,
    merge_quick_into_detail,
)
from .catalog_prepare import enrich_supplier_items
from .customer_bill_parser import detail_parse as customer_detail_parse
from .customer_bill_parser import quick_scan as customer_quick_scan
from .supplier_bill_parser import detail_parse as supplier_detail_parse
from .supplier_bill_parser import quick_scan as supplier_quick_scan


class CatalogQueueItem(BaseModel):
    key: str
    name: str
    raw_name: str
    item_type: str
    store_name: str = ""
    brand_name: str = ""
    quantity: float = 0
    unit: str = "each"


class EnrichedCatalogItem(BaseModel):
    key: str
    normalized_name: str
    brand_name: str = ""
    images: list = Field(default_factory=list)


class ParsePipelineResult(BaseModel):
    bill: ParsedBill
    unique_items: list[CatalogQueueItem] = Field(default_factory=list)
    enriched: list[EnrichedCatalogItem] = Field(default_factory=list)


BILL_PIPELINE_PARALLEL = max(1, min(5, int(os.environ.get("BILL_PIPELINE_PARALLEL", "5"))))


def _normalize_key(name: str) -> str:
    return re.sub(r"[^a-z0-9\s]", " ", name.lower()).strip()


def _item_id(name: str, item_type: str = "ingredient") -> str:
    slug = _normalize_key(name).replace(" ", "-")
    prefix = "dish" if item_type == "dish" else "addon" if item_type == "addon" else "ingredient"
    return f"{prefix}-{slug}"


def unique_catalog_queue(
    quick: QuickScanResult,
    bill: ParsedBill,
    *,
    vendor: str = "",
) -> list[CatalogQueueItem]:
    seen: set[str] = set()
    queue: list[CatalogQueueItem] = []
    detail_by_name = {_normalize_key(line.rawName): line for line in bill.lines}

    for q in quick.lines:
        key_name = _normalize_key(q.rawName)
        if not key_name or key_name in seen:
            continue
        if key_name in {"tax", "tip", "total", "subtotal"}:
            continue
        seen.add(key_name)
        detail = detail_by_name.get(key_name)
        queue.append(
            CatalogQueueItem(
                key=_item_id(q.rawName, "ingredient"),
                name=q.rawName,
                raw_name=q.rawName,
                item_type="ingredient",
                store_name=vendor,
                quantity=float(detail.quantity if detail else 1),
                unit=str(detail.unit if detail else "each"),
            )
        )
    return queue


def unique_menu_queue(
    quick: QuickScanResult,
    bill: ParsedBill,
) -> list[CatalogQueueItem]:
    """Dishes and add-ons from customer bill quick scan."""
    seen: set[str] = set()
    queue: list[CatalogQueueItem] = []
    detail_by_name = {_normalize_key(line.rawName): line for line in bill.lines}

    for q in quick.lines:
        key_name = _normalize_key(q.rawName)
        if not key_name or key_name in seen:
            continue
        if key_name in {"tax", "tip", "total", "subtotal"}:
            continue
        seen.add(key_name)
        detail = detail_by_name.get(key_name)
        kind = (detail.menuItemKind if detail and detail.menuItemKind else q.menuItemKind) or "dish"
        item_type = "addon" if kind == "addon" else "dish"
        queue.append(
            CatalogQueueItem(
                key=_item_id(q.rawName, item_type),
                name=q.rawName,
                raw_name=q.rawName,
                item_type=item_type,
                quantity=float(detail.quantity if detail else 1),
                unit=str(detail.unit if detail else "each"),
            )
        )
    return queue


def run_supplier_pipeline(
    client: OpenAI,
    data: bytes,
    filename: str,
    content_type: str,
) -> ParsePipelineResult:
    """Quick + detail parse in parallel, then 2a normalizer + images."""
    image_bytes, mime_type = load_bill_image(data, filename, content_type)

    with ThreadPoolExecutor(max_workers=2) as pool:
        quick_future = pool.submit(supplier_quick_scan, client, image_bytes, mime_type)
        detail_future = pool.submit(supplier_detail_parse, client, image_bytes, mime_type)
        quick = quick_future.result()
        detail = detail_future.result()

    bill = merge_quick_into_detail(quick, detail)
    unique = unique_catalog_queue(quick, bill, vendor=bill.vendor)
    enriched_raw = enrich_supplier_items(client, [item.model_dump() for item in unique])
    enriched = [EnrichedCatalogItem.model_validate(row) for row in enriched_raw]
    return ParsePipelineResult(bill=bill, unique_items=unique, enriched=enriched)


def run_customer_pipeline(
    client: OpenAI,
    data: bytes,
    filename: str,
    content_type: str,
) -> ParsePipelineResult:
    """Parse customer bill — dishes and add-ons, no image enrichment."""
    image_bytes, mime_type = load_bill_image(data, filename, content_type)

    with ThreadPoolExecutor(max_workers=2) as pool:
        quick_future = pool.submit(customer_quick_scan, client, image_bytes, mime_type)
        detail_future = pool.submit(customer_detail_parse, client, image_bytes, mime_type)
        quick = quick_future.result()
        detail = detail_future.result()

    bill = merge_quick_into_detail(quick, detail)
    unique = unique_menu_queue(quick, bill)
    return ParsePipelineResult(bill=bill, unique_items=unique, enriched=[])


def run_parse_pipelines_parallel(
    client: OpenAI,
    jobs: list[tuple[bytes, str, str]],
    *,
    max_workers: int | None = None,
) -> list[ParsePipelineResult]:
    """Parse up to BILL_PIPELINE_PARALLEL purchase orders at once."""
    if not jobs:
        return []
    workers = max_workers or min(BILL_PIPELINE_PARALLEL, len(jobs))
    results: list[ParsePipelineResult | None] = [None] * len(jobs)

    def one(index: int, job: tuple[bytes, str, str]) -> tuple[int, ParsePipelineResult]:
        data, filename, content_type = job
        return index, run_supplier_pipeline(client, data, filename, content_type)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(one, i, job) for i, job in enumerate(jobs)]
        for future in as_completed(futures):
            index, result = future.result()
            results[index] = result

    return [r for r in results if r is not None]
