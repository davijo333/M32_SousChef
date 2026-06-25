"""Dish pricing reads — re-exports canonical catalog_reads formatters."""

from tools.core.catalog_reads import (
    format_dish_pricing_text,
    format_margin_rankings,
)

__all__ = ["format_dish_pricing_text", "format_margin_rankings"]
