from __future__ import annotations

import pytest

from app.core.errors import RenderError
from app.services.parsers import parse_data


def test_json_parse_success():
    parsed, fmt = parse_data('{"a": 1, "b": [1, 2]}', "json")
    assert parsed == {"a": 1, "b": [1, 2]}
    assert fmt == "json"


def test_yaml_parse_success():
    parsed, fmt = parse_data("a: 1\nb:\n  - x\n  - y\n", "yaml")
    assert parsed == {"a": 1, "b": ["x", "y"]}
    assert fmt == "yaml"


def test_auto_detects_json_first():
    parsed, fmt = parse_data('{"k": "v"}', "auto")
    assert fmt == "json"
    assert parsed == {"k": "v"}


def test_auto_falls_back_to_yaml():
    parsed, fmt = parse_data("k: v\n", "auto")
    assert fmt == "yaml"
    assert parsed == {"k": "v"}


def test_empty_input_is_empty_dict():
    parsed, fmt = parse_data("   ", "auto")
    assert parsed == {}


def test_invalid_json_raises_parse_error():
    with pytest.raises(RenderError) as exc:
        parse_data("{bad json", "json")
    assert exc.value.type == "parse_error"


def test_invalid_yaml_raises_parse_error():
    with pytest.raises(RenderError) as exc:
        parse_data("a:\n  - b\n - c\n", "yaml")
    assert exc.value.type == "parse_error"
