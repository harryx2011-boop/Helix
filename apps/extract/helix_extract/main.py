"""helix-extract — extraction, parsing, structured output and embeddings.

A stateless FastAPI service. The core calls it over internal HTTP; it holds no
job state and no database connection.

Python owns this layer because trafilatura, Docling, Marker and the embedding
stack have no real equivalent in another ecosystem.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import (
    chunking,
    convert,
    documents,
    embeddings,
    enrich,
    extraction,
    llm,
    metadata,
    schema_gen,
)
from .schema_compiler import SchemaError
from .settings import settings

app = FastAPI(
    title="helix-extract",
    version="1.4.0",
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
        version="1.4.0",
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
async def parse_document(
    request: Request,
    ocr: str = Query(default="auto", pattern="^(auto|never|always)$"),
    max_pages: int | None = Query(default=None, ge=1),
    tables: str = Query(default="auto", pattern="^(auto|high-fidelity)$"),
) -> DocumentResponse:
    # The file is the raw body and its kind is the Content-Type header. No
    # base64, no JSON envelope: the gateway already holds the bytes once and
    # should not need two more copies of a 25 MB upload to hand them over.
    content_type = request.headers.get("content-type", "")
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="the request body is empty")

    try:
        result = documents.parse(
            data=data,
            content_type=content_type,
            ocr=ocr,
            max_pages=max_pages,
            tables=tables,
        )
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except documents.DocumentError as exc:
        # The parser opened the bytes and refused them: the caller's file, not
        # the service, is what failed.
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return DocumentResponse(
        markdown=result.markdown,
        pages=result.pages,
        needs_ocr=result.needs_ocr,
        ocr_applied=result.ocr_applied,
        suspected_garbled_text=result.suspected_garbled_text,
        parser_used=result.parser_used,
    )


class PdfAssessmentResponse(BaseModel):
    pages: int
    chars_extracted: int
    needs_ocr: bool
    suspected_garbled_text: bool
    reason: str


@app.post("/assess", response_model=PdfAssessmentResponse)
async def assess_pdf_route(request: Request) -> PdfAssessmentResponse:
    # Same wire shape as /document: raw bytes, kind from Content-Type. PDF
    # only — the classifier this wraps has nothing to say about DOCX or XLSX,
    # which carry no scanned-vs-text-layer distinction to assess.
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="the request body is empty")
    if content_type not in ("application/pdf", "application/x-pdf"):
        raise HTTPException(
            status_code=415,
            detail=f"assessment is only defined for PDFs, not {content_type or 'an unspecified type'}",
        )

    assessment = documents.assess_pdf(data)

    return PdfAssessmentResponse(
        pages=assessment.pages,
        chars_extracted=assessment.chars_extracted,
        needs_ocr=assessment.needs_ocr,
        suspected_garbled_text=assessment.suspected_garbled_text,
        reason=assessment.reason,
    )


class MetadataFinding(BaseModel):
    group: str
    key: str
    value: str
    risk: str
    category: str
    removable: bool


class MetadataScanResponse(BaseModel):
    file_type: str
    findings: list[MetadataFinding]
    # All three risk bands are always present, so a caller rendering a summary
    # never has to tell an absent band from a zero one.
    risk_summary: dict[str, int]
    warnings: list[str] = Field(default_factory=list)


def _as_findings(items: list[metadata.Finding]) -> list[MetadataFinding]:
    return [
        MetadataFinding(
            group=item.group,
            key=item.key,
            value=item.value,
            risk=item.risk.value,
            category=item.category.value,
            removable=item.removable,
        )
        for item in items
    ]


def _metadata_type(content_type: str) -> str:
    kind = documents.CONTENT_TYPES.get(content_type.split(";")[0].strip().lower())
    if kind is not None and kind.value in metadata.SUPPORTED_TYPES:
        return kind.value
    image = {"image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg"}.get(
        content_type.split(";")[0].strip().lower()
    )
    if image is not None:
        return image
    raise ValueError(
        f"metadata is not supported for {content_type or 'an unspecified type'}; "
        f"supported: {', '.join(metadata.SUPPORTED_TYPES)}"
    )


@app.post("/metadata/scan", response_model=MetadataScanResponse)
async def scan_metadata(request: Request) -> MetadataScanResponse:
    # Same wire shape as /document: raw bytes, kind from Content-Type.
    content_type = request.headers.get("content-type", "")
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="the request body is empty")

    try:
        file_type = _metadata_type(content_type)
        result = metadata.scan(data, file_type)
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except metadata.MetadataError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return MetadataScanResponse(
        file_type=result.file_type,
        findings=_as_findings(result.findings),
        risk_summary=metadata.summarize(result.findings),
        warnings=result.warnings,
    )


@app.post("/metadata/scrub")
async def scrub_metadata(request: Request) -> Response:
    """Return the cleaned bytes, with the report in headers.

    The body is the file, not a JSON envelope: base64 would hold two more copies
    of it for the whole request. The report rides in `X-Helix-Metadata-Report`
    as compact JSON, which is why values are capped upstream — a header is not
    a place for an unbounded payload.
    """
    content_type = request.headers.get("content-type", "")
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="the request body is empty")

    try:
        file_type = _metadata_type(content_type)
        result = metadata.scrub(data, file_type)
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except metadata.MetadataError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    report = {
        "file_type": file_type,
        "removed": [item.model_dump() for item in _as_findings(result.removed)],
        "retained": [item.model_dump() for item in _as_findings(result.retained)],
        "risk_summary": metadata.summarize(result.removed),
        "warnings": result.warnings,
        "bytes_before": len(data),
        "bytes_after": len(result.data),
    }
    return Response(
        content=result.data,
        media_type=content_type.split(";")[0].strip() or "application/octet-stream",
        headers={"x-helix-metadata-report": json.dumps(report, separators=(",", ":"))},
    )


def _convert_source_type(content_type: str) -> str:
    base = content_type.split(";")[0].strip().lower()
    kind = documents.CONTENT_TYPES.get(base)
    if kind is not None and kind.value in convert.SUPPORTED_TARGETS:
        return kind.value
    image = {"image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg"}.get(base)
    if image is not None and image in convert.SUPPORTED_TARGETS:
        return image
    raise ValueError(
        f"conversion is not supported from {content_type or 'an unspecified type'}; "
        f"supported sources: {', '.join(convert.SUPPORTED_TARGETS)}"
    )


@app.post("/convert")
async def convert_file(
    request: Request,
    to: str = Query(pattern="^(png|jpeg)$"),
    page: int = Query(default=1, ge=1),
    dpi: int = Query(default=convert.DEFAULT_DPI, ge=36, le=600),
) -> Response:
    """Return the converted bytes directly, the same wire shape as /metadata/scrub.

    PDF rasterizes one page at a time (`page`, 1-based); PNG and JPEG convert
    to each other whole. Nothing here writes PDF, DOCX, PPTX or XLSX -- this
    endpoint reads a format the pipeline already parses and re-encodes pixels
    it already has, not a document-authoring path.
    """
    content_type = request.headers.get("content-type", "")
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="the request body is empty")

    try:
        source_type = _convert_source_type(content_type)
        target = convert.ConvertFormat(to)
        if target not in convert.SUPPORTED_TARGETS[source_type]:
            allowed = ", ".join(f.value for f in convert.SUPPORTED_TARGETS[source_type])
            raise ValueError(f"{source_type} cannot convert to {to}; supported targets: {allowed}")
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc

    try:
        if source_type == "pdf":
            result = convert.convert_pdf_page(data, target, page=page, dpi=dpi)
        else:
            result = convert.convert_image(data, convert.SOURCE_FORMAT[source_type], target)
    except documents.DocumentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return Response(
        content=result.data,
        media_type=result.content_type,
        headers={
            "x-helix-convert-pages": str(result.pages),
            "x-helix-convert-page": (
                str(result.page_converted) if result.page_converted is not None else ""
            ),
        },
    )


class StructuredRequest(BaseModel):
    content: str
    schema_: dict = Field(alias="schema")
    prompt: str | None = None
    # Per-request override of the instance default. The key for that provider
    # must already be configured, or supplied via `provider_keys` below.
    provider: str | None = None
    model: str | None = None
    include_sources: bool = False
    # The caller's own provider keys, decrypted by the gateway, keyed by
    # provider name. Present only when the caller has stored at least one;
    # overrides the instance's environment credential for that provider.
    provider_keys: dict[str, str] | None = None
    provider_models: dict[str, str] | None = None
    # The caller's own local-runtime base URLs, decrypted by the gateway, keyed
    # by provider name. Same semantics as `provider_keys`, for Ollama, vLLM and
    # OpenAI-compatible servers.
    provider_base_urls: dict[str, str] | None = None


class StructuredResponse(BaseModel):
    data: dict
    # The passages that reached the model, in page order, with the relevance
    # score that selected them. Only filled when `include_sources` was set.
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
            provider=request.provider,
            model=request.model,
            include_sources=request.include_sources,
            provider_keys=request.provider_keys,
            provider_models=request.provider_models,
            provider_base_urls=request.provider_base_urls,
        )
    except SchemaError as exc:
        # A schema problem is the caller's to fix, and the hint says how.
        detail = f"{exc.message} {exc.hint}".strip() if exc.hint else exc.message
        raise HTTPException(status_code=400, detail=detail) from exc
    except llm.RequestError as exc:
        # Also the caller's, but a different field than the schema.
        raise HTTPException(
            status_code=400, detail={"message": exc.message, "field": exc.field}
        ) from exc
    except llm.ProviderError as exc:
        # No credentials, or the provider refused. Not the caller's fault.
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return StructuredResponse(
        data=result.data,
        sources=result.sources,
        tokens_input=result.tokens_input,
        tokens_output=result.tokens_output,
        model_used=result.model_used,
        blocks_kept=result.blocks_kept,
        blocks_total=result.blocks_total,
    )



class EnrichVerifyRequest(BaseModel):
    # The content that was sent to the model, fences included. Citations are
    # checked against this rather than against the original page, so a passage
    # the relevance trimmer dropped fails here even though it is really on the
    # page - the model could not have read it.
    content: str
    # Claimed fields, keyed by field name, each an object carrying `value` and
    # `citation` as the enrichment schema asks the model to return them.
    claims: dict


class VerifiedField(BaseModel):
    name: str
    value: Any = None
    citation: str | None = None
    grounded: bool
    # Null when the model correctly reported the content does not state the
    # field; set only when a claim was made and rejected.
    reason: str | None = None
    # False for booleans, which cannot appear literally in the prose that
    # establishes them. Surfaced so a caller can tell that weaker case apart.
    value_in_citation: bool


class EnrichVerifyResponse(BaseModel):
    fields: list[VerifiedField]
    grounded_count: int
    rejected_count: int


@app.post("/enrich/verify", response_model=EnrichVerifyResponse)
async def enrich_verify(request: EnrichVerifyRequest) -> EnrichVerifyResponse:
    """Check claimed fields against the content that reached the model.

    Calls no provider. The gateway runs its own grounding check against the
    pages it fetched; this one runs against the trimmed content actually sent,
    which is a different question with a different blind spot.
    """
    verdicts = enrich.verify_fields(request.content, request.claims)

    return EnrichVerifyResponse(
        fields=[
            VerifiedField(
                name=v.name,
                value=v.value,
                citation=v.citation,
                grounded=v.grounded,
                reason=v.reason,
                value_in_citation=v.value_in_citation,
            )
            for v in verdicts
        ],
        grounded_count=sum(1 for v in verdicts if v.grounded),
        rejected_count=sum(1 for v in verdicts if v.reason is not None),
    )

class SchemaRequest(BaseModel):
    prompt: str
    urls: list[str] = Field(default_factory=list)
    # Previous schema JSON, sent back when the caller is refining rather than
    # starting fresh.
    hint: dict | None = None
    instruction: str | None = None
    # The caller's own provider keys, decrypted by the gateway, keyed by
    # provider name. Same semantics as StructuredRequest's.
    provider_keys: dict[str, str] | None = None
    provider_models: dict[str, str] | None = None
    provider_base_urls: dict[str, str] | None = None
    # Naming a provider is the only way to reach a local runtime: auto-pick
    # walks cloud vendors, so an instance with only Ollama configured would
    # otherwise report no credentials.
    provider: str | None = None
    model: str | None = None


class SchemaResponse(BaseModel):
    schema_: dict = Field(alias="schema")
    summary: str
    tokens_input: int
    tokens_output: int
    model_used: str

    model_config = {"populate_by_name": True}


@app.post("/schema", response_model=SchemaResponse, response_model_by_alias=True)
async def generate_schema(request: SchemaRequest) -> SchemaResponse:
    try:
        result = await schema_gen.generate_schema(
            prompt=request.prompt,
            urls=request.urls,
            hint=request.hint,
            instruction=request.instruction,
            provider=request.provider,
            model=request.model,
            provider_keys=request.provider_keys,
            provider_models=request.provider_models,
            provider_base_urls=request.provider_base_urls,
        )
    except llm.RequestError as exc:
        raise HTTPException(
            status_code=400, detail={"message": exc.message, "field": exc.field}
        ) from exc
    except llm.ProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return SchemaResponse(
        schema=result.schema,
        summary=result.summary,
        tokens_input=result.tokens_input,
        tokens_output=result.tokens_output,
        model_used=result.model_used,
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
