'use client';

import * as React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { isHttpHref, markdownUrlTransform } from '@/lib/markdown-links';
import { preprocessMarkdownMath } from '@/lib/markdown-math';
import { MarkdownCodeBlock } from './markdown-code-block';

let katexCssLoaded = false;

/**
 * KaTeX's stylesheet ships in the `katex` package already installed for
 * rehype-katex; importing it dynamically bundles it via Next rather than
 * reaching out to a CDN, so math still renders in the offline desktop app.
 * Only loaded on a page that actually renders math.
 */
function useKatexCss(enabled: boolean) {
  React.useEffect(() => {
    if (!enabled || katexCssLoaded) return;
    katexCssLoaded = true;
    import('katex/dist/katex.min.css');
  }, [enabled]);
}

/** Anchors safe (http/https/mailto/relative); anything else — `javascript:`, `data:`, `file:` — renders as plain text, never a link. */
function SafeAnchor({ href, children, ...props }: React.ComponentPropsWithoutRef<'a'>) {
  if (!href) return <span>{children}</span>;
  // Same http(s)-detection the link policy itself uses (lib/markdown-links.ts),
  // rather than a second ad hoc `/^https?:/` — so a URL shape the policy treats
  // as "http-like" (a protocol-relative URL, if one ever slipped through a
  // future change to the policy) still gets rel="noopener noreferrer" here too.
  const isExternal = isHttpHref(href);
  return (
    <a href={href} {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...props}>
      {children}
    </a>
  );
}

function CodeOrInline(props: React.ComponentPropsWithoutRef<'code'> & { node?: unknown }) {
  const { className, children, node: _node, ...rest } = props;
  const isFenced = /language-/.test(className ?? '');
  if (isFenced) {
    return <MarkdownCodeBlock className={className ?? ''}>{children}</MarkdownCodeBlock>;
  }
  return (
    <code className={className} {...rest}>
      {children}
    </code>
  );
}

/** react-markdown wraps a fenced block in `pre > code`; the code override already renders its own `pre`/copy-button chrome, so `pre` here is a pass-through. */
function PrePassthrough({ children }: React.ComponentPropsWithoutRef<'pre'>) {
  return <>{children}</>;
}

const DEFAULT_COMPONENTS: Components = {
  a: SafeAnchor,
  code: CodeOrInline,
  pre: PrePassthrough,
};

interface MarkdownViewProps {
  content: string;
  /** Extra tag-to-component overrides, merged over the defaults (link policy, code highlighting) — never replacing them. */
  components?: Components;
  className?: string;
}

/** Styled via `.markdown-body` in globals.css rather than a typography plugin — one less dependency for a few element rules. */
export function MarkdownView({ content, components, className }: MarkdownViewProps) {
  const processed = React.useMemo(() => preprocessMarkdownMath(content), [content]);
  const hasMath = /\$|\\\(|\\\[/.test(content);
  useKatexCss(hasMath);

  const merged = React.useMemo<Components>(
    () => (components ? { ...DEFAULT_COMPONENTS, ...components } : DEFAULT_COMPONENTS),
    [components],
  );

  return (
    <div className={className ?? 'markdown-body text-sm leading-relaxed'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={markdownUrlTransform}
        components={merged}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
