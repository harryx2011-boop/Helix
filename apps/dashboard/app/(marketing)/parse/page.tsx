import type { Metadata } from 'next';
import DocumentPage from '../document/page';

export const metadata: Metadata = {
  title: 'Document Parsing — Helix Document API',
  description: 'PDF, DOCX, PPTX and XLSX by upload or URL. OCR only when the text layer is missing.',
  alternates: { canonical: '/document' },
};

export default function ParsePage() {
  return <DocumentPage />;
}
