"""2a Ingredient Normalizer — names + 2 images per supplier line."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from item_normalizer import normalize_with_images


def enrich_supplier_items(client: object | None, items: list[dict]) -> list[dict]:
    if not items:
        return []
    workers = min(12, max(1, len(items)))

    def one(item: dict) -> dict:
        return normalize_with_images(
            client,
            key=item["key"],
            raw_name=item.get("raw_name") or item.get("name", ""),
            name=item.get("name", ""),
            item_type="ingredient",
            store_name=item.get("store_name") or item.get("brand_name", ""),
            quantity=float(item.get("quantity") or 0),
            unit=item.get("unit", ""),
        )

    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(one, items))


def prepare_catalog_batch(client: object | None, items: list[dict]) -> list[dict]:
    """Batch 2a enrich for supplier ingredient review cards."""
    ing_items = [item for item in items if item.get("item_type") != "dish"]
    if not ing_items:
        return []
    return enrich_supplier_items(client, ing_items)
