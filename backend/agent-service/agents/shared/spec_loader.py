# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Load per-agent prompt and task specs from agents/<context>/."""
#
# from __future__ import annotations
#
# from pathlib import Path
# from typing import Any
#
# import yaml
#
# AGENTS_DIR = Path(__file__).resolve().parent.parent
#
# # Runtime context keys → on-disk folder names
# CONTEXT_FOLDERS: dict[str, str] = {
#     "create": "creative",
# }
#
#
# def agent_dir(context: str) -> Path:
#     folder = CONTEXT_FOLDERS.get(context, context)
#     return AGENTS_DIR / folder
#
#
# def _read_text(path: Path) -> str:
#     if not path.is_file():
#         return ""
#     return path.read_text(encoding="utf-8").strip()
#
#
# def _read_yaml(path: Path) -> dict[str, Any]:
#     if not path.is_file():
#         return {}
#     data = yaml.safe_load(path.read_text(encoding="utf-8"))
#     return data if isinstance(data, dict) else {}
#
#
# def has_agent_spec(context: str) -> bool:
#     return (agent_dir(context) / "profile.yaml").is_file()
#
#
# def load_profile(context: str) -> dict[str, str] | None:
#     data = _read_yaml(agent_dir(context) / "profile.yaml")
#     if not data:
#         return None
#     return {
#         "persona": str(data.get("persona", "")).strip(),
#         "role": str(data.get("role", "")).strip(),
#         "data_access": str(data.get("data_access") or data.get("dataAccess") or "").strip(),
#     }
#
#
# def load_assistant_name(context: str) -> str | None:
#     data = _read_yaml(agent_dir(context) / "profile.yaml")
#     name = data.get("name")
#     return str(name).strip() if name else None
#
#
# def load_specialist_instructions(context: str, **placeholders: str) -> str:
#     raw = _read_text(agent_dir(context) / "instructions.md")
#     if not raw:
#         return ""
#     try:
#         return raw.format(**placeholders).strip()
#     except KeyError:
#         return raw.strip()
#
#
# def load_tasks(context: str) -> dict[str, Any]:
#     return _read_yaml(agent_dir(context) / "tasks.yaml")
#
#
# def load_tool_instructions(context: str) -> str:
#     return str(load_tasks(context).get("tool_instructions", "")).strip()
