"""Load and cache workflow catalog from YAML."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

CATALOG_DIR = Path(__file__).resolve().parent.parent / "catalog"


@lru_cache(maxsize=1)
def load_catalog() -> dict[str, Any]:
    """Merge all catalog/*.yaml into a single workflow index."""
    shared: dict[str, Any] = {}
    workflows: list[dict[str, Any]] = []

    shared_path = CATALOG_DIR / "shared.yaml"
    if shared_path.is_file():
        shared = yaml.safe_load(shared_path.read_text()) or {}

    for path in sorted(CATALOG_DIR.glob("*.yaml")):
        if path.name == "shared.yaml":
            continue
        data = yaml.safe_load(path.read_text()) or {}
        workflows.extend(data.get("workflows") or [])

    by_id = {w["id"]: w for w in workflows if w.get("id")}
    return {"shared": shared, "workflows": by_id}


def get_workflow(workflow_id: str) -> dict[str, Any] | None:
    return load_catalog()["workflows"].get(workflow_id)
