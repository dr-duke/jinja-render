"""Ansible-mode filter set.

Aggregates the emulated Ansible filter groups (``core``, ``mathstuff``) into a
single registry. These are exposed to templates ONLY in the ``ansible`` render
mode; ``base`` and ``salt`` keep the common filter set (see ``services.filters``).

Scope: this mirrors the *behavior* of frequently used Templar filters. It is not
an embedded Ansible runtime. Filters needing host/filesystem/network/secret
access are intentionally omitted to preserve the safe sandbox.
"""

from __future__ import annotations

from typing import Any

from . import core, mathstuff


def build_ansible_filters() -> dict[str, Any]:
    filters: dict[str, Any] = {}
    filters.update(core.FILTERS)
    filters.update(mathstuff.FILTERS)
    return filters


ANSIBLE_FILTER_NAMES: list[str] = sorted(build_ansible_filters().keys())
