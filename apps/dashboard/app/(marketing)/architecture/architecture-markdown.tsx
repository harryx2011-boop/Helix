'use client';

import * as React from 'react';
import { MarkdownView } from '@/components/result/markdown-view';
import { GITHUB_URL } from '@/lib/github-stars';

function H2({ children, ...props }: React.ComponentPropsWithoutRef<'h2'>) {
  const text = React.Children.toArray(children).join('');
  const id = /build order/i.test(text) ? 'roadmap' : undefined;
  return (
    <h2 id={id} {...props}>
      {children}
    </h2>
  );
}

function A({ href, children, ...props }: React.ComponentPropsWithoutRef<'a'>) {
  const resolved = href && !/^(?:[a-z]+:|\/|#)/i.test(href) ? `${GITHUB_URL}/blob/main/${href}` : href;
  return (
    <a href={resolved} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}

export function ArchitectureMarkdown({ content }: { content: string }) {
  return <MarkdownView content={content} className="" components={{ h1: () => null, h2: H2, a: A }} />;
}
