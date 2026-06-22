from __future__ import annotations

from fastapi import APIRouter

from ...core.config import get_settings
from ...schemas.render import InfoResponse

router = APIRouter()


@router.get("/info", response_model=InfoResponse)
def info() -> InfoResponse:
    """Project metadata for the UI's info popover: name, description, current
    version, repository link, and license."""
    s = get_settings()
    return InfoResponse(
        name=s.app_name,
        description=s.description,
        version=s.version,
        repository=s.repository_url,
        license=s.license_name,
    )
