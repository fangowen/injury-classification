"""FastAPI entrypoint. Wraps the LangGraph orchestrator and streams events over SSE."""
from __future__ import annotations

import asyncio
import json
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from ..agent.orchestrator import run as run_pipeline
from .events import SENTINEL, format_sse, make_emitter, registry
from .limits import (
    STREAM_MAX_DURATION_S,
    UNCONSUMED_RUN_TTL_S,
    concurrency,
    rate_limiter,
)
from .schemas import QueryRequest, QueryStarted


async def _reaper_loop():
    """Background task: drop unconsumed runs whose creator never connected."""
    while True:
        try:
            expired = await registry.reap_unconsumed(UNCONSUMED_RUN_TTL_S)
            for _ in expired:
                await concurrency.release()
        except Exception:
            pass
        await asyncio.sleep(15)


@asynccontextmanager
async def lifespan(app: FastAPI):
    reaper = asyncio.create_task(_reaper_loop())
    try:
        yield
    finally:
        reaper.cancel()


app = FastAPI(title="rehab-synth API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@app.get("/api/health")
async def health():
    return {"ok": True, "active_runs": concurrency.active}


@app.post("/api/query", response_model=QueryStarted)
async def start_query(req: QueryRequest, request: Request) -> QueryStarted:
    ip = _client_ip(request)

    retry_after = await rate_limiter.check(ip)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="rate limit exceeded",
            headers={"Retry-After": str(retry_after)},
        )

    if not await concurrency.try_acquire():
        raise HTTPException(
            status_code=429,
            detail="server is at capacity, try again shortly",
            headers={"Retry-After": "30"},
        )

    run = await registry.create()
    loop = asyncio.get_running_loop()
    emit = make_emitter(run, loop)
    athlete_text = req.athlete_context.to_text()

    def worker():
        try:
            emit("run_started", {"user_query": req.user_query, "athlete_context": athlete_text})
            result = run_pipeline(req.user_query, athlete_text, emit=emit)
            emit("done", {
                "red_flags": result.get("red_flags", False),
                "weak_diagnoses": result.get("weak_diagnoses", []),
                "ingest_attempts": result.get("ingest_attempts", 0),
            })
        except Exception as e:
            emit("error", {"message": str(e), "trace": traceback.format_exc()})
        finally:
            asyncio.run_coroutine_threadsafe(run.queue.put(SENTINEL), loop)
            asyncio.run_coroutine_threadsafe(concurrency.release(), loop)

    asyncio.create_task(asyncio.to_thread(worker))
    return QueryStarted(run_id=run.id)


@app.get("/api/stream/{run_id}")
async def stream_run(run_id: str):
    run = registry.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    run.consumed = True

    async def event_stream():
        deadline = asyncio.get_running_loop().time() + STREAM_MAX_DURATION_S
        try:
            while True:
                remaining = deadline - asyncio.get_running_loop().time()
                if remaining <= 0:
                    yield format_sse(json.dumps({"event": "error", "data": {"message": "stream timeout"}}))
                    yield format_sse(json.dumps({"event": "stream_end", "data": {}}))
                    break
                try:
                    item = await asyncio.wait_for(run.queue.get(), timeout=min(remaining, 30))
                except asyncio.TimeoutError:
                    # heartbeat keeps proxies / browsers from idling out the connection
                    yield b": keepalive\n\n"
                    continue
                if item == SENTINEL:
                    yield format_sse(json.dumps({"event": "stream_end", "data": {}}))
                    break
                yield format_sse(item)
        finally:
            await registry.drop(run_id)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
