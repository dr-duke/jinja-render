from __future__ import annotations

import pytest

from app.core.errors import RenderError
from app.core.ratelimit import TokenBucketRateLimiter, client_key
from app.core.security import check_data_depth
from app.services.parsers import parse_data
from app.services.renderer import RenderOptions, render_template

TIMEOUT = 2.0


# ---- YAML alias "billion laughs" bomb ---------------------------------------


def _alias_bomb(levels: int) -> str:
    """Small YAML whose parsed structure expands ~10x per level via aliases."""
    lines = ["a0: &a0 [x, x, x, x, x, x, x, x, x, x]"]
    for i in range(1, levels):
        refs = ", ".join([f"*a{i - 1}"] * 10)
        lines.append(f"a{i}: &a{i} [{refs}]")
    return "\n".join(lines) + "\n"


def test_alias_bomb_rejected_by_node_budget():
    parsed, _ = parse_data(_alias_bomb(9), "yaml")
    # A few hundred input bytes; without the visit budget this traversal would
    # expand to billions of nodes. It must be rejected quickly and cleanly.
    with pytest.raises(RenderError) as exc:
        check_data_depth(parsed, max_depth=50, max_nodes=1_000_000)
    assert exc.value.type == "validation_error"
    assert "nodes" in exc.value.message


def test_normal_data_passes_node_budget():
    parsed, _ = parse_data("a:\n  b:\n    - 1\n    - 2\n", "yaml")
    check_data_depth(parsed, max_depth=50, max_nodes=1_000_000)  # no raise


# ---- deeply nested input (no recursion overflow -> clean 4xx) ----------------


def test_deeply_nested_json_is_clean_error_not_crash():
    # The C json parser tolerates deep nesting, so the depth guard (not the
    # parser) rejects it — cleanly, as validation_error, never a crash.
    deep = "[" * 6000 + "]" * 6000
    parsed, _ = parse_data(deep, "json")
    with pytest.raises(RenderError) as exc:
        check_data_depth(parsed, max_depth=50, max_nodes=10_000_000)
    assert exc.value.type == "validation_error"


def test_deeply_nested_yaml_is_parse_error_not_crash():
    deep = "[" * 6000 + "]" * 6000
    with pytest.raises(RenderError) as exc:
        parse_data(deep, "yaml")
    assert exc.value.type == "parse_error"


def test_check_depth_is_iterative_for_deep_structures():
    # A structure deeper than Python's recursion limit must yield a clean
    # validation_error, not a RecursionError bubbling up as internal_error.
    obj: object = 0
    for _ in range(5000):
        obj = [obj]
    with pytest.raises(RenderError) as exc:
        check_data_depth(obj, max_depth=50, max_nodes=10_000_000)
    assert exc.value.type == "validation_error"
    assert "depth" in exc.value.message


# ---- output size limit -------------------------------------------------------


def test_output_size_limit_enforced():
    # max_output is enforced inside the worker: output that overruns the cap
    # fails with output_limit_error rather than returning a huge body. Driven via
    # a direct pool call with a tiny cap (render_template reads the cap from
    # settings, which is 5MB by default).
    from app.services.renderer import get_pool

    with pytest.raises(RenderError) as exc:
        get_pool().run(
            "{% for i in range(100000) %}xxxxxxxxxx{% endfor %}",
            {},
            RenderOptions(),
            "base",
            timeout=TIMEOUT,
            max_output=1000,
        )
    assert exc.value.type == "output_limit_error"


def test_output_under_limit_still_renders():
    from app.services.renderer import get_pool

    out = get_pool().run(
        "hello", {}, RenderOptions(), "base", timeout=TIMEOUT, max_output=1000
    )
    assert out == "hello"


# ---- rate limiter: bucket eviction ------------------------------------------


def test_rate_limiter_evicts_when_over_capacity():
    limiter = TokenBucketRateLimiter(
        requests_per_minute=6000, burst=5, max_buckets=10
    )
    # Many distinct keys, each used once (bucket stays near-full). The map must
    # not grow without bound.
    for i in range(200):
        limiter.check(f"client-{i}")
    assert len(limiter._buckets) <= 10  # noqa: SLF001 - white-box check


# ---- client_key: trusted proxy hops -----------------------------------------


class _FakeClient:
    host = "10.0.0.9"


class _FakeRequest:
    def __init__(self, headers: dict[str, str]) -> None:
        self.headers = headers
        self.client = _FakeClient()


def test_client_key_uses_rightmost_trusted_hop():
    req = _FakeRequest({"x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3"})
    # One trusted proxy -> the address our proxy actually saw (rightmost).
    assert client_key(req, trusted_hops=1) == "3.3.3.3"
    # Two trusted proxies -> one further left.
    assert client_key(req, trusted_hops=2) == "2.2.2.2"


def test_client_key_ignores_xff_when_no_trusted_hops():
    req = _FakeRequest({"x-forwarded-for": "1.1.1.1"})
    assert client_key(req, trusted_hops=0) == "10.0.0.9"


def test_client_key_spoofed_prefix_does_not_change_identity():
    # A client prepending fake entries cannot change the trusted-hop identity.
    a = _FakeRequest({"x-forwarded-for": "9.9.9.9, 3.3.3.3"})
    b = _FakeRequest({"x-forwarded-for": "8.8.8.8, 7.7.7.7, 3.3.3.3"})
    assert client_key(a, trusted_hops=1) == client_key(b, trusted_hops=1) == "3.3.3.3"
