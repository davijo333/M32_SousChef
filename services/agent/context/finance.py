"""Finance period helpers — mirrors apps/web/src/lib/dashboard-stats.ts."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

FinancePeriod = Literal["week", "biweek", "month", "quarter"]


@dataclass
class FinancePeriodRange:
    start: datetime
    end: datetime
    label: str


def parse_finance_period(value: str | None) -> FinancePeriod:
    if value in ("biweek", "month", "quarter"):
        return value
    return "week"


def finance_period_range(period: FinancePeriod, now: datetime | None = None) -> FinancePeriodRange:
    end = now or datetime.now()
    end = end.replace(hour=23, minute=59, second=59, microsecond=999000)
    start = end.replace(hour=0, minute=0, second=0, microsecond=0)

    if period == "week":
        start = start - timedelta(days=6)
        return FinancePeriodRange(start=start, end=end, label="past 7 days")
    if period == "biweek":
        start = start - timedelta(days=13)
        return FinancePeriodRange(start=start, end=end, label="past 14 days")
    if period == "month":
        start = start.replace(day=1)
        return FinancePeriodRange(
            start=start,
            end=end,
            label=start.strftime("%B %Y"),
        )
    quarter_start_month = (start.month - 1) // 3 * 3 + 1
    start = start.replace(month=quarter_start_month, day=1)
    quarter = (quarter_start_month - 1) // 3 + 1
    return FinancePeriodRange(start=start, end=end, label=f"Q{quarter} {start.year}")


def order_in_period(order: dict, period: FinancePeriodRange) -> bool:
    raw = order.get("saleDate") or order.get("purchaseDate") or order.get("uploadDate")
    if raw is None:
        return False
    if isinstance(raw, str):
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return False
    else:
        dt = raw
    if dt.tzinfo is not None:
        dt = dt.replace(tzinfo=None)
    return period.start <= dt <= period.end


def line_total(item: dict) -> float:
    return float(item.get("price", 0) or 0) * float(item.get("qty", 0) or 0)
