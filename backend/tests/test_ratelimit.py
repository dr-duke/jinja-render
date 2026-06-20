from __future__ import annotations

from app.core.ratelimit import TokenBucketRateLimiter
from app.services.hostfacts import emulated_facts, merge_facts


def test_token_bucket_allows_up_to_burst_then_blocks():
    limiter = TokenBucketRateLimiter(requests_per_minute=60, burst=3)
    allowed = [limiter.check("client")[0] for _ in range(3)]
    assert allowed == [True, True, True]

    blocked, retry_after = limiter.check("client")
    assert blocked is False
    assert retry_after > 0


def test_token_bucket_keys_are_independent():
    limiter = TokenBucketRateLimiter(requests_per_minute=60, burst=1)
    assert limiter.check("a")[0] is True
    assert limiter.check("a")[0] is False
    # Different client key has its own bucket.
    assert limiter.check("b")[0] is True


def test_emulated_facts_are_deterministic_and_copied():
    a = emulated_facts()
    b = emulated_facts()
    assert a == b
    a["ansible_default_ipv4"]["address"] = "0.0.0.0"
    assert b["ansible_default_ipv4"]["address"] == "192.0.2.10"


def test_merge_facts_preserves_user_keys():
    ctx = {"ansible_hostname": "mine", "custom": 1}
    merged = merge_facts(ctx)
    assert merged["ansible_hostname"] == "mine"
    assert merged["custom"] == 1
    assert merged["ansible_os_family"] == "Debian"
    assert "ansible_facts" in merged
