"""Load Sous Chef persona and worker contracts."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

SPECIALISTS_DIR = Path(__file__).resolve().parent.parent / "specialists"
SUPERVISOR_DIR = Path(__file__).resolve().parent.parent / "supervisor"

WORKER_CONTEXTS = ("inventory", "business", "create")


def _agent_dir(context: str) -> Path:
    if context == "head":
        return SUPERVISOR_DIR
    folder = "creative" if context == "create" else context
    return SPECIALISTS_DIR / folder


def _read_yaml(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    data = yaml.safe_load(path.read_text())
    return data if isinstance(data, dict) else {}


@lru_cache(maxsize=1)
def load_assistant_names() -> dict[str, str]:
    """Internal worker labels — not for user-facing copy."""
    return {ctx: ctx for ctx in WORKER_CONTEXTS}


def load_profile(context: str) -> dict[str, str]:
    """Sous Chef persona (head) or minimal worker metadata."""
    data = _read_yaml(_agent_dir(context) / "profile.yaml")
    if context == "head":
        sample = data.get("sample_queries") or []
        queries = [str(q).strip() for q in sample if str(q).strip()] if isinstance(sample, list) else []
        return {
            "name": str(data.get("name", "Sous Chef")),
            "tagline": str(data.get("tagline", "")).strip(),
            "persona": str(data.get("persona", "")).strip(),
            "role": str(data.get("role", "")).strip(),
            "data_access": str(data.get("data_access", "")).strip(),
            "sample_queries": "\n".join(f"- {q}" for q in queries),
        }
    return {
        "name": str(data.get("worker") or context),
        "persona": "",
        "role": "",
        "data_access": "",
        "tagline": "",
        "sample_queries": "",
    }


def load_contract(context: str) -> dict[str, Any]:
    path = _agent_dir(context) / "contract.yaml"
    return _read_yaml(path)


def instruction_placeholders(**extra: str) -> dict[str, str]:
    profile = load_profile("head")
    placeholders = {
        "head": profile.get("name") or "Sous Chef",
        "inventory": "inventory",
        "business": "business",
        "creative": "create",
        "name": profile.get("name") or "Sous Chef",
    }
    placeholders.update(extra)
    return placeholders


def load_instructions(context: str, **kwargs: str) -> str:
    path = _agent_dir(context) / "instructions.md"
    if not path.is_file():
        return ""
    raw = path.read_text().strip()
    placeholders = instruction_placeholders()
    if context != "head":
        placeholders["name"] = load_profile(context).get("name") or context
    placeholders.update(kwargs)
    try:
        return raw.format(**placeholders)
    except KeyError:
        return raw
