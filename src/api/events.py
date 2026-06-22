"""In-memory run registry that bridges the synchronous LangGraph pipeline to async SSE consumers."""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional


SENTINEL = "__END__"


@dataclass
class Run:
    id: str
    queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=2048))
    done: bool = False
    created_at: float = field(default_factory=time.monotonic)
    consumed: bool = False  # flips True the moment a stream client attaches


class RunRegistry:
    def __init__(self) -> None:
        self._runs: dict[str, Run] = {}
        self._lock = asyncio.Lock()

    async def create(self) -> Run:
        run_id = uuid.uuid4().hex
        run = Run(id=run_id)
        async with self._lock:
            self._runs[run_id] = run
        return run

    def get(self, run_id: str) -> Optional[Run]:
        return self._runs.get(run_id)

    async def drop(self, run_id: str) -> None:
        async with self._lock:
            self._runs.pop(run_id, None)

    async def reap_unconsumed(self, ttl_s: float) -> list[str]:
        """Remove and return ids of runs nobody ever connected to within ttl_s."""
        now = time.monotonic()
        expired: list[str] = []
        async with self._lock:
            for rid, run in list(self._runs.items()):
                if not run.consumed and (now - run.created_at) > ttl_s:
                    expired.append(rid)
                    self._runs.pop(rid, None)
        return expired


registry = RunRegistry()


def make_emitter(run: Run, loop: asyncio.AbstractEventLoop):
    """Build an emit(event, data) callable that the worker thread hands to the orchestrator."""

    def emit(event: str, data: dict) -> None:
        payload = json.dumps({"event": event, "data": data}, default=str)
        asyncio.run_coroutine_threadsafe(run.queue.put(payload), loop)

    return emit


def format_sse(payload: str) -> bytes:
    try:
        parsed = json.loads(payload)
        event_name = parsed.get("event", "message")
    except Exception:
        event_name = "message"
    return f"event: {event_name}\ndata: {payload}\n\n".encode("utf-8")
