"""helix-extract — extraction, parsing, structured output and embeddings.

A stateless FastAPI service. The core calls it over internal HTTP; it holds no
job state and no database connection.

Python owns this layer because trafilatura, Docling, Marker and the embedding
stack have no real equivalent in another ecosystem.
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import chunking, documents, embeddings, extraction, llm
from .schema_compiler import SchemaError
from .settings import settings

app = FastAPI(
    title="helix-extract",
    version="0.1.0",
    description="Internal service. Not exposed publicly.",
)


class Health(BaseModel):
    status: str
    version: str
    extractors: list[str]
    document_parsers: list[str]
    llm_configured: bool
    embedding_model: str


@app.get("/health", response_model=Health)
async def health() -> Health:
    return Health(
        status="ok",
        version="0.1.0",
        extractors=["trafilatura", "readability"],
        document_parsers=documents.available_parsers(),
        llm_configured=settings.llm_configured,
        embedding_model=settings.embedding_model,
    )


class ExtractRequest(BaseModel):
    html: str
    url: str
    extractor: str = Field(default="trafilatura", pattern="^(trafilatura|readability|auto)$")
    only_main_content: bool = True
    include_selectors: list[str] = Field(default_factory=list)
    exclude_selectors: list[str] = Field(default_factory=list)


class ExtractResponse(BaseModel):
    markdown: str
    text: str
    title: str | None = None
    language: str | None = None
    links: list[str] = Field(default_factory=list)
    extractor_used: str
    # SHA-256 of normalised content. Drives incremental crawl and change
    # detection, so it must be stable across cosmetic markup churn.
    content_hash: str


@app.post("/extract", response_model=ExtractResponse)
async def extract(request: ExtractRequest) -> ExtractResponse:
    result = extraction.extract(
        doc_html=request.html,
        url=request.url,
        extractor=request.extractor,
        only_main_content=request.only_main_content,
        include_selectors=request.include_selectors,
        exclude_selectors=request.exclude_selectors,
    )

    return ExtractResponse(
        markdown=result.markdown,
        text=result.text,
        title=result.title,
        language=result.language,
        links=result.links,
        extractor_used=result.extractor_used,
        content_hash=result.content_hash,
    )


class DocumentRequest(BaseModel):
    content_base64: str
    content_type: str
    ocr: str = Field(default="auto", pattern="^(auto|never|always)$")
    max_pages: int | None = None
    tables: str = Field(default="auto", pattern="^(auto|high-fidelity)$")


class DocumentResponse(BaseModel):
    markdown: str
    pages: int
    # Classified before parsing, so a scanned document routes to OCR instead of
    # silently returning garbled characters — the failure that produces mojibake
    # for CJK PDFs in tools that skip this step.
    needs_ocr: bool
    ocr_applied: bool
    suspected_garbled_text: bool
    parser_used: str


@app.post("/document", response_model=DocumentResponse)
async def parse_document(request: DocumentRequest) -> DocumentResponse:
    import base64
    import binascii

    try:
        data = base64.b64decode(request.content_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"content_base64 is not valid base64: {exc}") from exc

    try:
        result = documents.parse(
            data=data,
            content_type=request.content_type,
            ocr=request.ocr,
            max_pages=request.max_pages,
            tables=request.tables,
        )
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc

    return DocumentResponse(
        markdown=result.markdown,
        pages=result.pages,
        needs_ocr=result.needs_ocr,
        ocr_applied=result.ocr_applied,
        suspected_garbled_text=result.suspected_garbled_text,
        parser_used=result.parser_used,
    )


class StructuredRequest(BaseModel):
    content: str
    schema_: dict = Field(alias="schema")
    prompt: str | None = None
    model: str | None = None
    include_sources: bool = False


class StructuredResponse(BaseModel):
    data: dict
    sources: list[dict] = Field(default_factory=list)
    tokens_input: int
    tokens_output: int
    model_used: str
    # How much of the page reached the model. Surfaced so a caller can tell a
    # missing field apart from a trimmed-away one.
    blocks_kept: int = 0
    blocks_total: int = 0


@app.post("/structured", response_model=StructuredResponse)
async def structured(request: StructuredRequest) -> StructuredResponse:
    try:
        result = await llm.extract_structured(
            content=request.content,
            schema=request.schema_,
            prompt=request.prompt,
            model=request.model,
        )
    except SchemaError as exc:
        # A schema problem is the caller's to fix, and the hint says how.
        detail = f"{exc.message} {exc.hint}".strip() if exc.hint else exc.message
        raise HTTPException(status_code=400, detail=detail) from exc
    except llm.ProviderError as exc:
        # No credentials, or the provider refused. Not the caller's fault.
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return StructuredResponse(
        data=result.data,
        tokens_input=result.tokens_input,
        tokens_output=result.tokens_output,
        model_used=result.model_used,
        blocks_kept=result.blocks_kept,
        blocks_total=result.blocks_total,
    )


class ChunkRequest(BaseModel):
    text: str
    url: str
    strategy: str = Field(default="semantic", pattern="^(semantic|heading|fixed)$")
    max_tokens: int = 512
    overlap: int = 64
    embed: bool = False


class Chunk(BaseModel):
    text: str
    # Stable across re-crawls, so a citation keeps resolving after the page moves.
    anchor: str
    tokens: int
    heading_path: list[str] = Field(default_factory=list)
    index: int = 0
    embedding: list[float] | None = None


class ChunkResponse(BaseModel):
    chunks: list[Chunk]
    embedding_model: str | None = None
    embedding_dimensions: int | None = None


@app.post("/chunk", response_model=ChunkResponse)
async def chunk(request: ChunkRequest) -> ChunkResponse:
    pieces = chunking.chunk_markdown(
        markdown=request.text,
        url=request.url,
        strategy=request.strategy,
        max_tokens=request.max_tokens,
        overlap=request.overlap,
    )

    vectors: list[list[float]] | None = None
    model_used: str | None = None
    dimensions: int | None = None

    if request.embed and pieces:
        try:
            result = await embeddings.embed([piece.text for piece in pieces])
            vectors = result.vectors
            model_used = result.model
            dimensions = result.dimensions
        except embeddings.EmbeddingError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    return ChunkResponse(
        chunks=[
            Chunk(
                text=piece.text,
                anchor=piece.anchor,
                tokens=piece.tokens,
                heading_path=piece.heading_path,
                index=piece.index,
                embedding=vectors[i] if vectors else None,
            )
            for i, piece in enumerate(pieces)
        ],
        embedding_model=model_used,
        embedding_dimensions=dimensions,
    )
