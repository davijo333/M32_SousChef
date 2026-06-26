#!/usr/bin/env python3
"""Generate core tool pages and Tool_Index.md from manifest.json."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).parent
MANIFEST = ROOT / "manifest.json"
OUT = ROOT
INDEX = ROOT.parent / "Tool_Index.md"


def built_line(built: str, tool_id: str) -> str:
    if built == "Yes":
        return "**Yes** — consolidated `@tool` shipped in `backend/agent-service-v1/tools/core/`."
    if built == "Partial":
        if tool_id == "upload_bills":
            return (
                "**Partial** — `upload_bills` summarizes the bill queue and routes PO vs SO; "
                "file parse still runs via Upload orders or chat attachments (UI pre-parse)."
            )
        return "**Partial** — consolidated `@tool` shipped; some internal actions remain manual-only."
    return "**No** — manual UI only; consolidated tool not implemented."


def render(tool: dict) -> str:
    agents = ", ".join(f"**{a}**" for a in tool["used_by"])
    actions = "\n".join(f"- `{a}`" for a in tool.get("internal_actions", []))
    confirm = tool["confirm"]
    confirm_note = {
        "Yes": "Destructive or persistent changes require chef confirmation (`confirm_inventory`, `confirm_business`, or `confirm_suggestion` in chat).",
        "No": "Read-only or navigation — no confirmation.",
        "N/A": "Recommendations only.",
    }.get(confirm, "")

    chat_note = (
        f"Chef invokes `{tool['id']}` with an `action` parameter (see internal actions)."
        if tool["built"] != "No"
        else f"Invoke `{tool['id']}` once Built? = Yes."
    )

    return f"""# `{tool["id"]}`

| Field | Value |
|-------|-------|
| **Primary agent** | {tool["agent"]} |
| **Used by** | {agents} |
| **Tier** | {tool["tier"]} |
| **Built?** | {tool["built"]} |
| **Confirm required?** | {confirm} |

## Summary

{tool["summary"]}

## Dual path

**Manual:** {tool["manual"]}

**Chat:** {chat_note}

## Wraps

`{tool["wraps"]}`

## Internal actions

The LLM sees **one** tool; the backend routes to:

{actions}

## Build status

{built_line(tool["built"], tool["id"])}

{confirm_note}

## See also

- [Tool Index](../Tool_Index.md)
- [{tool["agent"]} agent](../../../agents/{agent_slug(tool["agent"])}.md)
"""


def agent_slug(name: str) -> str:
    return {
        "Sous Chef": "sous-chef",
        "Inventory": "inventory",
        "Business": "business",
        "Creative": "creative",
    }[name]


def render_index(tools: list[dict]) -> str:
    yes = sum(1 for t in tools if t["built"] == "Yes")
    partial = sum(1 for t in tools if t["built"] == "Partial")
    no = sum(1 for t in tools if t["built"] == "No")
    rows = []
    for t in tools:
        used = ", ".join(t["used_by"])
        rows.append(
            f"| [`{t['id']}`](./tools/{t['id']}.md) | {t['agent']} | {used} | {t['tier']} | {t['built']} | {t['confirm']} |"
        )
    return (
        "# Tool Index\n\n"
        "Nine **core chat tools** (4 read · 4 write/orchestrate · 1 upload). "
        "Each wraps many internal actions — not 92 separate LLM tools.\n\n"
        "**Built?**\n"
        "- **Yes** — consolidated `@tool` in `backend/agent-service-v1/tools/core/`\n"
        "- **Partial** — tool shipped; some actions still manual/UI-only\n"
        "- **No** — not implemented\n\n"
        f"**Totals:** {len(tools)} core tools — Yes: {yes} · Partial: {partial} · No: {no}\n\n"
        "| Tool | Primary agent | Also used by | Tier | Built? | Confirm? |\n"
        "|------|---------------|--------------|------|--------|----------|\n"
        + "\n".join(rows)
        + "\n\n## By agent\n\n"
        "### Sous Chef\n"
        "- Read: [`query_kitchen`](./tools/query_kitchen.md)\n"
        "- Orchestrate: [`orchestrate`](./tools/orchestrate.md)\n\n"
        "### Inventory\n"
        "- Read: [`query_inventory`](./tools/query_inventory.md)\n"
        "- Write: [`apply_inventory`](./tools/apply_inventory.md)\n"
        "- Upload: [`upload_bills`](./tools/upload_bills.md)\n\n"
        "### Business\n"
        "- Read: [`query_business`](./tools/query_business.md)\n"
        "- Write: [`apply_business`](./tools/apply_business.md)\n\n"
        "### Creative\n"
        "- Read: [`query_menu`](./tools/query_menu.md)\n"
        "- Write: [`apply_menu`](./tools/apply_menu.md)\n\n"
        "## Code\n\n"
        "- Factory: `backend/agent-service-v1/tools/core/factory.py`\n"
        "- Reads: `backend/agent-service-v1/tools/core/reads.py`\n"
        "- Writes / pending actions: `backend/agent-service-v1/tools/core/writes.py`, `backend/api/services/agents/agent-pending-actions.ts`\n\n"
        "Agent profiles: [agents/](../../agents/README.md)\n"
    )


def main() -> None:
    tools = json.loads(MANIFEST.read_text())
    for tool in tools:
        (OUT / f"{tool['id']}.md").write_text(render(tool))
    INDEX.write_text(render_index(tools))
    print(f"Wrote {len(tools)} core tool docs + Tool_Index.md")


if __name__ == "__main__":
    main()
