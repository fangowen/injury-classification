import anthropic
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue, MatchAny
)

import hashlib
import os
import uuid
from typing import Optional
from dotenv import load_dotenv

load_dotenv()
#as of now running qdrant locally and use fast embed

COLLECTION_NAME = "sports_rehab_papers"
VECTOR_DIM = 1024  # BAAI/bge-large-en-v1.5 output size

def get_client() -> QdrantClient:
    return QdrantClient("localhost", port=6333)

def init_collection(client: QdrantClient):
    """Initialize the collection with the correct schema"""
    collections = [c.name for c in client.get_collections().collections]
    if COLLECTION_NAME not in collections:
        client.create_collection(
            collection_name = COLLECTION_NAME,
            vectors_config = VectorParams(size=VECTOR_DIM, distance=Distance.COSINE), 
        )
        print(f"Created collection: {COLLECTION_NAME}")
    else:
        print(f"Collection {COLLECTION_NAME} already exists")

_embedding_model = None


def _get_embedding_model():
    """Load the BGE model once per process. Instantiating TextEmbedding loads
    ~1.3GB of weights, so caching it is the difference between one load and one
    load per search/ingest call."""
    global _embedding_model
    if _embedding_model is None:
        from fastembed import TextEmbedding
        _embedding_model = TextEmbedding("BAAI/bge-large-en-v1.5")
    return _embedding_model


def embed_text(text: list[str])-> list[list[float]]:
    """Embed a list of text strings using FastEmbed
    Could swap for other models later -> look into voyage and openai embeddings
    """

    model = _get_embedding_model()
    embeddings = list(model.embed(text))
    return [e.tolist() for e in embeddings]

def chunk_id(pmid: str, section: str) -> str:
    """Deterministic UUID for a chunk (Qdrant accepts int or UUID only)."""
    raw = f"{pmid}_{section}"
    digest = hashlib.sha256(raw.encode()).hexdigest()
    return str(uuid.UUID(digest[:32]))

def store_chunks(client: QdrantClient, chunks: list) -> int:
    """embed and store chunks in Qdrant"""
    if not chunks: return 0

    texts = [c.text for c in chunks]
    vectors = embed_text(texts)

    points = []
    for chunk, vector in zip(chunks, vectors):
        point_id = chunk_id(chunk.metadata["pmid"], chunk.metadata["section"])
        points.append(PointStruct(
            id=point_id,
            vector=vector,
            payload=chunk.metadata | {"text":chunk.text},
        ))
    client.upsert(collection_name=COLLECTION_NAME, points=points)
    return len(points)

def search(
    client:QdrantClient,
    query:str,
    limit:int = 10,
    section_filter: Optional[list[str]] = None,
    study_design_filter: Optional[list[str]] = None,
) -> list[dict]:
    """Search for chunks in Qdrant for a query"""

    query_vector = embed_text([query])[0]
    must_filters = []
    if section_filter:
        must_filters.append(FieldCondition(
            key="section",
            match=MatchAny(any=section_filter))
        )
    if study_design_filter:
        must_filters.append(
            FieldCondition(key="study_design", match=MatchAny(any=study_design_filter))
        )

    search_filter = Filter(must=must_filters) if must_filters else None

    res = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        query_filter=search_filter,
        limit=limit,
    )

    return [
        {
            "score": hit.score,
            "text": hit.payload.get("text", ""),
            "pmid": hit.payload.get("pmid", ""),
            "section": hit.payload.get("section"),
            "title": hit.payload.get("title"),
            "year": hit.payload.get("year"),
            "study_design": hit.payload.get("study_design"),
            "authors": hit.payload.get("authors", []),
        }
        for hit in res.points
    ]