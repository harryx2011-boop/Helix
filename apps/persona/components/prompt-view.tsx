'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { cn } from '@/lib/utils';
import { useTemplateValues } from '@/lib/store';
import { segmentPlaceholders } from '@/lib/placeholders';

/** Renders text children, swapping every {{TOKEN}} for a placeholder pill (filled when a saved value exists). */
function TokenizedText({ text }: { text: string }) {
  const { values } = useTemplateValues();
  const segments = segmentPlaceholders(text);
  if (segments.length === 1 && segments[0]!.type === 'text') return <>{text}</>;
  return (
    <>
      {segments.map((segment, i) => {
        if (segment.type === 'text') return <React.Fragment key={i}>{segment.value}</React.Fragment>;
        const value = values[segment.key];
        const filled = Boolean(value);
        return (
          <span key={i} className={cn('placeholder', filled && 'filled')} title={segment.key}>
            {filled ? value : `{{${segment.key}}}`}
          </span>
        );
      })}
    </>
  );
}

function tokenize(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === 'string') return <TokenizedText text={child} />;
    return child;
  });
}

const components: Components = {
  p: ({ children, ...props }) => <p {...props}>{tokenize(children)}</p>,
  li: ({ children, ...props }) => <li {...props}>{tokenize(children)}</li>,
  h1: ({ children, ...props }) => <h1 {...props}>{tokenize(children)}</h1>,
  h2: ({ children, ...props }) => <h2 {...props}>{tokenize(children)}</h2>,
  h3: ({ children, ...props }) => <h3 {...props}>{tokenize(children)}</h3>,
  strong: ({ children, ...props }) => <strong {...props}>{tokenize(children)}</strong>,
  td: ({ children, ...props }) => <td {...props}>{tokenize(children)}</td>,
};

export function PromptView({ body, className }: { body: string; className?: string }) {
  return (
    <div className={cn('prose-persona', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
