"""Bill classify and parse routes — UI upload pipeline."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from openai import OpenAI

from api.schemas.bills import ClassifyBillResponse, ParsePipelineResponse, PrepareCatalogBatchResult
from config.settings import settings
from workers.bill_classifier import classify_bill_document
from workers.bill_pipeline import ParsePipelineResult, run_customer_pipeline, run_supplier_pipeline

router = APIRouter()


def _pipeline_response(result: ParsePipelineResult) -> ParsePipelineResponse:
    enriched = [
        PrepareCatalogBatchResult.model_validate(row.model_dump()) for row in result.enriched
    ]
    menu_items = [
        {
            "key": item.key,
            "name": item.name,
            "raw_name": item.raw_name,
            "item_type": item.item_type,
            "quantity": item.quantity,
            "unit": item.unit,
        }
        for item in result.unique_items
        if item.item_type in ("dish", "addon")
    ]
    return ParsePipelineResponse(
        bill=result.bill.model_dump(),
        unique_item_count=len(result.unique_items),
        enriched=enriched,
        menu_items=menu_items,
    )


async def _parse_supplier_file(file: UploadFile) -> ParsePipelineResult:
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    content_type = file.content_type or "application/octet-stream"
    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    try:
        return run_supplier_pipeline(client, data, file.filename or "bill", content_type)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Parse failed: {exc}") from exc


async def _parse_customer_file(file: UploadFile) -> ParsePipelineResult:
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    content_type = file.content_type or "application/octet-stream"
    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    try:
        return run_customer_pipeline(client, data, file.filename or "bill", content_type)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Parse failed: {exc}") from exc


@router.post("/classify-bill", response_model=ClassifyBillResponse)
async def classify_bill(file: UploadFile = File(...)):
    """Detect purchase order vs sales receipt before parse."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    content_type = file.content_type or "application/octet-stream"
    client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None
    result = classify_bill_document(client, data, file.filename or "bill", content_type)
    return ClassifyBillResponse(
        billType=result.billType,
        confidence=result.confidence,
        reason=result.reason,
    )


@router.post("/parse-bill-pipeline", response_model=ParsePipelineResponse)
async def parse_bill_pipeline(
    file: UploadFile = File(...),
    bill_type: str = Form("supplier"),
):
    if bill_type == "customer":
        result = await _parse_customer_file(file)
    elif bill_type == "supplier":
        result = await _parse_supplier_file(file)
    else:
        raise HTTPException(status_code=400, detail="bill_type must be supplier or customer")
    return _pipeline_response(result)


@router.post("/parse-supplier-bill", response_model=ParsePipelineResponse)
async def parse_supplier_bill(file: UploadFile = File(...)):
    result = await _parse_supplier_file(file)
    return _pipeline_response(result)


@router.post("/parse-customer-bill", response_model=ParsePipelineResponse)
async def parse_customer_bill(file: UploadFile = File(...)):
    result = await _parse_customer_file(file)
    return _pipeline_response(result)
