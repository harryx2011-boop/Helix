import type { Metadata } from 'next';
import { ScanEye, Table2, FileStack, Fingerprint } from 'lucide-react';
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
        { icon: FileStack, eyebrow: 'Docs to data', lead: 'Four formats, one envelope.', body: 'PDF, DOCX, PPTX and XLSX come back exactly like a scraped page.', evidence: 'https://example.com/files/invoice.pdf' },
        { icon: ScanEye, eyebrow: 'Knows when to look', lead: 'OCR only when needed.', body: 'Scanned pages route to OCR; text-layer documents skip it.', evidence: '"ocr": "auto"  ·  "ocrUsed": false' },
        { icon: Table2, eyebrow: 'Structure kept', lead: 'Tables survive the trip.', body: 'Spreadsheet rows, slides and PDF tables land as markdown tables.', evidence: '| Item | Qty | Price |' },
        { icon: Fingerprint, eyebrow: 'Parsed once', lead: 'Cached by content hash.', body: 'The same file from two mirrors parses once.', evidence: '"fromCache": true' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
