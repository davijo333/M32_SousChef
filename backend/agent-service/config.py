# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Shared agent service settings — loads backend/agent-service/.env via pydantic-settings."""
#
# from pydantic_settings import BaseSettings, SettingsConfigDict
#
#
# class Settings(BaseSettings):
#     model_config = SettingsConfigDict(env_file=".env", extra="ignore")
#
#     OPENAI_API_KEY: str = ""
#     MONGODB_URI: str = "mongodb://localhost:27017/sous_chef"
#
#
# settings = Settings()
