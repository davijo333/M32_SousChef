"""Run golden conversation fixtures against the supervisor."""

from __future__ import annotations

from pathlib import Path

import yaml

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


def load_fixtures() -> list[dict]:
    out: list[dict] = []
    for path in FIXTURES_DIR.glob("*.yaml"):
        out.append(yaml.safe_load(path.read_text()) or {})
    return out


def run_fixture(fixture: dict) -> dict:
    """TODO: invoke run_supervisor_turn and check assert block."""
    return {"passed": False, "reason": "not implemented", "fixture": fixture.get("name")}
