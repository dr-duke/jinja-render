from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralized configuration and guardrails.

    All values are overridable via environment variables (prefix ``JR_``).
    This is the single source of configuration for the backend; avoid
    hardcoding limits or feature switches elsewhere.
    """

    model_config = SettingsConfigDict(env_prefix="JR_", env_file=".env", extra="ignore")

    app_name: str = "jinja-render"
    debug: bool = False

    # Guardrails (sizes in bytes).
    max_template_bytes: int = 512 * 1024  # 512 KB
    max_data_bytes: int = 1024 * 1024  # 1 MB
    max_data_depth: int = 50

    # Rendering / worker pool.
    render_timeout_seconds: float = 2.0
    render_pool_size: int = 2

    # Rate limiting (in-process token bucket, per client key).
    rate_limit_enabled: bool = True
    rate_limit_requests_per_minute: int = 120
    rate_limit_burst: int = 40

    # ansible hostfacts emulation (deterministic, never reads real host facts).
    ansible_facts_enabled: bool = True
    ansible_facts_default: bool = True

    # API documentation endpoints.
    docs_swagger_path: str = "/swagger"
    openapi_url: str = "/openapi.json"

    # CORS origins for local dev (frontend Vite server).
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
