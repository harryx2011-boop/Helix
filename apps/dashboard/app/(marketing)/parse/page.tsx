import type { Metadata } from 'next';
import DocumentPage from '../document/page';

/**
 * Parse folded into the Document API. Kept as a page rather than a redirect
 * because `output: export` (self-host) does not run `redirects()`, so a
 * rewrite here would 404 on the static build while working on the hosted one.
 */
export const metadata: Metadata = {
  title: 'Document Parsing — Helix Document API',
  description: 'PDF, DOCX, PPTX and XLSX by upload or URL. OCR only when the text layer is missing.',
  alternates: { canonical: '/document' },
};

export default function ParsePage() {
  return <DocumentPage />;
}
