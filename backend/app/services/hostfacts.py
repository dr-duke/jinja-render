from __future__ import annotations

from typing import Any

# Deterministic, safe emulation of an Ansible facts payload.
#
# IMPORTANT: these values are STATIC and fabricated. We never read real host
# facts, never call platform/socket, never inspect /proc or interfaces. The
# goal is to let users develop templates that reference ``ansible_facts.*``
# without running a real fact-gathering step, and without leaking anything
# about the container/host the app runs in.
_EMULATED_FACTS: dict[str, Any] = {
    "ansible_hostname": "node01",
    "ansible_fqdn": "node01.example.com",
    "ansible_os_family": "Debian",
    "ansible_distribution": "Debian",
    "ansible_distribution_version": "12",
    "ansible_kernel": "6.1.0-emulated",
    "ansible_architecture": "x86_64",
    "ansible_processor_vcpus": 4,
    "ansible_interfaces": ["lo", "eth0"],
    "ansible_default_ipv4": {
        "address": "192.0.2.10",
        "netmask": "255.255.255.0",
        "gateway": "192.0.2.1",
        "interface": "eth0",
    },
    "ansible_python_version": "3.12.0",
}


def emulated_facts() -> dict[str, Any]:
    """Return a fresh copy of the static emulated facts (flat keys)."""
    return {key: _copy(value) for key, value in _EMULATED_FACTS.items()}


def _copy(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _copy(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_copy(v) for v in value]
    return value


def merge_facts(context: dict[str, Any]) -> dict[str, Any]:
    """Merge emulated facts into ``context`` without overwriting user keys.

    Adds each flat ``ansible_*`` key plus a nested ``ansible_facts`` mapping,
    but only where the user has not already provided that top-level key. User
    data always wins.
    """
    facts = emulated_facts()
    merged = dict(context)
    for key, value in facts.items():
        merged.setdefault(key, value)
    merged.setdefault("ansible_facts", facts)
    return merged
