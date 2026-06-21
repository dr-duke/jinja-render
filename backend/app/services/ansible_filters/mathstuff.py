"""Emulated Ansible ``mathstuff`` filters (ansible.plugins.filter.mathstuff).

Set operations here preserve input order and return lists, making the output
deterministic. Real Ansible may return an unordered ``set`` for hashable inputs;
this is a deliberate, documented divergence that suits a reproducible playground.

``unique``, ``min`` and ``max`` are intentionally NOT redefined — Jinja2 already
ships order-preserving, attribute-aware versions available in every mode.
"""

from __future__ import annotations

import itertools
from typing import Any

# ---- set-like operations (order preserving) ---------------------------------


def union(a: Any, b: Any) -> list:
    result = list(a)
    for item in b:
        if item not in result:
            result.append(item)
    return result


def intersect(a: Any, b: Any) -> list:
    b_list = list(b)
    result: list[Any] = []
    for item in a:
        if item in b_list and item not in result:
            result.append(item)
    return result


def difference(a: Any, b: Any) -> list:
    b_list = list(b)
    result: list[Any] = []
    for item in a:
        if item not in b_list and item not in result:
            result.append(item)
    return result


def symmetric_difference(a: Any, b: Any) -> list:
    a_list, b_list = list(a), list(b)
    result: list[Any] = []
    for item in a_list:
        if item not in b_list and item not in result:
            result.append(item)
    for item in b_list:
        if item not in a_list and item not in result:
            result.append(item)
    return result


# ---- structural --------------------------------------------------------------


def flatten(value: Any, levels: int | None = None, skip_nulls: bool = True) -> list:
    ret: list[Any] = []
    for element in value:
        if skip_nulls and element in (None, "None", "null"):
            continue
        if isinstance(element, (list, tuple)):
            if levels is None:
                ret.extend(flatten(element, skip_nulls=skip_nulls))
            elif levels >= 1:
                ret.extend(flatten(element, levels=levels - 1, skip_nulls=skip_nulls))
            else:
                ret.append(element)
        else:
            ret.append(element)
    return ret


# ---- iterators ---------------------------------------------------------------


def do_zip(*args: Any) -> list:
    return list(zip(*args))


def do_zip_longest(*args: Any, fillvalue: Any = None) -> list:
    return list(itertools.zip_longest(*args, fillvalue=fillvalue))


def do_product(*args: Any, repeat: int = 1) -> list:
    return list(itertools.product(*args, repeat=repeat))


FILTERS: dict[str, Any] = {
    "union": union,
    "intersect": intersect,
    "difference": difference,
    "symmetric_difference": symmetric_difference,
    "flatten": flatten,
    "zip": do_zip,
    "zip_longest": do_zip_longest,
    "product": do_product,
}
