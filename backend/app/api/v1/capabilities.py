from __future__ import annotations

from fastapi import APIRouter

from ...schemas.render import CapabilitiesResponse
from ...services.filters import filter_names_for_mode
from ...services.renderer import RENDER_MODES

router = APIRouter()


@router.get("/capabilities", response_model=CapabilitiesResponse)
def capabilities() -> CapabilitiesResponse:
    filters_by_mode = {mode: filter_names_for_mode(mode) for mode in RENDER_MODES}
    all_filters = sorted({f for names in filters_by_mode.values() for f in names})
    return CapabilitiesResponse(
        render_modes=RENDER_MODES,
        options=["trim", "lstrip", "strict"],
        filters=all_filters,
        filters_by_mode=filters_by_mode,
        data_formats=["auto", "yaml", "json"],
    )
