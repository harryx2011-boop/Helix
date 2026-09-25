import type { Metadata } from 'next';
import DocumentPage from '../document/page';

/**
 * Metadata folded into the Document API. Page, not redirect — see ../parse.
 */
export const metadata: Metadata = {
  title: 'File Metadata — Helix Document API',
  description: 'What a file gives away about who and what made it, and a copy without it.',
  alternates: { canonical: '/document' },
};

export default function MetadataPage() {
  return <DocumentPage />;
}
