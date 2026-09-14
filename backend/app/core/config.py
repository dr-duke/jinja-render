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

    # Project metadata surfaced via GET /api/v1/info (and the OpenAPI version).
    # `version` is the single source of truth for the running version; CI sets it
    # from the pushed git tag (e.g. JR_version=0.0.3). Default tracks the current
    # release.
    version: str = "0.0.3"
    description: str = (
        "A safe, local-first Jinja2 playground: render templates against "
        "YAML/JSON data with structured diagnostics."
    )
    repository_url: str = "https://github.com/dr-duke/jinja-render"
    license_name: str = "MIT"

    # Guardrails (sizes in bytes).
    max_template_bytes: int = 512 * 1024  # 512 KB
    max_data_bytes: int = 1024 * 1024  # 1 MB
    max_data_depth: int = 50
    # Total node-visit budget when validating parsed data. Unlike max_data_bytes
    # (which bounds the *input* text), this bounds how large the parsed structure
    # is when fully traversed, catching YAML alias/anchor "billion laughs" bombs:
    # a few hundred input bytes can expand to a structure with billions of nodes
    # via shared references. The depth check and response serialization both
    # traverse the structure, so an unbounded expansion is a CPU/memory DoS.
    max_data_nodes: int = 2_000_000
    # Maximum size (in characters) of a single rendered output. Bounds the
    # response body and the memory a loop-heavy template can accumulate.
    max_output_bytes: int = 5 * 1024 * 1024  # ~5 MB

    # Rendering / worker pool.
    render_timeout_seconds: float = 2.0
    render_pool_size: int = 2

    # Rate limiting (in-process token bucket, per client key).
    rate_limit_enabled: bool = True
    rate_limit_requests_per_minute: int = 120
    rate_limit_burst: int = 40
    # Cap on the number of distinct client buckets kept in memory. Without this,
    # a client spoofing X-Forwarded-For could grow the map without bound. When
    # exceeded, fully-refilled (no longer limited) buckets are evicted first.
    rate_limit_max_buckets: int = 10_000
    # Number of trusted reverse proxies in front of the app. The client IP for
    # rate limiting is taken this many hops from the right of X-Forwarded-For, so
    # a client cannot spoof its identity by prepending fake entries. Set to the
    # actual number of proxies (e.g. 1 for a single ingress). 0 disables XFF
    # trust entirely and uses the direct connection address.
    trusted_proxy_hops: int = 1

    # Security response headers (defense-in-depth for the served SPA + API).
    security_headers_enabled: bool = True
    # Optional Content-Security-Policy header value. Empty = not sent. A known
    # compatible policy for the bundled SPA is documented in the README and k8s
    # ConfigMap; it is left opt-in so it can be validated against your build.
    content_security_policy: str = ""

    # ansible hostfacts emulation (deterministic, never reads real host facts).
    ansible_facts_enabled: bool = True
    ansible_facts_default: bool = True

    # API documentation endpoints.
    docs_swagger_path: str = "/swagger"
    openapi_url: str = "/openapi.json"

    # CORS origins for local dev (frontend Vite server).
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Static frontend serving. The single-container image builds the React/Vite
    # SPA and copies its dist/ into static_dir; FastAPI serves it (assets +
    # index.html SPA fallback) on the same origin as the API. When static_dir
    # does not exist (e.g. running the backend alone in local dev), static
    # serving is disabled gracefully and the API still works.
    static_dir: str = "/app/static"
    # Optional runtime CSS override file. If present it is served at /custom.css;
    # if absent, an empty no-op text/css 200 is returned (never 404). Defaults to
    # <static_dir>/custom.css when left empty.
    custom_css_path: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
