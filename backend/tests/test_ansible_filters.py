from __future__ import annotations

import pytest

from app.core.errors import RenderError
from app.services.ansible_filters.core import (
    b64decode,
    b64encode,
    combine,
    comment,
    dict2items,
    do_bool,
    from_json,
    from_yaml,
    from_yaml_all,
    items2dict,
    mandatory,
    regex_findall,
    regex_replace,
    regex_search,
    ternary,
    to_json,
    to_nice_json,
    to_yaml,
    type_debug,
)
from app.services.ansible_filters.mathstuff import (
    difference,
    flatten,
    intersect,
    symmetric_difference,
    union,
)


# ---- serialization -----------------------------------------------------------


def test_to_json_and_from_json_roundtrip():
    assert from_json(to_json({"b": 1, "a": 2})) == {"b": 1, "a": 2}


def test_to_nice_json_is_sorted_and_indented():
    out = to_nice_json({"b": 1, "a": 2})
    assert out.splitlines()[0] == "{"
    assert out.index('"a"') < out.index('"b"')


def test_to_yaml_block_style():
    out = to_yaml({"name": "node01"})
    assert "name: node01" in out


def test_from_yaml_and_all():
    assert from_yaml("a: 1\nb: 2") == {"a": 1, "b": 2}
    docs = from_yaml_all("a: 1\n---\nb: 2")
    assert docs == [{"a": 1}, {"b": 2}]


# ---- encoding ----------------------------------------------------------------


def test_b64_roundtrip():
    assert b64decode(b64encode("router-01")) == "router-01"
    assert b64encode("router-01") == "cm91dGVyLTAx"


# ---- coercion / control flow -------------------------------------------------


@pytest.mark.parametrize(
    "value,expected",
    [("yes", True), ("no", False), ("true", True), ("0", False), (1, True), (0, False)],
)
def test_bool(value, expected):
    assert do_bool(value) is expected


def test_bool_unknown_is_false():
    assert do_bool("maybe") is False


def test_ternary():
    assert ternary(True, "a", "b") == "a"
    assert ternary(False, "a", "b") == "b"
    assert ternary(None, "a", "b", "c") == "c"


def test_type_debug():
    assert type_debug({}) == "dict"
    assert type_debug([]) == "list"
    assert type_debug("x") == "str"


def test_mandatory_passes_through_defined():
    assert mandatory("ok") == "ok"


def test_mandatory_raises_on_undefined():
    from jinja2 import Undefined

    with pytest.raises(RenderError) as exc:
        mandatory(Undefined(name="missing"))
    assert exc.value.type == "undefined_error"


# ---- combine / dict helpers --------------------------------------------------


def test_combine_shallow():
    assert combine({"a": 1}, {"b": 2}) == {"a": 1, "b": 2}
    assert combine({"a": 1}, {"a": 2}) == {"a": 2}


def test_combine_recursive():
    result = combine({"a": {"x": 1}}, {"a": {"y": 2}}, recursive=True)
    assert result == {"a": {"x": 1, "y": 2}}


def test_combine_recursive_off_replaces_nested():
    result = combine({"a": {"x": 1}}, {"a": {"y": 2}}, recursive=False)
    assert result == {"a": {"y": 2}}


def test_combine_list_merge_append():
    result = combine({"l": [1, 2]}, {"l": [2, 3]}, recursive=True, list_merge="append")
    assert result == {"l": [1, 2, 2, 3]}


def test_combine_list_merge_append_rp():
    result = combine(
        {"l": [1, 2]}, {"l": [2, 3]}, recursive=True, list_merge="append_rp"
    )
    assert result == {"l": [1, 2, 3]}


def test_combine_rejects_non_dict():
    with pytest.raises(RenderError):
        combine({"a": 1}, ["nope"])


def test_combine_rejects_bad_list_merge():
    with pytest.raises(RenderError):
        combine({"a": 1}, {"b": 2}, list_merge="bogus")


def test_dict2items_and_back():
    items = dict2items({"a": 1, "b": 2})
    assert items == [{"key": "a", "value": 1}, {"key": "b", "value": 2}]
    assert items2dict(items) == {"a": 1, "b": 2}


def test_dict2items_custom_names():
    items = dict2items({"a": 1}, key_name="k", value_name="v")
    assert items == [{"k": "a", "v": 1}]


# ---- regex -------------------------------------------------------------------


def test_regex_replace():
    assert regex_replace("foobar", "o+", "0") == "f0bar"


def test_regex_replace_ignorecase():
    assert regex_replace("FOO", "foo", "x", ignorecase=True) == "x"


def test_regex_search_group():
    assert regex_search("server-42", r"server-(\d+)", r"\1") == ["42"]


def test_regex_search_no_match_is_none():
    assert regex_search("abc", r"\d+") is None


def test_regex_findall():
    assert regex_findall("a1b2c3", r"\d") == ["1", "2", "3"]


# ---- comment -----------------------------------------------------------------


def test_comment_plain():
    assert comment("hello") == "#\n# hello\n#"


def test_comment_cblock():
    assert comment("hello", style="cblock") == "/*\n * hello\n */"


# ---- mathstuff ---------------------------------------------------------------


def test_union_preserves_order():
    assert union([1, 2], [2, 3]) == [1, 2, 3]


def test_intersect():
    assert intersect([1, 2, 3], [2, 3, 4]) == [2, 3]


def test_difference():
    assert difference([1, 2, 3], [2]) == [1, 3]


def test_symmetric_difference():
    assert symmetric_difference([1, 2, 3], [2, 3, 4]) == [1, 4]


def test_flatten():
    assert flatten([1, [2, [3, [4]]]]) == [1, 2, 3, 4]


def test_flatten_levels():
    assert flatten([1, [2, [3]]], levels=1) == [1, 2, [3]]


def test_flatten_skips_nulls():
    assert flatten([1, None, 2]) == [1, 2]
