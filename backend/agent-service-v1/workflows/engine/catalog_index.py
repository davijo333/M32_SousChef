"""Compact workflow index for Sous Chef LLM triage."""

from __future__ import annotations

from workflows.engine.loader import load_catalog


def build_catalog_index(*, max_workflows: int = 80) -> str:
    """One line per catalogued workflow — id, mode, summary, sample triggers."""
    lines: list[str] = []
    for wf_id, wf in sorted(load_catalog()["workflows"].items()):
        if wf.get("status") not in (None, "catalogued"):
            continue
        mode = str(wf.get("mode") or "write")
        name = str(wf.get("name") or wf_id).strip()
        desc = str(wf.get("description") or name).strip().replace("\n", " ")
        if len(desc) > 140:
            desc = desc[:137] + "..."
        triggers = [str(t).strip() for t in (wf.get("trigger") or [])[:4] if str(t).strip()]
        trigger_text = ", ".join(triggers) if triggers else "—"
        lines.append(f"- {wf_id} [{mode}] {desc} | triggers: {trigger_text}")
        if len(lines) >= max_workflows:
            break
    return "\n".join(lines)


def list_catalogued_workflow_ids() -> set[str]:
    ids: set[str] = set()
    for wf_id, wf in load_catalog()["workflows"].items():
        if wf.get("status") in (None, "catalogued"):
            ids.add(wf_id)
    return ids
