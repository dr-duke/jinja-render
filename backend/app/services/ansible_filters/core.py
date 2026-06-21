"""Emulated Ansible ``core`` filters (ansible.plugins.filter.core).

These mirror the *behavior* of the most commonly used filters from Ansible's
Templar. They are pure Python callables — no filesystem, network, or secret
access — so they stay within this project's safe-sandbox model. Filters that
would require host access (vault, fileglob, expanduser/realpath, lookups) are
intentionally NOT implemented.
"""

from __future__ import annotations

import base64
import json
import re
import shlex
from typing import Any

import yaml
from jinja2 import Undefined

from ...core.errors import RenderError

# ---- serialization -----------------------------------------------------------


def to_json(value: Any, **kwargs: Any) -> str:
    return json.dumps(value, default=str, **kwargs)


def to_nice_json(value: Any, indent: int = 4, sort_keys: bool = True, **kwargs: Any) -> str:
    return json.dumps(
        value,
        indent=indent,
        sort_keys=sort_keys,
        separators=(",", ": "),
        default=str,
        **kwargs,
    )


def from_json(value: Any) -> Any:
    return json.loads(value)


def to_yaml(value: Any, default_flow_style: bool | None = None, **kwargs: Any) -> str:
    return yaml.dump(
        value, allow_unicode=True, default_flow_style=default_flow_style, **kwargs
    )


def to_nice_yaml(value: Any, indent: int = 4, **kwargs: Any) -> str:
    return yaml.dump(
        value, indent=indent, allow_unicode=True, default_flow_style=False, **kwargs
    )


def from_yaml(value: Any) -> Any:
    if isinstance(value, str):
        return yaml.safe_load(value)
    return value


def from_yaml_all(value: Any) -> Any:
    if isinstance(value, str):
        return list(yaml.safe_load_all(value))
    return value


# ---- encoding ----------------------------------------------------------------


def b64encode(value: Any, encoding: str = "utf-8") -> str:
    return base64.b64encode(str(value).encode(encoding)).decode("ascii")


def b64decode(value: Any, encoding: str = "utf-8") -> str:
    return base64.b64decode(str(value).encode("ascii")).decode(encoding)


# ---- type coercion / control flow -------------------------------------------

_BOOL_TRUE = frozenset({"yes", "on", "1", "true", "t", "y"})


def do_bool(value: Any) -> bool:
    """Ansible ``bool`` filter — lenient coercion (unknown tokens -> False)."""
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    return str(value).strip().lower() in _BOOL_TRUE


def ternary(value: Any, true_val: Any, false_val: Any, none_val: Any = None) -> Any:
    if value is None and none_val is not None:
        return none_val
    return true_val if bool(value) else false_val


def mandatory(value: Any, msg: str | None = None) -> Any:
    if isinstance(value, Undefined):
        raise RenderError(
            "undefined_error", msg or "Mandatory variable has not been overridden."
        )
    return value


def type_debug(value: Any) -> str:
    return type(value).__name__


def quote(value: Any) -> str:
    return shlex.quote(str(value))


# ---- dict / merge helpers ----------------------------------------------------

_LIST_MERGE_CHOICES = (
    "replace",
    "keep",
    "append",
    "prepend",
    "append_rp",
    "prepend_rp",
)


def _merge_list(x: list, y: list, list_merge: str) -> list:
    if list_merge == "replace":
        return y
    if list_merge == "keep":
        return x
    if list_merge == "append":
        return x + y
    if list_merge == "prepend":
        return y + x
    if list_merge == "append_rp":
        return [i for i in x if i not in y] + y
    if list_merge == "prepend_rp":
        return y + [i for i in x if i not in y]
    return y


def _merge_hash(x: dict, y: dict, recursive: bool, list_merge: str) -> dict:
    if not recursive and list_merge == "replace":
        merged = x.copy()
        merged.update(y)
        return merged
    merged = x.copy()
    for key, y_value in y.items():
        if key not in merged:
            merged[key] = y_value
            continue
        x_value = merged[key]
        if isinstance(x_value, dict) and isinstance(y_value, dict):
            merged[key] = (
                _merge_hash(x_value, y_value, recursive, list_merge)
                if recursive
                else y_value
            )
        elif isinstance(x_value, list) and isinstance(y_value, list):
            merged[key] = _merge_list(x_value, y_value, list_merge)
        else:
            merged[key] = y_value
    return merged


def combine(*terms: Any, recursive: bool = False, list_merge: str = "replace") -> dict:
    if list_merge not in _LIST_MERGE_CHOICES:
        raise RenderError(
            "template_runtime_error",
            f"combine: unknown list_merge {list_merge!r}; "
            f"expected one of {', '.join(_LIST_MERGE_CHOICES)}.",
        )
    # terms may include lists of dicts; flatten one level (Ansible behavior).
    flat: list[Any] = []
    for term in terms:
        if isinstance(term, list):
            flat.extend(term)
        else:
            flat.append(term)
    for term in flat:
        if not isinstance(term, dict):
            raise RenderError(
                "template_runtime_error",
                "combine: all arguments must be dictionaries.",
            )
    result: dict = {}
    for term in flat:
        result = _merge_hash(result, term, recursive, list_merge)
    return result


