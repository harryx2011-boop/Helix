'use client';

import * as React from 'react';
import { Check, Copy } from '@/components/icons/lucide';
import { cn } from '@/lib/utils';
import { resolveShikiLang } from '@/lib/shiki-langs';

/**
 * Fenced code block: renders plain text immediately (safe mid-stream, no
 * highlighter dependency on the critical path), then swaps in Shiki markup
 * once the lazy-loaded highlighter resolves. An unknown or missing fence
 * language stays plain. Shiki's own singleton highlighter is cached at
 * module scope so repeated blocks on one page share it.
 */
let highlighterPromise: Promise<import('shiki').Highlighter> | undefined;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['github-dark', 'github-light'],
        langs: ['javascript', 'jsx', 'typescript', 'tsx', 'json', 'yaml', 'bash', 'python', 'html', 'css', 'markdown', 'sql', 'diff', 'toml', 'http'],
      }),
    );
  }
  return highlighterPromise;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(timeoutRef.current), []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy code'}
      className={cn(
        'absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-card border border-border/60 bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition-opacity duration-150 ease-out group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100',
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function MarkdownCodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const raw = String(children ?? '').replace(/\n$/, '');
  const fenceLang = /language-(\S+)/.exec(className ?? '')?.[1];
  const lang = resolveShikiLang(fenceLang);
  const [html, setHtml] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!lang) {
      setHtml(undefined);
      return;
    }
    let cancelled = false;
    getHighlighter()
      .then((highlighter) => {
        if (cancelled) return;
        // Dual-theme output: Shiki emits both palettes as CSS variables and
        // switches on the nearest `.dark` ancestor, the same mechanism the
        // dashboard's own tokens use, rather than hardcoding one theme.
        setHtml(
          highlighter.codeToHtml(raw, {
            lang,
            themes: { light: 'github-light', dark: 'github-dark' },
            defaultColor: 'light',
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setHtml(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [raw, lang]);

  return (
    <div className="group relative">
      <CopyButton text={raw} />
      {html ? (
        <div
          className="[&_pre]:overflow-x-auto [&_pre]:rounded-[var(--radius)] [&_pre]:p-4 [&_pre]:text-[13px] [&_pre]:leading-relaxed"
          // Shiki's own output — generated HTML from a fixed theme/grammar set, not user input.
          // Its light/dark colors are CSS variables (`--shiki-light`/`--shiki-dark`)
          // switched by the `.dark .shiki` rule in globals.css, the same `.dark`
          // class the dashboard's own tokens key off.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto rounded-[var(--radius)] bg-secondary p-4 text-[13px] leading-relaxed">
          <code>{raw}</code>
        </pre>
      )}
    </div>
  );
}
