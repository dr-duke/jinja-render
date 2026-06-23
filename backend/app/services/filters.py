from __future__ import annotations

from typing import Any

from .ansible_filters import (
    ANSIBLE_FILTER_DOCS,
    ANSIBLE_FILTER_NAMES,
    build_ansible_filters,
)

# There are no project filters common to every mode. ``base`` and ``salt`` use
# only Jinja2's built-in filters; the emulated Ansible set (including hash and
# ipaddr, which are NOT Jinja2 built-ins) is exposed only in ``ansible`` mode.


def filters_for_mode(render_mode: str) -> dict[str, Any]:
    """Build the project filter set for a render mode.

    Only ``ansible`` gets project filters (the emulated Templar set). ``base``
    and ``salt`` get an empty set and thus rely solely on Jinja2 built-ins.
    """
    if render_mode == "ansible":
        return build_ansible_filters()
    return {}


def filter_names_for_mode(render_mode: str) -> list[str]:
    """Names of project filters enabled for a render mode (meta/capabilities)."""
    if render_mode == "ansible":
        return list(ANSIBLE_FILTER_NAMES)
    return []


def filter_descriptions() -> dict[str, str]:
    """Name -> one-line description for every emulated (ansible-only) filter.

    Built-in Jinja2 filters are intentionally excluded — they are not registered
    by this app and the frontend documents them on its own.
    """
    return dict(ANSIBLE_FILTER_DOCS)
