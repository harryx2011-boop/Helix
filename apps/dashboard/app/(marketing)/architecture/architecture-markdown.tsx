'use client';

import * as React from 'react';
import { MarkdownView } from '@/components/result/markdown-view';
import { GITHUB_URL } from '@/lib/github-stars';

/** Anchors `/architecture#roadmap` to the "Build order" heading without a rehype-slug dependency. */
function H2({ children, ...props }: React.ComponentPropsWithoutRef<'h2'>) {
  const text = React.Children.toArray(children).join('');
  const id = /build order/i.test(text) ? 'roadmap' : undefined;
  return (
    <h2 id={id} {...props}>
      {children}
    </h2>
  );
}

/**
 * The document links its siblings by bare filename; on the site those files only
 * exist in the repo, so a bare relative reference is resolved to its GitHub blob
 * URL before the shared link policy sees it (bare filenames have no scheme and
 * would otherwise pass through as same-origin, 404ing on this site).
 */
function A({ href, children, ...props }: React.ComponentPropsWithoutRef<'a'>) {
  const resolved = href && !/^(?:[a-z]+:|\/|#)/i.test(href) ? `${GITHUB_URL}/blob/main/${href}` : href;
  return (
    <a href={resolved} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}

/**
 * A `components` override with function values (`h1`, `h2`, `a`) cannot cross
 * the server/client boundary as a prop — React Server Components can only
 * serialize plain data into a Client Component. This wrapper stays entirely on
 * the client side so the overrides are constructed where they are used, and
 * the server page above only ever passes it a plain markdown string.
 */
export function ArchitectureMarkdown({ content }: { content: string }) {
  return <MarkdownView content={content} className="" components={{ h1: () => null, h2: H2, a: A }} />;
}
