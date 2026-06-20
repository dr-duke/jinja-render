from __future__ import annotations

import time
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import JSONResponse, PlainTextResponse

from .api.v1 import capabilities, examples, render
from .core.config import get_settings
from .core.errors import RenderError
from .core.logging import configure_logging, get_logger
from .core.ratelimit import TokenBucketRateLimiter, client_key
from .services.renderer import get_pool

logger = get_logger()

# Lightweight in-process metrics (no external deps).
_metrics: dict[str, int] = {"render_requests_total": 0, "render_errors_total": 0}
_error_counters: dict[str, int] = {}

API_PREFIX = "/api/v1"


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    # Swagger UI is published explicitly at settings.docs_swagger_path; disable
    # the built-in /docs to keep a single canonical docs endpoint.
    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=settings.openapi_url,
    )

    rate_limiter = TokenBucketRateLimiter(
        requests_per_minute=settings.rate_limit_requests_per_minute,
        burst=settings.rate_limit_burst,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def rate_limit(request: Request, call_next):  # type: ignore[no-untyped-def]
        if settings.rate_limit_enabled and request.url.path.startswith(API_PREFIX):
            allowed, retry_after = rate_limiter.check(client_key(request))
            if not allowed:
                _error_counters["rate_limit_error"] = (
                    _error_counters.get("rate_limit_error", 0) + 1
                )
                retry_secs = max(1, int(retry_after + 0.999))
                return JSONResponse(
                    status_code=429,
                    headers={"Retry-After": str(retry_secs)},
                    content={
                        "success": False,
                        "error": {
                            "type": "rate_limit_error",
                            "message": "Rate limit exceeded. Try again later.",
                            "line": None,
                            "column": None,
                            "details": {"retry_after_seconds": retry_secs},
                        },
                        "meta": {"duration_ms": 0},
                    },
                )
        return await call_next(request)

    @app.middleware("http")
    async def request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
        request.state.request_id = request.headers.get("x-request-id", uuid.uuid4().hex)
        start = time.perf_counter()
        if request.url.path == f"{API_PREFIX}/render":
            _metrics["render_requests_total"] += 1
        response = await call_next(request)
        response.headers["x-request-id"] = request.state.request_id
        logger.info(
            "request",
            extra={
                "jr_request_id": request.state.request_id,
                "jr_route": request.url.path,
                "jr_status_code": response.status_code,
                "jr_duration_ms": int((time.perf_counter() - start) * 1000),
            },
        )
        return response

    @app.exception_handler(RenderError)
    async def render_error_handler(request: Request, exc: RenderError) -> JSONResponse:
        _metrics["render_errors_total"] += 1
        _error_counters[exc.type] = _error_counters.get(exc.type, 0) + 1
        logger.warning(
            "render_error",
            extra={
                "jr_request_id": getattr(request.state, "request_id", None),
                "jr_route": request.url.path,
                "jr_error_type": exc.type,
            },
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "error": exc.to_dict(),
                "meta": {"duration_ms": 0},
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        _error_counters["validation_error"] = _error_counters.get("validation_error", 0) + 1
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "error": {
                    "type": "validation_error",
                    "message": "Request validation failed.",
                    "line": None,
                    "column": None,
                    "details": {"errors": [str(e.get("msg", e)) for e in exc.errors()]},
                },
                "meta": {"duration_ms": 0},
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        # Never leak stack traces to clients; log full detail server-side.
        logger.exception(
            "internal_error",
            extra={
                "jr_request_id": getattr(request.state, "request_id", None),
                "jr_route": request.url.path,
            },
        )
        _metrics["render_errors_total"] += 1
        _error_counters["internal_error"] = _error_counters.get("internal_error", 0) + 1
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": {
                    "type": "internal_error",
                    "message": "An unexpected internal error occurred.",
                    "line": None,
                    "column": None,
                    "details": {},
                },
                "meta": {"duration_ms": 0},
            },
        )

    app.include_router(render.router, prefix=API_PREFIX, tags=["render"])
    app.include_router(capabilities.router, prefix=API_PREFIX, tags=["capabilities"])
    app.include_router(examples.router, prefix=API_PREFIX, tags=["examples"])

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/livez")
    def livez() -> dict[str, str]:
        # Liveness: the process is up and the event loop is responsive.
        return {"status": "ok"}

    @app.get("/readyz")
    def readyz() -> JSONResponse:
        # Readiness: the render worker pool can accept work and config loaded.
        pool_ready = get_pool().is_ready()
        checks = {"render_pool": pool_ready, "config": True}
        ready = all(checks.values())
        return JSONResponse(
            status_code=200 if ready else 503,
            content={"status": "ok" if ready else "not_ready", "checks": checks},
        )

    @app.get(settings.docs_swagger_path, include_in_schema=False)
    def swagger_ui() -> object:
        return get_swagger_ui_html(
            openapi_url=settings.openapi_url,
            title=f"{settings.app_name} - Swagger UI",
        )

    @app.get("/metrics", response_class=PlainTextResponse)
    def metrics() -> str:
        lines = [
            "# HELP render_requests_total Total render requests.",
            "# TYPE render_requests_total counter",
            f"render_requests_total {_metrics['render_requests_total']}",
            "# HELP render_errors_total Total render errors.",
            "# TYPE render_errors_total counter",
            f"render_errors_total {_metrics['render_errors_total']}",
        ]
        for err_type, count in sorted(_error_counters.items()):
            lines.append(f'render_errors_by_type{{type="{err_type}"}} {count}')
        return "\n".join(lines) + "\n"

    return app


app = create_app()
