from __future__ import annotations

import json
from typing import Any

import yaml

from ..core.errors import RenderError


def _normalize(parsed: Any) -> Any:
    """Empty input resolves to an empty dict per project policy."""
    return {} if parsed is None else parsed


def parse_json(data: str) -> Any:
    try:
        return _normalize(json.loads(data))
    except json.JSONDecodeError as exc:
        raise RenderError(
            "parse_error",
            f"Invalid JSON: {exc.msg}",
            line=exc.lineno,
            column=exc.colno,
        ) from exc


def parse_yaml(data: str) -> Any:
    try:
        return _normalize(yaml.safe_load(data))
    except yaml.YAMLError as exc:
        line = column = None
        mark = getattr(exc, "problem_mark", None)
        if mark is not None:
            line = mark.line + 1
            column = mark.column + 1
        raise RenderError(
            "parse_error",
            f"Invalid YAML: {getattr(exc, 'problem', None) or str(exc)}",
            line=line,
            column=column,
        ) from exc


def parse_data(data: str, data_format: str) -> tuple[Any, str]:
    """Parse ``data`` according to ``data_format``.

    Returns a tuple of (parsed_value, detected_format). For ``auto`` the
    detection is deterministic: JSON is attempted first (strict), then YAML.
    Empty/whitespace-only input resolves to ``{}`` as JSON.
    """
    if data.strip() == "":
        return {}, "json"

    if data_format == "json":
        return parse_json(data), "json"
    if data_format == "yaml":
        return parse_yaml(data), "yaml"

    # auto: try JSON first, then fall back to YAML.
    try:
        return _normalize(json.loads(data)), "json"
    except json.JSONDecodeError:
        return parse_yaml(data), "yaml"
