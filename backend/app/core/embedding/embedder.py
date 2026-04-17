from __future__ import annotations
import uuid
from typing import TYPE_CHECKING

import google.generativeai as genai
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
)

from app.config import get_settings
from app.core.embedding.chunker import Chunk

if TYPE_CHECKING:
    pass

settings = get_settings()

COLLECTION = "code_chunks"
VECTOR_SIZE = 768  # text-embedding-004 output dimension

genai.configure(api_key=settings.gemini_api_key)

_qdrant: QdrantClient | None = None


def get_qdrant() -> QdrantClient:
    global _qdrant
    if _qdrant is None:
        _qdrant = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
        _ensure_collection(_qdrant)
    return _qdrant


def _ensure_collection(client: QdrantClient) -> None:
    existing = {c.name for c in client.get_collections().collections}
    if COLLECTION not in existing:
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Call Gemini embedding API and return vectors."""
    result = genai.embed_content(
        model=settings.gemini_embedding_model,
        content=texts,
        task_type="RETRIEVAL_DOCUMENT",
        output_dimensionality=VECTOR_SIZE
    )
    return result["embedding"] if isinstance(result["embedding"][0], list) else [result["embedding"]]


def upsert_chunks(chunks: list[Chunk]) -> None:
    """Embed a batch of chunks and upsert into Qdrant."""
    if not chunks:
        return

    client = get_qdrant()
    texts = [c.text for c in chunks]
    vectors = embed_texts(texts)

    points = [
        PointStruct(
            id=str(uuid.uuid5(uuid.NAMESPACE_URL, c.chunk_id)),
            vector=vec,
            payload={
                "chunk_id": c.chunk_id,
                "repo_id": c.repo_id,
                "file_path": c.file_path,
                "language": c.language,
                "start_line": c.start_line,
                "end_line": c.end_line,
                "symbol_name": c.symbol_name,
                "text": c.text,
                **c.metadata,
            },
        )
        for c, vec in zip(chunks, vectors)
    ]
    client.upsert(collection_name=COLLECTION, points=points)


async def vector_search(
    repo_id: str,
    question: str,
    top_k: int = 10,
) -> list[dict]:
    """Embed the query and search Qdrant. Returns list of payload dicts."""
    client = get_qdrant()

    vec_result = genai.embed_content(
        model=settings.gemini_embedding_model,
        content=question,
        task_type="RETRIEVAL_QUERY",
        output_dimensionality=VECTOR_SIZE,
    )
    query_vec = vec_result["embedding"]

    hits = client.search(
        collection_name=COLLECTION,
        query_vector=query_vec,
        limit=top_k,
        query_filter=Filter(
            must=[FieldCondition(key="repo_id", match=MatchValue(value=repo_id))]
        ),
        with_payload=True,
    )
    return [hit.payload for hit in hits]


def delete_repo_chunks(repo_id: str) -> None:
    """Remove all chunks for a repo from Qdrant."""
    client = get_qdrant()
    client.delete(
        collection_name=COLLECTION,
        points_selector=Filter(
            must=[FieldCondition(key="repo_id", match=MatchValue(value=repo_id))]
        ),
    )
