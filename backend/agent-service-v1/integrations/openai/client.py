"""OpenAI / LangChain model factory."""

from __future__ import annotations

from langchain_openai import ChatOpenAI

from config import settings


def chat_model(*, temperature: float | None = None, model: str | None = None) -> ChatOpenAI:
    from config.settings import settings

    return ChatOpenAI(
        model=model or settings.SUPERVISOR_MODEL,
        temperature=settings.SPECIALIST_TEMPERATURE if temperature is None else temperature,
        api_key=settings.OPENAI_API_KEY,
    )
