import type { Metadata } from 'next';
import { FileScan, ScanEye, Table2, FileStack, UploadCloud, Fingerprint } from 'lucide-react';
import { CapabilityPage } from '@/components/marketing/pages/capability-page';

export const metadata: Metadata = {
  title: 'Document Parsing API',
  description: 'PDFs and Office files read like pages. Upload a file or point at a URL, OCR only when the text layer is missing.',
};

const REQUEST = `POST /v1/parse
{
  "url": "https://example.com/files/invoice.pdf",
  "formats": ["markdown", "json"],
  "ocr": "auto",
  "jsonOptions": {
    "schema": {
      "type": "object",
      "properties": {
        "invoiceTotal": { "type": "number" }
      }
    }
  }
}

# or upload directly
curl -F file=@invoice.pdf -F ocr=auto \\
     -F formats=markdown,json \\
     -F 'jsonOptions={"prompt":"the invoice total"}' \\
     /v1/parse`;

const RESPONSE = `{
  "success": true,
  "data": {
    "markdown": "# Invoice 0142\\n...",
    "json": { "invoiceTotal": 4820.00 },
    "metadata": {
      "filename": "invoice.pdf",
      "pageCount": 2,
      "fileType": "pdf",
      "ocrUsed": false,
      "needsOcr": false,
      "suspectedGarbledText": false,
      "parser": "pypdfium2",
      "sizeBytes": 48211,
      "contentHash": "9f2c…",
      "sourceUrl": "https://example.com/files/invoice.pdf",
      "fromCache": false
    }
  }
}`;

export default function ParsePage() {
  return (
    <CapabilityPage
      endpoint="parse"
      h1={['PDFs and Office files,', 'read like pages.']}
      subhead="Upload a file or point at a URL. OCR only when the text layer is missing."
      mock={{
        chrome: 'browser',
        label: 'invoice.pdf',
        code: `# Invoice 0142

**Bill to:** Acme Co.
**Total:** $4,820.00

| Item        | Qty | Price   |
|-------------|-----|---------|
| Consulting  | 40  | $100.00 |

{
  "invoiceTotal": 4820.00
}`,
      }}
      features={[
        { icon: FileStack, title: 'Four formats, one contract', body: 'PDF, DOCX, PPTX and XLSX return the same markdown-or-JSON envelope Scrape uses for web pages. Point Parse at an HTML page and it says so rather than guessing.' },
        { icon: UploadCloud, title: 'Upload or URL', body: 'Send a multipart file part directly, or pass a URL and Helix fetches the bytes first. The operator sets the upload ceiling; anything over it is a 413, not a silent truncation.' },
        { icon: ScanEye, title: 'OCR only when needed', body: 'Every PDF is classified before parsing. Under `ocr: auto`, scanned or garbled pages route to OCR and text-layer documents skip it. `force` and `off` override the call, and the metadata reports what was decided.' },
        { icon: Table2, title: 'Tables survive the trip', body: 'Spreadsheet rows, slides and PDF tables convert to markdown tables. `tables: high-fidelity` routes PDFs to a table-specialised parser when one is installed.' },
        { icon: Fingerprint, title: 'Parsed once per file', body: 'Output is cached by content hash, not URL. The same invoice uploaded twice, or fetched from two mirrors, parses once and comes back with `fromCache: true`.' },
        { icon: FileScan, title: 'Schema extraction on documents', body: 'Add `formats: ["json"]` with a schema or a prompt in `jsonOptions` and the parsed text goes through your own configured model. If the model step fails, the markdown still comes back with a warning.' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
