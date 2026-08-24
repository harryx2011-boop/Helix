# Helix — Document Parsing API Spec

## 1. Goal
Convert uploaded or linked documents (PDF, DOCX, PPTX, XLSX, images with text) into clean markdown or structured JSON — same output contract as Scrape, but for files instead of live pages. Open source, self-hosted, no hosted tier.

## 2. Architecture
- **TypeScript API gateway**: handles file upload (multipart) or remote-URL fetch, auth (local API keys).
- **Python service**: does the actual parsing. Library choices per format:
  - PDF: text-layer extraction (e.g. `pdfplumber`/`pymupdf`) with OCR fallback (e.g. self-hosted `tesseract` or `PaddleOCR`) for scanned pages — no external OCR API dependency by default, keeping the stack fully self-hostable.
  - DOCX/PPTX/XLSX: `python-docx`, `python-pptx`, `openpyxl` for structured content; tables/slides converted to markdown.
  - Images: OCR only.
- **Rust** is not in the critical path here unless remote-URL fetching of the source file needs the same fetch infra as Scrape (in which case it reuses the Rust fetcher).
- Flow: Gateway (TS) → file received or fetched via Rust fetcher → Python parses per-format → markdown/JSON assembled → returned.

## 3. BYOK — AI Provider Configuration
Same BYOK setup as the Scraping API (see that spec's BYOK section). Used here only when `jsonOptions` requests schema/prompt-based extraction from parsed content — the same `HELIX_LLM_PROVIDER` / API key env vars apply across all Helix APIs, configured once per instance.

## 4. Endpoint

### `POST /v1/parse`

**Request** (multipart or JSON with remote URL)
```json
{
  "url": "https://example.com/files/report.pdf",
  "formats": ["markdown", "json"],
  "ocr": "auto",
  "jsonOptions": {
    "schema": { "type": "object", "properties": { "invoiceTotal": { "type": "number" } } },
    "provider": "openai"
  }
}
```
or multipart form field `file` for direct upload.

**Response**
```json
{
  "success": true,
  "data": {
    "markdown": "# Q3 Report\n...",
    "json": { "invoiceTotal": 4820.00 },
    "metadata": {
      "filename": "report.pdf",
      "pageCount": 12,
      "fileType": "pdf",
      "ocrUsed": false
    }
  }
}
```

## 5. Schemas
- `ParseRequest`: `url` OR `file` (one required), `formats` (`markdown` | `json`), `ocr` (`auto` | `force` | `off`), `jsonOptions` (schema + prompt + optional `provider`/`model` override).
- `ParseResponse`: `success`, `data`, `metadata` (`filename`, `pageCount`, `fileType`, `ocrUsed`), `error`.
- Supported `fileType` enum: `pdf`, `docx`, `pptx`, `xlsx`, `png`, `jpg`.

## 6. Infra notes
- Max upload size configurable by the operator (default suggestion: 25MB) enforced at the TS gateway before it reaches Python.
- OCR is the expensive path — queue OCR jobs separately from text-layer-only jobs so heavy scans don't block fast parses.
- Cache parsed output by file hash (not URL) locally so re-uploading the same file doesn't reprocess it.
- No metering — resource limits are operator-controlled (queue concurrency, worker replica count).

## 7. Open questions
- [ ] Bundle Tesseract/PaddleOCR in the default Docker image, or make OCR an optional add-on service to keep the base image lean?
- [ ] Do we support batch parsing (multiple files in one call) in v1, or single-file only?
- [ ] Table extraction fidelity for XLSX/complex PDFs — how far do we go before punting to raw JSON dump?
