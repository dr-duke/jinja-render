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

    def __init__(self, *, requests_per_minute: int, burst: int) -> None:
        self._refill_per_sec = max(0.0, requests_per_minute / 60.0)
        self._capacity = float(max(1, burst))
        self._buckets: dict[str, _Bucket] = {}
        self._lock = threading.Lock()

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


def client_key(request: Request) -> str:
    """Derive a client identity key for rate limiting.

    Prefers ``X-Forwarded-For`` (first hop), then ``X-Real-IP``, then the
    connection's remote address.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    if request.client is not None:
        return request.client.host
    return "unknown"
