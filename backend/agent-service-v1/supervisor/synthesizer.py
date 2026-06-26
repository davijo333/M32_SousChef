"""Assemble Sous Chef reply — delegates to head LLM with fallbacks."""

from supervisor.head_llm import synthesize_reply

__all__ = ["synthesize_reply"]
