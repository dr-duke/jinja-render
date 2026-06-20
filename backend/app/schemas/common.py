from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ErrorDetail(BaseModel):
    type: str
    message: str
    line: int | None = None
    column: int | None = None
    details: dict[str, Any] = {}


class ErrorMeta(BaseModel):
    duration_ms: int


class ErrorResponse(BaseModel):
    success: bool = False
    error: ErrorDetail
    meta: ErrorMeta
