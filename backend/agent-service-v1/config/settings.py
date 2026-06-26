"""Application settings."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    OPENAI_API_KEY: str = ""
    MONGODB_URI: str = "mongodb://localhost:27017/sous_chef"
    AGENT_SERVICE_PORT: int = 8000
    LOG_LEVEL: str = "info"

    # Model defaults — specialists use 0 for structured steps
    SUPERVISOR_MODEL: str = "gpt-4o-mini"
    SUPERVISOR_TEMPERATURE: float = 0.35
    SPECIALIST_MODEL: str = "gpt-4o-mini"
    SPECIALIST_TEMPERATURE: float = 0.0


settings = Settings()
