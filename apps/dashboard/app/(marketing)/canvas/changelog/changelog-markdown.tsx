'use client';

import { MarkdownView } from '@/components/result/markdown-view';

/**
 * A `components` override with a function value (`h1: () => null`) cannot cross
 * the server/client boundary as a prop — React Server Components can only
 * serialize plain data into a Client Component. This wrapper stays entirely on
 * the client side so the override is constructed where it is used, and the
 * server page above only ever passes it a plain markdown string.
 */
export function ChangelogMarkdown({ content }: { content: string }) {
  return <MarkdownView content={content} className="" components={{ h1: () => null }} />;
}