def dict2items(value: Any, key_name: str = "key", value_name: str = "value") -> list:
    if not isinstance(value, dict):
        raise RenderError(
            "template_runtime_error",
            f"dict2items requires a dictionary, got {type(value).__name__}.",
        )
    return [{key_name: k, value_name: v} for k, v in value.items()]


def items2dict(value: Any, key_name: str = "key", value_name: str = "value") -> dict:
    if not isinstance(value, list):
        raise RenderError(
            "template_runtime_error",
            f"items2dict requires a list, got {type(value).__name__}.",
        )
    try:
        return {item[key_name]: item[value_name] for item in value}
    except (KeyError, TypeError) as exc:
        raise RenderError(
            "template_runtime_error",
            f"items2dict: each element needs {key_name!r} and {value_name!r} keys.",
        ) from exc


# ---- regex -------------------------------------------------------------------


def _regex_flags(ignorecase: bool, multiline: bool) -> int:
    flags = 0
    if ignorecase:
        flags |= re.IGNORECASE
    if multiline:
        flags |= re.MULTILINE
    return flags


def regex_replace(
    value: Any,
    pattern: str,
    replacement: str = "",
    ignorecase: bool = False,
    multiline: bool = False,
) -> str:
    return re.sub(
        pattern, replacement, str(value), flags=_regex_flags(ignorecase, multiline)
    )


def regex_search(value: Any, regex: str, *args: str, **kwargs: Any) -> Any:
    """Return the first match (or named/numbered groups), else ``None``."""
    flags = _regex_flags(
        bool(kwargs.get("ignorecase", False)), bool(kwargs.get("multiline", False))
    )
    groups: list[Any] = []
    for arg in args:
        named = re.match(r"^\\g<(\S+)>$", arg)
        numbered = re.match(r"^\\(\d+)$", arg)
        if named:
            groups.append(named.group(1))
        elif numbered:
            groups.append(int(numbered.group(1)))
        else:
            raise RenderError(
                "template_runtime_error",
                f"regex_search: unknown group specifier {arg!r}.",
            )
    match = re.search(regex, str(value), flags)
    if not match:
        return None
    if not groups:
        return match.group()
    return [match.group(g) for g in groups]


def regex_findall(
    value: Any, regex: str, ignorecase: bool = False, multiline: bool = False
) -> list:
    return re.findall(regex, str(value), _regex_flags(ignorecase, multiline))


def regex_escape(value: Any, re_type: str = "python") -> str:
    text = str(value)
    if re_type == "python":
        return re.escape(text)
    if re_type == "posix_basic":
        # POSIX BRE: only these are special and need escaping.
        return re.sub(r"([.^$*\[\]\\])", r"\\\1", text)
    raise RenderError(
        "template_runtime_error",
        f"regex_escape: unknown re_type {re_type!r} (use 'python' or 'posix_basic').",
    )


# ---- comments ----------------------------------------------------------------

_COMMENT_STYLES: dict[str, dict[str, Any]] = {
    "plain": {"decoration": "# ", "prefix": "#", "postfix": "#"},
    "erlang": {"decoration": "% ", "prefix": "%", "postfix": "%"},
    "c": {"decoration": "// ", "prefix": "//", "postfix": "//"},
    "cblock": {"beginning": "/*", "decoration": " * ", "end": " */"},
    "xml": {"beginning": "<!--", "decoration": " - ", "end": "-->"},
}


def comment(text: Any, style: str = "plain", **kwargs: Any) -> str:
    params: dict[str, Any] = {
        "decoration": "# ",
        "beginning": "",
        "prefix": "",
        "prefix_count": 1,
        "postfix": "",
        "postfix_count": 1,
        "end": "",
    }
    params.update(_COMMENT_STYLES.get(style, {}))
    params.update(kwargs)

    lines = str(text).splitlines() or [""]
    body = "\n".join(params["decoration"] + line for line in lines)

    out: list[str] = []
    if params["beginning"]:
        out.append(params["beginning"])
    if params["prefix"]:
        out.extend([params["prefix"]] * params["prefix_count"])
    out.append(body)
    if params["postfix"]:
        out.extend([params["postfix"]] * params["postfix_count"])
    if params["end"]:
        out.append(params["end"])
    return "\n".join(out)


FILTERS: dict[str, Any] = {
    "to_json": to_json,
    "to_nice_json": to_nice_json,
    "from_json": from_json,
    "to_yaml": to_yaml,
    "to_nice_yaml": to_nice_yaml,
    "from_yaml": from_yaml,
    "from_yaml_all": from_yaml_all,
    "b64encode": b64encode,
    "b64decode": b64decode,
    "bool": do_bool,
    "ternary": ternary,
    "mandatory": mandatory,
    "type_debug": type_debug,
    "quote": quote,
    "combine": combine,
    "dict2items": dict2items,
    "items2dict": items2dict,
    "regex_replace": regex_replace,
    "regex_search": regex_search,
    "regex_findall": regex_findall,
    "regex_escape": regex_escape,
    "comment": comment,
}
