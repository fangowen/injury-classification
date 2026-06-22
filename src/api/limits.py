"""Tiny in-memory protections for a single-instance demo deployment.

Per-IP token-bucket rate limiter + global concurrency cap. Not safe across
multiple workers — for that, move to Redis. Adequate for one uvicorn process.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Optional


# Per-IP request budget. Two windows: short burst + longer sustained ceiling.
QUERY_PER_MINUTE = 5
QUERY_PER_HOUR = 30

# Hard ceiling on concurrent in-flight agent runs across the whole process.
MAX_CONCURRENT_RUNS = 3

# A POSTed run that never gets a stream consumer is reaped after this many seconds.
UNCONSUMED_RUN_TTL_S = 60

# Hard wall-clock cap on a single SSE stream. Past this we drop the connection.
STREAM_MAX_DURATION_S = 600


@dataclass
class _IpBudget:
    minute_window_start: float = 0.0
    minute_count: int = 0
    hour_window_start: float = 0.0
    hour_count: int = 0


class RateLimiter:
    """Fixed-window per-IP counter. Simple, predictable, no extra deps."""

    def __init__(self) -> None:
        self._budgets: dict[str, _IpBudget] = {}
        self._lock = asyncio.Lock()

    async def check(self, ip: str) -> Optional[int]:
        """Return None if allowed, or seconds-to-retry if rate-limited."""
        now = time.monotonic()
        async with self._lock:
            b = self._budgets.setdefault(ip, _IpBudget(minute_window_start=now, hour_window_start=now))

            if now - b.minute_window_start >= 60:
                b.minute_window_start = now
                b.minute_count = 0
            if now - b.hour_window_start >= 3600:
                b.hour_window_start = now
                b.hour_count = 0

            if b.minute_count >= QUERY_PER_MINUTE:
                return max(1, int(60 - (now - b.minute_window_start)))
            if b.hour_count >= QUERY_PER_HOUR:
                return max(1, int(3600 - (now - b.hour_window_start)))

            b.minute_count += 1
            b.hour_count += 1
            return None


class ConcurrencyGate:
    """Bounded counter of currently-active runs."""

    def __init__(self, limit: int = MAX_CONCURRENT_RUNS) -> None:
        self._limit = limit
        self._active = 0
        self._lock = asyncio.Lock()

    async def try_acquire(self) -> bool:
        async with self._lock:
            if self._active >= self._limit:
                return False
            self._active += 1
            return True

    async def release(self) -> None:
        async with self._lock:
            if self._active > 0:
                self._active -= 1

    @property
    def active(self) -> int:
        return self._active


rate_limiter = RateLimiter()
concurrency = ConcurrencyGate()
