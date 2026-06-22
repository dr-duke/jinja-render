from __future__ import annotations

import time

from fastapi import APIRouter, Request

from ...core.config import get_settings
from ...core.logging import get_logger
from ...core.security import check_data_depth, check_payload_sizes
from ...schemas.render import RenderMeta, RenderRequest, RenderResponse
from ...services.filters import filter_names_for_mode
from ...services.parsers import parse_data
from ...services.renderer import RenderOptions, render_template

router = APIRouter()
logger = get_logger()


@router.post("/render", response_model=RenderResponse)
def render(req: RenderRequest, request: Request) -> RenderResponse:
    settings = get_settings()
    start = time.perf_counter()
    request_id = getattr(request.state, "request_id", None)

    check_payload_sizes(
        req.template,
        req.data,
        max_template=settings.max_template_bytes,
        max_data=settings.max_data_bytes,
    )

    data_parsed, detected = parse_data(req.data, req.data_format)
    check_data_depth(data_parsed, max_depth=settings.max_data_depth)

    options = RenderOptions(
        trim=req.options.trim,
        lstrip=req.options.lstrip,
    )
    result = render_template(
        req.template,
        data_parsed,
        options,
        req.render_mode,
        timeout=settings.render_timeout_seconds,
    )

    duration_ms = int((time.perf_counter() - start) * 1000)
    logger.info(
        "render",
        extra={
            "jr_request_id": request_id,
            "jr_route": "/api/v1/render",
            "jr_render_mode": req.render_mode,
            "jr_status": "success",
            "jr_duration_ms": duration_ms,
            "jr_template_bytes": len(req.template.encode("utf-8")),
            "jr_data_bytes": len(req.data.encode("utf-8")),
        },
    )

    return RenderResponse(
        rendered=result.rendered,
        data_parsed=data_parsed,
        meta=RenderMeta(
            data_format_detected=detected,
            render_mode_applied=req.render_mode,
            filters_enabled=filter_names_for_mode(req.render_mode),
            duration_ms=duration_ms,
        ),
        warnings=result.warnings,
    )
