import type { Metadata } from 'next';
import { FileScan, ScanEye, Table2, FileStack, UploadCloud, FileWarning } from 'lucide-react';
import { CapabilityPage } from '@/components/marketing/pages/capability-page';

export const metadata: Metadata = {
  title: 'Document Parsing API',
  description: 'PDFs and Office files read like pages. Upload a file or point at a URL, OCR only when the text layer is missing.',
};

const REQUEST = `POST /v1/parse
{
  "url": "https://example.com/files/report.pdf",
  "formats": ["markdown", "json"],
  "ocr": "auto"
}`;

const RESPONSE = `{
  "success": true,
  "data": {
    "markdown": "# Q3 Report\\n...",
    "metadata": {
      "filename": "report.pdf",
      "pageCount": 12,
      "fileType": "pdf",
      "ocrUsed": false
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
        { icon: FileStack, title: 'Four formats, one contract', body: 'PDF, DOCX, PPTX and XLSX all return the same markdown-or-JSON envelope Scrape uses for web pages.' },
        { icon: UploadCloud, title: 'Upload or URL', body: 'Send a multipart file directly, or point at a remote URL and let Helix fetch it first.' },
        { icon: ScanEye, title: 'OCR only when needed', body: 'Scanned or garbled pages route to OCR automatically. Text-layer documents skip it entirely, so parsing stays fast.' },
        { icon: Table2, title: 'Tables survive the trip', body: 'Spreadsheet rows and PDF tables convert to markdown tables rather than flattening into prose.' },
        { icon: FileWarning, title: 'Garbled text is detected', body: 'A text layer that decodes suspiciously, common with CJK PDFs, triggers the OCR fallback automatically under `ocr: auto`.' },
        { icon: FileScan, title: 'Schema extraction on documents', body: 'The same `extract` schema-or-prompt mechanism from Scrape works against parsed document content.' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
