from __future__ import annotations

from fastapi import APIRouter

from ...schemas.render import CapabilitiesResponse
from ...services.filters import FILTER_NAMES
from ...services.renderer import RENDER_MODES

router = APIRouter()


@router.get("/capabilities", response_model=CapabilitiesResponse)
def capabilities() -> CapabilitiesResponse:
    return CapabilitiesResponse(
        render_modes=RENDER_MODES,
        options=["trim", "lstrip", "strict"],
        filters=FILTER_NAMES,
        data_formats=["auto", "yaml", "json"],
    )
