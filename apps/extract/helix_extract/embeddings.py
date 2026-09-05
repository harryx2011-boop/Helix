"""Embeddings, local by default.

A local sentence-transformers model ships as the default so chunking and vector
sync work with no keys and no cost — someone evaluating Helix should not need an
OpenAI account to see the feature work at all.

BYOK swaps in a hosted provider when quality or dimensionality matters. As
everywhere else, the operator's key, the operator's bill.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from functools import lru_cache

from .provider import CALL_TIMEOUT_SECONDS
from .settings import settings

# all-MiniLM-L6-v2, matching the pgvector column width in the schema.
LOCAL_DIMENSIONS = 384


@dataclass
class EmbeddingResult:
    vectors: list[list[float]]
    model: str
    dimensions: int
    tokens: int = 0


class EmbeddingError(RuntimeError):
    """Embedding failed, or the configured provider is unavailable."""


@lru_cache(maxsize=1)
def _local_model():  # type: ignore[no-untyped-def]
    """Load the local model once.

    First call pays the load cost — hundreds of megabytes and several seconds —
    so it is cached for the process lifetime. The Docker image pre-downloads the
    weights so the first request does not also pay for a download.
    """
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as exc:  # pragma: no cover - declared dependency
        raise EmbeddingError(
            "sentence-transformers is not installed; set HELIX_EMBEDDING_PROVIDER "
            "to a hosted provider, or install the base dependencies."
        ) from exc

    return SentenceTransformer(settings.helix_embedding_model)


async def _embed_local(texts: list[str]) -> EmbeddingResult:
    model = _local_model()

    # encode() is CPU-bound and synchronous; running it inline would block the
    # event loop for the whole batch.
    vectors = await asyncio.to_thread(
        lambda: model.encode(texts, convert_to_numpy=True, show_progress_bar=False).tolist()
    )

    return EmbeddingResult(
        vectors=vectors,
        model=settings.helix_embedding_model,
        dimensions=len(vectors[0]) if vectors else LOCAL_DIMENSIONS,
    )


async def _embed_openai(texts: list[str]) -> EmbeddingResult:
    from openai import AsyncOpenAI

    key = settings.openai_api_key or settings.openai_compatible_api_key
    url = settings.openai_base_url or settings.openai_compatible_base_url

    if not key and url:
        key = "not-needed"
    if not key:
        raise EmbeddingError("OPENAI_API_KEY is not set.")

    client = AsyncOpenAI(api_key=key, base_url=url) if url else AsyncOpenAI(api_key=key)

    # No client-level timeout is set above, so this is the only ceiling on a
    # stalled connection — same reasoning as provider.py's own CALL_TIMEOUT_SECONDS.
    try:
        response = await asyncio.wait_for(
            client.embeddings.create(model=settings.helix_embedding_model, input=texts),
            timeout=CALL_TIMEOUT_SECONDS,
        )
    except TimeoutError as exc:
        raise EmbeddingError(
            f"the embedding provider did not respond within {CALL_TIMEOUT_SECONDS:.0f}s."
        ) from exc

    vectors = [item.embedding for item in response.data]

    return EmbeddingResult(
        vectors=vectors,
        model=response.model,
        dimensions=len(vectors[0]) if vectors else 0,
        tokens=response.usage.total_tokens if response.usage else 0,
    )


async def _embed_voyage(texts: list[str]) -> EmbeddingResult:
    if not settings.voyage_api_key:
        raise EmbeddingError("VOYAGE_API_KEY is not set.")

    import httpx

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            "https://api.voyageai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {settings.voyage_api_key}"},
            json={"model": settings.helix_embedding_model, "input": texts},
        )
        response.raise_for_status()
        payload = response.json()

    vectors = [item["embedding"] for item in payload.get("data", [])]

    return EmbeddingResult(
        vectors=vectors,
        model=settings.helix_embedding_model,
        dimensions=len(vectors[0]) if vectors else 0,
        tokens=payload.get("usage", {}).get("total_tokens", 0),
    )


async def embed(texts: list[str]) -> EmbeddingResult:
    """Embed a batch using the configured provider."""
    if not texts:
        return EmbeddingResult(vectors=[], model=settings.helix_embedding_model, dimensions=0)

    provider = settings.helix_embedding_provider.lower()

    if provider == "local":
        return await _embed_local(texts)
    if provider in ("openai", "openai-compatible"):
        return await _embed_openai(texts)
    if provider == "voyage":
        return await _embed_voyage(texts)

    raise EmbeddingError(f"Unknown embedding provider: {provider}")
