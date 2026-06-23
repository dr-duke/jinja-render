from __future__ import annotations

from typing import Any

# Built-in template/data example pairs used both as default UI content and as
# a learning aid for the standalone tool.
EXAMPLES: list[dict[str, Any]] = [
    {
        "id": "basic",
        "title": "Basic loop",
        "render_mode": "base",
        "data_format": "yaml",
        "template": (
            "Hosts:\n"
            "{% for host in hosts %}\n"
            "  - {{ host.name }} ({{ host.ip }})\n"
            "{% endfor %}\n"
        ),
        "data": (
            "hosts:\n"
            "  - name: web-01\n"
            "    ip: 192.0.2.10\n"
            "  - name: web-02\n"
            "    ip: 192.0.2.11\n"
        ),
    },
    {
        "id": "hash-filter",
        # hash is an emulated ansible filter (not a Jinja2 built-in), so this
        # example must run in ansible mode.
        "title": "hash filter",
        "render_mode": "ansible",
        "data_format": "yaml",
        "template": "{{ hostname }} sha256: {{ hostname | hash('sha256') }}\n",
        "data": "hostname: router-01\n",
    },
    {
        "id": "ipaddr-filter",
        "title": "ipaddr filter",
        "render_mode": "ansible",
        "data_format": "yaml",
        "template": (
            "address: {{ cidr | ipaddr('address') }}\n"
            "network: {{ cidr | ipaddr('network') }}\n"
            "netmask: {{ cidr | ipaddr('netmask') }}\n"
            "prefix:  {{ cidr | ipaddr('prefix') }}\n"
        ),
        "data": "cidr: 192.0.2.10/24\n",
    },
]


def default_example() -> dict[str, Any]:
    return EXAMPLES[0]
