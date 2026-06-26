"""Chef message intent — confirm gates and workflow start hints."""

from __future__ import annotations

import re
from typing import Any


def detect_save_confirm(message: str) -> bool:
    text = (message or "").strip().lower()
    if not text:
        return False
    return bool(
        re.search(
            r"\b(yes|confirm|go ahead|proceed|save(?:\s+it)?|do it|approved?|sure|looks good)\b",
            text,
        )
    )


def detect_reject_or_edit(message: str) -> bool:
    text = (message or "").strip().lower()
    if not text or detect_save_confirm(message):
        return False
    return bool(
        re.search(
            r"\b(no|nope|not\s+yet|wait|stop|cancel|change|edit|update|instead|replace)\b",
            text,
        )
    )


def detect_customize(message: str) -> bool:
    text = (message or "").strip().lower()
    if not text:
        return False
    return bool(
        re.search(
            r"\b(customize|customise|modify|change|edit|update|instead|without|don't use|dont use)\b",
            text,
        )
    )


def detect_workflow_cancel(message: str) -> bool:
    text = (message or "").strip()
    if not text:
        return False
    if match_workflow_start(text):
        return False
    return bool(re.search(r"\b(cancel|never\s*mind|forget\s+it|start\s+over|different\s+topic)\b", text, re.I))


