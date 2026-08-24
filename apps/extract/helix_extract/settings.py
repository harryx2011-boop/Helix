"""Configuration for helix-extract.

Provider credentials belong to the operator and arrive through the environment.
They are never accepted over the API, never logged, and never persisted: Helix
calls your models with your keys, and your provider bills you directly.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    port: int = 7402

    # --- LLM (BYOK) --------------------------------------------------------
    helix_llm_provider: str = "openai"
    helix_llm_model: str = "gpt-4o-mini"

    openai_api_key: str | None = None
    openai_base_url: str | None = None
    anthropic_api_key: str | None = None
    # Either name works for Gemini; the spec documents GOOGLE_API_KEY.
    gemini_api_key: str | None = None
    google_api_key: str | None = None
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openai_compatible_api_key: str | None = None
    openai_compatible_base_url: str | None = None

    # --- embeddings --------------------------------------------------------
    # Local by default, so chunking and vector sync need no keys and cost nothing.
    helix_embedding_provider: str = "local"
    helix_embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    voyage_api_key: str | None = None
    cohere_api_key: str | None = None

    @property
    def llm_configured(self) -> bool:
        return any(
            [
                self.openai_api_key,
                self.anthropic_api_key,
                self.gemini_api_key,
                self.google_api_key,
                self.openrouter_api_key,
                self.openai_compatible_api_key,
                self.openai_compatible_base_url,
            ]
        )

    @property
    def embedding_model(self) -> str:
        return self.helix_embedding_model


settings = Settings()
