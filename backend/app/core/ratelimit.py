from __future__ import annotations

import threading
import time
from dataclasses import dataclass

from fastapi import Request


@dataclass
class _Bucket:
    tokens: float
    updated: float


class TokenBucketRateLimiter:
    """In-process token-bucket rate limiter, keyed per client.

    Tokens refill continuously at ``rate_per_minute / 60`` per second up to a
    ceiling of ``burst``. Each request consumes one token. This limiter is
    per-process: in Kubernetes it applies per-pod, not globally.
    """

    def __init__(
        self, *, requests_per_minute: int, burst: int, max_buckets: int = 10_000
    ) -> None:
        self._refill_per_sec = max(0.0, requests_per_minute / 60.0)
        self._capacity = float(max(1, burst))
        self._max_buckets = max(1, max_buckets)
        self._buckets: dict[str, _Bucket] = {}
        self._lock = threading.Lock()

    def _evict(self, protect: str) -> None:
        """Bound memory use. Called under the lock when the map grows too large.

        Buckets that have fully refilled are no longer rate-limiting anything, so
        forgetting them is behavior-preserving (a fresh bucket starts full too).
        If that is not enough, drop the least-recently-updated buckets. ``protect``
        (the current requester's key) is never evicted, so a request is never
        served a fresh bucket it would then immediately discard. This caps the map
        so a client rotating distinct X-Forwarded-For values cannot grow it
        without bound.
        """
        for key in [
            k
            for k, b in self._buckets.items()
            if k != protect and b.tokens >= self._capacity
        ]:
            del self._buckets[key]
        if len(self._buckets) > self._max_buckets:
            overflow = len(self._buckets) - self._max_buckets
            evictable = sorted(
                (k for k in self._buckets if k != protect),
                key=lambda k: self._buckets[k].updated,
            )
            for key in evictable[:overflow]:
                del self._buckets[key]

    def check(self, key: str) -> tuple[bool, float]:
        """Try to consume a token for ``key``.

        Returns ``(allowed, retry_after_seconds)``. ``retry_after_seconds`` is
        0 when allowed, otherwise the wait until one token is available.
        """
        now = time.monotonic()
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = _Bucket(tokens=self._capacity, updated=now)
                self._buckets[key] = bucket
                if len(self._buckets) > self._max_buckets:
                    self._evict(protect=key)
            else:
                elapsed = now - bucket.updated
                bucket.tokens = min(
                    self._capacity, bucket.tokens + elapsed * self._refill_per_sec
                )
                bucket.updated = now

            if bucket.tokens >= 1.0:
                bucket.tokens -= 1.0
                return True, 0.0

            if self._refill_per_sec <= 0:
                return False, 60.0
            retry_after = (1.0 - bucket.tokens) / self._refill_per_sec
            return False, retry_after


def client_key(request: Request, *, trusted_hops: int = 1) -> str:
    """Derive a client identity key for rate limiting.

    ``X-Forwarded-For`` is a client-appendable list: the leftmost entry is the
    (spoofable) claimed origin, while each trusted proxy appends the address it
    actually saw on the right. So the real client, as seen by our own
    infrastructure, is ``trusted_hops`` entries from the right. Taking the
    leftmost value (the previous behavior) let a client both forge its identity
    and, by rotating fake values, evade the limit and bloat the bucket map.

    With ``trusted_hops <= 0`` the header is ignored entirely and only the direct
    connection address is used (correct when the app is exposed directly).
    """
    if trusted_hops > 0:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            parts = [p.strip() for p in forwarded.split(",") if p.strip()]
            if parts:
                idx = max(0, len(parts) - trusted_hops)
                return parts[idx]
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()
    if request.client is not None:
        return request.client.host
    return "unknown"
