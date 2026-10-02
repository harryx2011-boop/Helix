import type { Metadata } from 'next';
import DocumentPage from '../document/page';

/**
 * Parse folded into the document page. Kept as a page rather than a redirect
 * because `output: export` (self-host) does not run `redirects()`, so a
 * rewrite here would 404 on the static build while working on the hosted one.
 */
export const metadata: Metadata = {
  title: 'Read a document',
  description: 'Open PDF, Word, PowerPoint and Excel files, from a link or your own computer, and get the text and tables back.',
  alternates: { canonical: '/document' },
};

export default function ParsePage() {
  return <DocumentPage />;
}
