import type { Metadata } from 'next';
import { FileStack, Fingerprint, ScanEye, Table2 } from 'lucide-react';
import { CapabilityPage } from '@/components/marketing/pages/capability-page';

export const metadata: Metadata = {
  title: 'Document API',
  description:
    'PDF, DOCX, PPTX and XLSX in. Markdown, structured JSON, page images or a scrubbed copy out — one envelope, four operations.',
};

const REQUEST = `POST /v1/document
{
  "op": "parse",
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

# op: "convert"   page images, or an Office file as markdown
# op: "metadata"  what the file discloses, and a scrubbed copy
# op: "assess"    text-layer quality before you spend on OCR`;

const RESPONSE = `{
  "success": true,
  "data": {
    "op": "parse",
    "markdown": "# Invoice 0142\n...",
    "json": { "invoiceTotal": 4820.00 },
    "metadata": {
      "filename": "invoice.pdf",
      "pageCount": 2,
      "fileType": "pdf",
      "ocrUsed": false,
      "needsOcr": false,
      "parser": "pypdfium2",
      "contentHash": "9f2c…",
      "fromCache": false
    }
  }
}`;

export default function DocumentPage() {
  return (
    <CapabilityPage
      endpoint="document"
      h1={['Every document operation,', 'one envelope.']}
      subhead="Parse, convert, inspect and scrub. Four operations behind one endpoint, so a file only has to be described once."
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
        {
          icon: FileStack,
          lead: 'Four operations, one shape.',
          body: 'Parse, convert, metadata and assess take the same file input and return the same envelope.',
          evidence: 'operations by share · sample instance',
          meters: [
            { label: 'parse', value: 61, accent: true },
            { label: 'convert', value: 21 },
            { label: 'metadata', value: 12 },
            { label: 'assess', value: 6 },
          ],
        },
        {
          icon: ScanEye,
          lead: 'OCR only when needed.',
          body: 'Assess reads the text layer first, so scanned pages route to OCR and the rest skip it.',
          evidence: '"ocr": "auto"  ·  "ocrUsed": false',
        },
        {
          icon: Table2,
          lead: 'Tables survive the trip.',
          body: 'Spreadsheet rows, slides and PDF tables land as markdown tables, not flattened prose.',
          evidence: '| Item | Qty | Price |',
        },
        {
          icon: Fingerprint,
          lead: 'Cached by content hash.',
          body: 'The same file from two mirrors is read once, whichever operation asks for it.',
          evidence: '"fromCache": true · hit rate',
          meterSize: 'thin',
          meters: [
            { label: 'cache hit', value: 62, accent: true },
            { label: 'read fresh', value: 38 },
            { label: 'ocr run', value: 16 },
          ],
        },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
