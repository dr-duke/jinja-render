from __future__ import annotations

from fastapi import APIRouter

from ...schemas.render import ExamplesResponse
from ...services.examples import EXAMPLES, default_example

router = APIRouter()


@router.get("/examples", response_model=ExamplesResponse)
def examples() -> ExamplesResponse:
    return ExamplesResponse(examples=EXAMPLES, default=default_example())