def extract_named_entity(message: str) -> str:
    """Parse a dish/ingredient name from common add-to-menu phrasing."""
    text = (message or "").strip()
    if not text:
        return ""
    patterns = [
        r"(?i)(?:let'?s\s+)?(?:add|create|build)\s+(?:a\s+)?(?:new\s+)?(?:menu\s+)?dish\s+['\"]?([^'\".\n?]+?)['\"]?(?:\s+to\s+(?:the\s+)?(?:menu|kitchen))?(?:[.?!\n]|$)",
        r"(?i)(?:add|create)\s+(.+?)\s+to\s+(?:the\s+)?(?:menu|kitchen)",
        r"(?i)build\s+(?:a\s+)?recipe\s+for\s+(?:the\s+)?['\"]?([^'\".\n?]+?)['\"]?",
        r"(?i)(?:add|create)\s+(?:an?\s+)?ingredient\s+['\"]?([^'\".\n?]+?)['\"]?",
        r"(?i)(?:add|create)\s+(?:an?\s+)?add[\s-]?on\s+['\"]?([^'\".\n?]+?)['\"]?",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        name = re.sub(r"\*+", "", match.group(1)).strip().strip("'\"")
        name = re.sub(r"^(?:a|an|the)\s+", "", name, flags=re.I).strip()
        if name and len(name.split()) <= 8:
            return name
    return ""


def _trigger_matches(token: str, lower: str) -> bool:
    token = token.lower().strip()
    if not token:
        return False
    if token in lower:
        return True
    words = token.split()
    if len(words) >= 2:
        pattern = r"\b" + r"\b.*?\b".join(re.escape(w) for w in words) + r"\b"
        return bool(re.search(pattern, lower, re.I))
    return False


def match_workflow_start(
    message: str,
    catalog_draft: dict[str, Any] | None = None,
    *,
    upload_batch: dict[str, Any] | None = None,
) -> list[tuple[str, str]]:
    """Return (workflow_id, locked_name) candidates sorted by specificity."""
    from workflows.engine.loader import load_catalog
    from tools.core.bills import upload_batch_bill_type, upload_batch_is_mixed, upload_batch_ready

    lower = (message or "").lower()
    draft_type = str((catalog_draft or {}).get("itemType") or (catalog_draft or {}).get("item_type") or "").lower()
    locked = extract_named_entity(message) or str((catalog_draft or {}).get("name") or "").strip()

    hits: list[tuple[int, str, str]] = []
    for wf_id, wf in load_catalog()["workflows"].items():
        score = 0
        trigger_when = wf.get("trigger_when") or {}
        if trigger_when.get("catalog_draft_item_type"):
            expected = str(trigger_when["catalog_draft_item_type"]).lower()
            if draft_type and draft_type == expected:
                score += 50
            elif expected and not draft_type:
                continue

        if trigger_when.get("upload_batch_mixed"):
            if upload_batch and upload_batch_is_mixed(upload_batch):
                score += 55
            elif trigger_when["upload_batch_mixed"] and not upload_batch:
                continue

        if trigger_when.get("upload_batch_bill_type"):
            expected_bt = str(trigger_when["upload_batch_bill_type"]).lower()
            if upload_batch and upload_batch_ready(upload_batch):
                actual = upload_batch_bill_type(upload_batch).lower()
                if upload_batch_is_mixed(upload_batch):
                    if expected_bt == "customer":
                        score += 0
                    else:
                        score += 45 if actual == expected_bt else 0
                elif actual == expected_bt:
                    score += 50
            elif expected_bt and upload_batch and not upload_batch_ready(upload_batch):
                continue
            elif expected_bt and not upload_batch:
                pass

        for trigger in wf.get("trigger") or []:
            token = str(trigger).lower().strip()
            if token and _trigger_matches(token, lower):
                score += len(token)

        if score > 0:
            hits.append((score, wf_id, locked))

    for wf_id, name, score in _intent_workflow_hits(message, locked):
        hits.append((score, wf_id, name))

    hits.sort(key=lambda row: row[0], reverse=True)
    seen: set[str] = set()
    ordered: list[tuple[str, str]] = []
    for _, wf_id, name in hits:
        if wf_id in seen:
            continue
        seen.add(wf_id)
        ordered.append((wf_id, name))
    return ordered


def _intent_workflow_hits(message: str, locked: str) -> list[tuple[str, str, int]]:
    text = (message or "").strip()
    if not text:
        return []
    lower = text.lower()
    hits: list[tuple[str, str, int]] = []

    if re.search(r"(?i)\b(add|create|build)\b.+\b(menu|kitchen|dish|menu item)\b", text) and not re.search(
        r"(?i)\b(ingredient|pantry|add[\s-]?on|modifier)\b", text
    ):
        hits.append(("add_dish_from_chat", locked or extract_named_entity(text), 40))

    if re.search(r"(?i)\blet'?s\s+add\b.*\b(new\s+)?dish\b", text):
        hits.append(("add_dish_from_chat", locked or extract_named_entity(text), 42))

    if re.search(r"(?i)\b(add|create)\b.+\b(ingredient|pantry)\b", text):
        hits.append(("add_ingredient_from_chat", locked or extract_named_entity(text), 40))

    if re.search(r"(?i)\b(add|create)\b.+\badd[\s-]?on\b", text):
        hits.append(("add_addon_from_chat", locked or extract_named_entity(text), 40))

    if re.search(r"(?i)\b(low stock|running out|need to reorder)\b", lower):
        hits.append(("inventory_low_stock", "", 35))

    if re.search(r"(?i)\b(expiring|spoil|use before)\b", lower):
        hits.append(("inventory_expiring", "", 35))

    if re.search(r"(?i)\b(sales|pos totals|how did we do)\b", lower):
        hits.append(("business_sales_summary", "", 35))

    if re.search(r"(?i)\b(idea for today|what should i feature|inspire me|dish ideas)\b", lower):
        hits.append(("creative_cues", "", 35))

    if re.search(r"(?i)\b(process|upload).+\b(purchase|supplier|po|vendor)\b", lower) and not re.search(
        r"(?i)\bqueue\b", lower
    ):
        hits.append(("upload_purchase_orders", "", 38))

    if re.search(r"(?i)\b(process|upload).+\b(sales|pos|receipt|customer)\b", lower) and not re.search(
        r"(?i)\bqueue\b", lower
    ):
        hits.append(("upload_sales_orders", "", 38))

    if re.search(r"(?i)\b(mixed|both).+\b(bill|po|receipt)\b", lower):
        hits.append(("upload_mixed_bill_batch", "", 36))

    if re.search(r"(?i)\b(process|run).+\b(purchase|po).+\b(queue|bills?)\b", lower):
        hits.append(("process_purchase_bills", "", 37))

    if re.search(r"(?i)\b(process|run).+\b(sales|receipt|pos).+\b(queue|bills?)\b", lower):
        hits.append(("process_sales_bills", "", 37))

    return hits
