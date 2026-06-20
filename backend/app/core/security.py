from __future__ import annotations

from .errors import RenderError


def check_payload_sizes(template: str, data: str, *, max_template: int, max_data: int) -> None:
    """Reject oversized payloads before any expensive work."""
    if len(template.encode("utf-8")) > max_template:
        raise RenderError(
            "validation_error",
            f"Template exceeds maximum size of {max_template} bytes.",
        )
    if len(data.encode("utf-8")) > max_data:
        raise RenderError(
            "validation_error",
            f"Data payload exceeds maximum size of {max_data} bytes.",
        )


def check_data_depth(value: object, *, max_depth: int) -> None:
    """Guard against deeply nested parsed structures (DoS protection)."""

    def _depth(obj: object, current: int) -> int:
        if current > max_depth:
            raise RenderError(
                "validation_error",
                f"Parsed data exceeds maximum nesting depth of {max_depth}.",
            )
        if isinstance(obj, dict):
            if not obj:
                return current
            return max(_depth(v, current + 1) for v in obj.values())
        if isinstance(obj, (list, tuple)):
            if not obj:
                return current
            return max(_depth(v, current + 1) for v in obj)
        return current

    _depth(value, 0)
