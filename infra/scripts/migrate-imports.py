#!/usr/bin/env python3
"""One-shot import path migration for backend/api restructure."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILE_DOMAIN: dict[str, str] = {
    "agent-chat": "agents",
    "agent-inventory-actions": "agents",
    "agent-menu-actions": "agents",
    "agent-pending-actions": "agents",
    "agent-recipe-build": "agents",
    "dashboard-chat": "agents",
    "dashboard-chat-context": "agents",
    "chat-handoff": "agents",
    "bill-classify": "bills",
    "bill-filename": "bills",
    "bill-ingest": "bills",
    "bill-normalizer": "bills",
    "bill-retention": "bills",
    "apply-pipeline-enrichment": "bills",
    "catalog-add": "catalog",
    "catalog-classification": "catalog",
    "catalog-identify": "catalog",
    "dish-addon-links": "catalog",
    "dish-catalog": "catalog",
    "dish-enrichment": "catalog",
    "dish-image-status": "catalog",
    "dish-payload": "catalog",
    "enrich-new-items": "catalog",
    "ensure-dish-images": "catalog",
    "extract-new-items": "catalog",
    "image-selection": "catalog",
    "ingredient-enrichment": "catalog",
    "ingredient-identity": "catalog",
    "ingredient-image-status": "catalog",
    "ingredient-labels": "catalog",
    "ingredient-pantry-status": "catalog",
    "ingredient-purchase-stats": "catalog",
    "ingredient-sku": "catalog",
    "persist-catalog-image-candidate": "catalog",
    "regenerate-addon-images": "catalog",
    "regenerate-dish-images": "catalog",
    "regenerate-ingredient-images": "catalog",
    "suggested-menu-name": "catalog",
    "chat-bill-upload-queue": "chat",
    "chat-catalog-draft": "chat",
    "chat-catalog-intent": "chat",
    "chat-choices": "chat",
    "chat-recipe-build-intent": "chat",
    "chat-retention": "chat",
    "chat-upload-intent": "chat",
    "create-cues": "creative",
    "create-suggestion": "creative",
    "create-weather": "creative",
    "creative-cue-events": "creative",
    "suggestion-notes": "creative",
    "dashboard-margins": "dashboard",
    "dashboard-sales-analytics": "dashboard",
    "dashboard-stats": "dashboard",
    "menu-sales-stats": "dashboard",
    "recipe-agent-status": "recipes",
    "recipe-build-ingredient-options": "recipes",
    "recipe-build-plan": "recipes",
    "recipe-builder": "recipes",
    "recipe-pipeline": "recipes",
    "recipe-pricing": "recipes",
    "purchase-order": "orders",
    "sales-order": "orders",
    "sales-deduction": "orders",
    "supplier-ingest": "orders",
    "order-work-entries": "orders",
    "auth": "infra",
    "mongodb": "infra",
    "r2-storage-keys": "infra",
    "r2-storage": "infra",
    "route-session": "infra",
    "restaurant-name-server": "infra",
    "enrich-client": "infra",
    "seed-catalog-images": "infra",
    "seed-kitchen": "infra",
    "seed-order-dates": "infra",
    "seed-orders": "infra",
    "kitchen-inventory": "infra",
    "kitchen-name": "infra",
    "inventory-engine": "infra",
}

WEB_LIB = {"agent-icons", "chat-markdown", "load-test-data", "use-kitchen-catalog", "use-new-catalog-review"}


def lib_replacement(name: str) -> str:
    if name in WEB_LIB:
        return f"@/lib/{name}"
    domain = FILE_DOMAIN.get(name)
    if not domain:
        raise KeyError(f"Unknown lib module: {name}")
    return f"@backend/services/{domain}/{name}"


def migrate_text(text: str) -> str:
    def models_sub(m: re.Match[str]) -> str:
        quote = m.group(1)
        path = m.group(2)
        return f"{quote}@backend/models/{path}{quote}"

    text = re.sub(r'(["\'])@/models/([^"\']+)\1', models_sub, text)

    def lib_sub(m: re.Match[str]) -> str:
        quote = m.group(1)
        name = m.group(2)
        return f"{quote}{lib_replacement(name)}{quote}"

    text = re.sub(r'(["\'])@/lib/([a-z0-9-]+)\1', lib_sub, text)
    return text


def main() -> None:
    targets = [
        ROOT / "apps" / "web" / "src",
        ROOT / "backend" / "api",
    ]
    changed = 0
    for base in targets:
        for path in base.rglob("*"):
            if path.suffix not in {".ts", ".tsx", ".md"}:
                continue
            original = path.read_text(encoding="utf-8")
            updated = migrate_text(original)
            if updated != original:
                path.write_text(updated, encoding="utf-8")
                changed += 1
                print(f"updated {path.relative_to(ROOT)}")
    print(f"done — {changed} files")


if __name__ == "__main__":
    main()
