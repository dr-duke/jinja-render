from __future__ import annotations

from typing import Any

# Error type -> default HTTP status code.
ERROR_STATUS: dict[str, int] = {
    "validation_error": 422,
    "parse_error": 400,
    "template_syntax_error": 400,
    "template_runtime_error": 400,
    "undefined_error": 400,
    "unsupported_filter_error": 400,
    "timeout_error": 504,
    "rate_limit_error": 429,
    "internal_error": 500,
}


class RenderError(Exception):
    """Controlled, classified error raised by the render pipeline.

    Maps directly onto the structured error response contract.
    """

    def __init__(
        self,
        type_: str,
        message: str,
        *,
        line: int | None = None,
        column: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.type = type_
        self.message = message
        self.line = line
        self.column = column
        self.details = details or {}

    @property
    def status_code(self) -> int:
        return ERROR_STATUS.get(self.type, 400)

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "message": self.message,
            "line": self.line,
            "column": self.column,
            "details": self.details,
        }
