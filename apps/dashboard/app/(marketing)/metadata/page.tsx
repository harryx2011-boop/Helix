import type { Metadata } from 'next';
import DocumentPage from '../document/page';

/**
 * Metadata folded into the document page. Page, not redirect: see ../parse.
 */
export const metadata: Metadata = {
  title: 'Check what a file gives away',
  description: 'See the author and software details hidden inside a file, and save a copy without them.',
  alternates: { canonical: '/document' },
};

export default function MetadataPage() {
  return <DocumentPage />;
}
