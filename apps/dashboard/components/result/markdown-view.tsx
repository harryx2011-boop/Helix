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

function useKatexCss(enabled: boolean) {
  React.useEffect(() => {
    if (!enabled || katexCssLoaded) return;
    katexCssLoaded = true;
    import('katex/dist/katex.min.css');
  }, [enabled]);
}

function SafeAnchor({ href, children, ...props }: React.ComponentPropsWithoutRef<'a'>) {
  if (!href) return <span>{children}</span>;
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
  components?: Components;
  className?: string;
}

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
