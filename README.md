# rehab-synth

A sports-medicine evidence summarizer. Describe an athlete's symptoms; an agent
generates a differential, retrieves matching papers from a local PubMed index,
reranks them by population fit, and writes a concise answer with citations.

Built on LangGraph, Qdrant, Anthropic, and PubMed's E-utilities.

## Stack

- **Backend** — Python 3.11+, FastAPI with SSE, LangGraph orchestrator
- **Retrieval** — Qdrant (local) with BGE embeddings via FastEmbed
- **LLM** — Anthropic (Claude Haiku for diagnose, Claude Sonnet for rerank + synthesis)
- **Frontend** — Next.js 15, React, Tailwind

## Setup

### Prerequisites

- Python 3.11+
- Node 18.17+
- Docker (for Qdrant)
- An Anthropic API key. An NCBI key is optional but raises PubMed rate limits.

### Install

```bash
pip install -r requirements.txt
pip install fastapi uvicorn langgraph anthropic
cd web && npm install
```

### Environment

Create `.env` at the repo root:

```
ANTHROPIC_API_KEY=sk-ant-...
NCBI_API_KEY=...   # optional
```

### Qdrant

```bash
docker run -p 6333:6333 -v $(pwd)/qdrant_storage:/qdrant/storage qdrant/qdrant
```

The collection (`sports_rehab_papers`) is created on the first ingest.

## Run

The agent auto-ingests from PubMed when a diagnosis has weak retrieval coverage,
so you can start with an empty index — the first query just takes longer (~30s
per ingest attempt). To pre-warm with a topic you know you'll ask about:

```bash
python -m src.ingestion.pipeline '"lateral epicondylitis" AND rehabilitation AND exercise'
```

### Start the app

Two processes:

```bash
# terminal 1
python -m uvicorn src.api.main:app --reload

# terminal 2
cd web && npm run dev
```

Open http://localhost:3000.

### CLI

```bash
python -m src.agent.orchestrator
```

## Project layout

```
src/
  agent/orchestrator.py    LangGraph pipeline; single run() entrypoint
  ingestion/               PubMed fetch + chunking + ingest pipeline
  retrieval/               Qdrant store, embeddings, population reranker
  api/                     FastAPI app, SSE stream, rate limits

web/
  app/                     Next.js App Router pages
  components/              composer, asked question, report stream, sources
  lib/                     SSE client, shared types
```

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/query` | Start a run. Returns `{ run_id }`. |
| `GET`  | `/api/stream/{run_id}` | SSE stream of typed events. |
| `GET`  | `/api/health` | Liveness + active run count. |

## Caveats

- Not medical advice. Don't make care decisions from this output.
- Every run hits Claude (Haiku + Sonnet) and Qdrant. Rate limit and concurrency
  caps in `src/api/limits.py` keep spend bounded.
- All limits are in-memory. Move to Redis if running multiple workers.
- Ingest is synchronous — the UI looks "stuck" for ~30s when the agent decides
  it needs more PubMed papers.
