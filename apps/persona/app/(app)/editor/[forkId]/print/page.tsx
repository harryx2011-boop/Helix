'use client';

import * as React from 'react';
import { use } from 'react';
import { markdownToHtml } from '@/lib/fork';
import { useForks } from '@/lib/store';

/**
 * Print route for the .pdf export (PERSONA.md §6): renders the fork in
 * `.prose-persona`, hides everything else under print, and triggers
 * `window.print()` once content is ready. Opened in a new tab.
 */
export default function PrintForkPage({ params }: { params: Promise<{ forkId: string }> }) {
  const { forkId } = use(params);
  const { forks } = useForks();
  const [hydrated, setHydrated] = React.useState(false);
  const printed = React.useRef(false);

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  const fork = forks.find((f) => f.id === forkId);

  React.useEffect(() => {
    if (!hydrated || !fork || printed.current) return;
    printed.current = true;
    const id = window.setTimeout(() => window.print(), 200);
    return () => window.clearTimeout(id);
  }, [hydrated, fork]);

  if (!hydrated) return null;

  if (!fork) {
    return (
      <div className="p-8 text-sm text-p-ink-2">
        Fork not found in this browser.
      </div>
    );
  }

  return (
    <div className="print-page">
      <style>{`
        .print-page {
          --p-bg: #fbfbfb;
          --p-surface: #ffffff;
          --p-ink: #111114;
          --p-ink-2: #4b4b55;
          --p-ink-3: #8c8c96;
          --p-line: #e6e6eb;
          --p-line-2: #d4d4dc;
          --p-code: #f4f4f7;
          --p-blue: #2f6fe4;
          --p-blue-soft: rgba(47, 111, 228, 0.1);
          background: var(--p-bg);
          color: var(--p-ink);
          color-scheme: light;
          max-width: 720px;
          margin: 0 auto;
          padding: 24px;
        }
        @media print {
          @page { size: A4; margin: 20mm 18mm; }
          .print-chrome { display: none !important; }
        }
      `}</style>
      <p className="print-chrome mb-4 rounded-card border border-p-line bg-p-code px-3 py-2 text-xs text-p-ink-2">
        Choose &ldquo;Save as PDF&rdquo; in the print dialog.
      </p>
      <div className="prose-persona" dangerouslySetInnerHTML={{ __html: markdownToHtml(fork.bodyMd) }} />
    </div>
  );
}
