"""Ansible-mode filter set.

Aggregates the emulated Ansible filter groups (``core``, ``mathstuff``, ``extra``)
into a single registry. These are exposed to templates ONLY in the ``ansible``
render mode; ``base`` and ``salt`` get plain Jinja2 with no project filters (see
``services.filters``).

Scope: this mirrors the *behavior* of frequently used Templar filters. It is not
an embedded Ansible runtime. Filters needing host/filesystem/network/secret
access are intentionally omitted to preserve the safe sandbox.
"""

from __future__ import annotations

from typing import Any

from . import core, extra, mathstuff


def build_ansible_filters() -> dict[str, Any]:
    filters: dict[str, Any] = {}
    filters.update(core.FILTERS)
    filters.update(mathstuff.FILTERS)
    filters.update(extra.FILTERS)
    return filters


ANSIBLE_FILTER_NAMES: list[str] = sorted(build_ansible_filters().keys())

# Name -> one-line description for the emulated ansible filters, aggregated from
# each group. Surfaced via /capabilities for the frontend autocomplete.
ANSIBLE_FILTER_DOCS: dict[str, str] = {**core.DOCS, **mathstuff.DOCS, **extra.DOCS}
