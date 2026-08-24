'use client';

import * as React from 'react';
import { ArrowRight, Check, Copy, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateCode, KEY_PLACEHOLDER, LANGS, type Lang } from '@/lib/codegen';
import { EXAMPLE_REQUEST } from '@/lib/catalog';
import { CodeToken } from './code-panel';
import { LadderExplainer } from './ladder-explainer';

/**
 * WEBSITE.md §4.2 hero panel: URL input row, language tabs, generated code via
 * generateCode with KEY_PLACEHOLDER, copy button, and the ladder explainer below.
 * Composes only — never fetches.
 */
export function HeroPanel({ id }: { id?: string }) {
  const [url, setUrl] = React.useState('https://example.com/pricing');
  const [lang, setLang] = React.useState<Lang>('curl');
  const [copied, setCopied] = React.useState(false);
  const [playKey, setPlayKey] = React.useState<number | undefined>(undefined);

  const body = { ...EXAMPLE_REQUEST.scrape, url: url || 'https://example.com/pricing' };
  const code = generateCode(lang, { endpoint: 'scrape', body });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPlayKey((k) => (k ?? 0) + 1);
  }

  React.useEffect(() => {
    function onReplay() {
      setPlayKey((k) => (k ?? 0) + 1);
    }
    window.addEventListener('helix:play-ladder', onReplay);
    return () => window.removeEventListener('helix:play-ladder', onReplay);
  }, []);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div id={id} className="w-full max-w-[720px] overflow-hidden rounded-panel bg-m-surface shadow-card ring-8 ring-m-bg">
      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-b border-m-border-faint p-3">
        <div className="flex flex-1 items-center gap-2 rounded-card border border-m-border-muted bg-m-bg px-3 py-2">
          <Globe className="h-4 w-4 shrink-0 text-m-ink/40" aria-hidden />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/pricing"
            className="w-full bg-transparent font-mono text-[13px] text-m-ink outline-none placeholder:text-m-ink/32"
            aria-label="URL to scrape"
          />
        </div>
        <button
          type="submit"
          aria-label="Run the ladder explainer"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-violet text-white shadow-btn transition-shadow duration-200 ease-out hover:shadow-btn-hover"
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </form>

      <div className="flex items-center justify-between px-3 pt-3">
        <div className="flex items-center gap-1 rounded-pill bg-m-bg p-1">
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLang(l.id)}
              className={cn(
                'rounded-pill px-3 py-1 font-mono text-[12px] transition-colors duration-150 ease-out',
                lang === l.id ? 'bg-m-surface text-m-ink shadow-card-sm' : 'text-m-ink/48 hover:text-m-ink/72',
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code"
          className="flex h-7 w-7 items-center justify-center rounded-md text-m-ink/40 transition-colors duration-150 ease-out hover:bg-m-ink/[0.039] hover:text-m-ink"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="overflow-x-auto px-4 py-4">
        <pre className="whitespace-pre font-mono text-[13px] leading-relaxed">
          <HighlightedCode code={code} keyPlaceholder={KEY_PLACEHOLDER} />
        </pre>
      </div>

      <div className="border-t border-m-border-faint bg-m-bg-lighter px-4 py-4">
        <LadderExplainer playKey={playKey} />
      </div>
    </div>
  );
}

/** Minimal 4-token highlighter: strings violet, punctuation muted, keys ink/72, rest plain. */
function HighlightedCode({ code, keyPlaceholder }: { code: string; keyPlaceholder: string }) {
  const lines = code.split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <div key={i}>{highlightLine(line, keyPlaceholder)}</div>
      ))}
    </>
  );
}

function highlightLine(line: string, keyPlaceholder: string): React.ReactNode {
  const parts = line.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g);
  return parts.map((part, i) => {
    if (!part) return null;
    if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"))) {
      return (
        <CodeToken key={i} kind="string">
          {part}
        </CodeToken>
      );
    }
    if (part.includes(keyPlaceholder)) {
      const idx = part.indexOf(keyPlaceholder);
      return (
        <React.Fragment key={i}>
          {part.slice(0, idx)}
          <CodeToken kind="string">{keyPlaceholder}</CodeToken>
          {part.slice(idx + keyPlaceholder.length)}
        </React.Fragment>
      );
    }
    return (
      <CodeToken key={i} kind="plain">
        {part}
      </CodeToken>
    );
  });
}
