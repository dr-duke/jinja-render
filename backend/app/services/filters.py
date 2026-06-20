from __future__ import annotations

import hashlib
import json
from typing import Any

import netaddr

from ..core.errors import RenderError

# Filters exposed to templates in every render mode.
FILTER_NAMES = ["hash", "ipaddr"]


def _to_text(value: Any) -> str:
    """Deterministically normalize any value to a string for hashing."""
    if isinstance(value, str):
        return value
    if isinstance(value, (bytes, bytearray)):
        return bytes(value).decode("utf-8", errors="replace")
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        return str(value)
    # dict/list and other structures: stable JSON form.
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def do_hash(value: Any, algorithm: str = "sha256") -> str:
    """Compute a hex digest of ``value`` using the named hashlib algorithm."""
    algo = str(algorithm).lower()
    if algo not in hashlib.algorithms_available:
        raise RenderError(
            "unsupported_filter_error",
            f"Unsupported hash algorithm: {algorithm!r}.",
            details={"available": sorted(hashlib.algorithms_guaranteed)},
        )
    try:
        digest = hashlib.new(algo)
    except (ValueError, TypeError) as exc:  # pragma: no cover - defensive
        raise RenderError(
            "unsupported_filter_error",
            f"Unsupported hash algorithm: {algorithm!r}.",
        ) from exc
    digest.update(_to_text(value).encode("utf-8"))
    # Variable-length digests (shake_*) require a length argument.
    try:
        return digest.hexdigest()
    except TypeError:
        return digest.hexdigest(32)  # type: ignore[call-arg]


def _ipaddr_query(addr: str, query: str | None) -> Any:
    """Run a single ansible-like ``ipaddr`` query against one value.

    Returns ``False`` when the value is not a valid address/network or the
    query does not apply, mirroring ansible's filtering behavior.
    """
    text = str(addr).strip()
    try:
        if "/" in text:
            net = netaddr.IPNetwork(text)
            ip = net.ip
        else:
            ip = netaddr.IPAddress(text)
            host_prefix = 32 if ip.version == 4 else 128
            net = netaddr.IPNetwork(f"{ip}/{host_prefix}")
    except (netaddr.AddrFormatError, ValueError):
        return False

    if query in (None, "", "address"):
        # Bare ipaddr / address: return canonical representation.
        if query == "address":
            return str(ip)
        return text if "/" in text else str(ip)

    try:
        if query == "network":
            return str(net.network)
        if query == "netmask":
            return str(net.netmask)
        if query == "prefix":
            return int(net.prefixlen)
        if query == "host":
            return f"{ip}/{net.prefixlen}"
        if query == "broadcast":
            return str(net.broadcast) if net.broadcast is not None else False
        if query == "int":
            return int(ip)
        if query == "bool":
            return True
        if query == "version":
            return int(ip.version)
        if query == "size":
            return int(net.size)
    except (netaddr.AddrFormatError, ValueError):
        return False

    raise RenderError(
        "unsupported_filter_error",
        f"Unsupported ipaddr query: {query!r}.",
    )


def do_ipaddr(value: Any, query: str | None = None) -> Any:
    """ansible-like ``ipaddr`` filter built on ``netaddr``.

    Scalars return the query result (or ``False`` when invalid). Lists return a
    list with invalid/non-matching entries dropped, matching ansible UX.
    """
    if isinstance(value, (list, tuple)):
        results = []
        for item in value:
            res = _ipaddr_query(item, query)
            if res is not False:
                results.append(res)
        return results
    return _ipaddr_query(value, query)


def build_filters() -> dict[str, Any]:
    return {"hash": do_hash, "ipaddr": do_ipaddr}
