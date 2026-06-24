"""Sous Chef agent — purchase orders, sales orders, recipe linker."""

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from bill_pipeline import ParsePipelineResult, run_customer_pipeline, run_supplier_pipeline
from catalog_prepare import prepare_catalog_batch
from image_suggestions import IMAGE_COUNT, ImageSuggestion, suggest_images
from recipe_linker import link_recipe
from recipe_models import IngredientCatalogItem, LinkRecipeResult, MenuItemInput


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    OPENAI_API_KEY: str = ""


settings = Settings()
app = FastAPI(title="Sous Chef Agent", version="0.4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: str
    service: str


class PrepareCatalogItem(BaseModel):
    key: str
    name: str
    raw_name: str = ""
    item_type: str = "ingredient"
    store_name: str = ""
    brand_name: str = ""
    quantity: float = 0
    unit: str = ""


class PrepareCatalogBatchRequest(BaseModel):
    items: list[PrepareCatalogItem]


class PrepareCatalogBatchResult(BaseModel):
    key: str
    normalized_name: str
    brand_name: str = ""
    images: list[ImageSuggestion]


class PrepareCatalogBatchResponse(BaseModel):
    results: list[PrepareCatalogBatchResult]


class ParsePipelineResponse(BaseModel):
    bill: dict
    unique_item_count: int = 0
    enriched: list[PrepareCatalogBatchResult] = Field(default_factory=list)
    menu_items: list[dict] = Field(default_factory=list)


class LinkRecipeRequest(BaseModel):
    menu_item: MenuItemInput
    ingredients: list[IngredientCatalogItem] = Field(default_factory=list)


class SuggestImagesRequest(BaseModel):
    name: str
    item_type: str = "ingredient"
    brand_name: str = ""
    quantity: float = 0
    unit: str = ""
    extra_keywords: str = ""
    ingredient_names: list[str] = Field(default_factory=list)
    refresh: bool = False
    exclude_urls: list[str] = Field(default_factory=list)
    count: int = IMAGE_COUNT


class SuggestImagesResponse(BaseModel):
    images: list[ImageSuggestion]


@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(status="ok", service="sous-chef-agent")


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


@app.post("/parse-supplier-bill", response_model=ParsePipelineResponse)
async def parse_supplier_bill(file: UploadFile = File(...)):
    result = await _parse_supplier_file(file)
    return _pipeline_response(result)


@app.post("/parse-customer-bill", response_model=ParsePipelineResponse)
async def parse_customer_bill(file: UploadFile = File(...)):
    result = await _parse_customer_file(file)
    return _pipeline_response(result)


@app.post("/parse-bill-pipeline", response_model=ParsePipelineResponse)
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


@app.post("/link-recipe", response_model=LinkRecipeResult)
def link_recipe_endpoint(req: LinkRecipeRequest):
    """IM-Agent: link a dish or add-on to pantry ingredients."""
    client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None
    try:
        return link_recipe(client, req.menu_item, req.ingredients)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Link recipe failed: {exc}") from exc


@app.post("/prepare-catalog-batch", response_model=PrepareCatalogBatchResponse)
def prepare_catalog_items_batch(req: PrepareCatalogBatchRequest):
    if not req.items:
        return PrepareCatalogBatchResponse(results=[])

    client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None
    try:
        raw = prepare_catalog_batch(client, [item.model_dump() for item in req.items])
        results = [PrepareCatalogBatchResult.model_validate(row) for row in raw]
        return PrepareCatalogBatchResponse(results=results)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prepare catalog failed: {exc}") from exc


@app.post("/suggest-images", response_model=SuggestImagesResponse)
def suggest_images_endpoint(req: SuggestImagesRequest):
    """Fetch product-packaging photos (static images only — no GIFs)."""
    client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None
    try:
        images = suggest_images(
            client,
            req.name,
            req.item_type,
            brand_name=req.brand_name if req.item_type == "ingredient" else "",
            quantity=req.quantity,
            unit=req.unit,
            extra_keywords=req.extra_keywords,
            ingredient_names=req.ingredient_names if req.item_type in ("dish", "addon") else [],
            use_gpt=client is not None,
            refresh=req.refresh,
            exclude_urls=req.exclude_urls,
        )
        limit = max(1, min(req.count, IMAGE_COUNT))
        return SuggestImagesResponse(images=images[:limit])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Image suggest failed: {exc}") from exc
