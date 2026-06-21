"""FastAPI entrypoint. Wraps the LangGraph orchestrator and streams events over SSE."""
from __future__ import annotations

import asyncio
import json
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from ..agent.orchestrator import run as run_pipeline
from .events import SENTINEL, format_sse, make_emitter, registry
from .schemas import QueryRequest, QueryStarted


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="rehab-synth API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.post("/api/query", response_model=QueryStarted)
async def start_query(req: QueryRequest) -> QueryStarted:
    run = registry.create()
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

    asyncio.create_task(asyncio.to_thread(worker))
    return QueryStarted(run_id=run.id)


@app.get("/api/stream/{run_id}")
async def stream_run(run_id: str):
    run = registry.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")

    async def event_stream():
        try:
            while True:
                item = await run.queue.get()
                if item == SENTINEL:
                    yield format_sse(json.dumps({"event": "stream_end", "data": {}}))
                    break
                yield format_sse(item)
        finally:
            registry.drop(run_id)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
