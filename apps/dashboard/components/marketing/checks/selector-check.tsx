'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HelixApiError } from '@/lib/api';
import { fetchHtmlForSelectors, matchSelector, selectorAsScrapeBody, type SelectorKind } from '@/lib/checks';
import { PillButton } from '@/components/marketing/pill-button';
import {
  CheckPanel,
  ErrorNote,
  FieldLabel,
  KeyNote,
  RunLabel,
  inputClass,
  needsKey,
  useCheckKey,
} from './check-shell';

function CopyBody({ body }: { body: string }) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor="selector-body">Request body</FieldLabel>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(body).then(() => setCopied(true));
          }}
          className="inline-flex items-center gap-1.5 font-mono text-[12px] text-m-ink/56 transition-colors duration-150 ease-out hover:text-m-ink"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        id="selector-body"
        className="overflow-x-auto rounded-card border border-m-border-muted bg-m-ink/[0.024] px-4 py-3 font-mono text-[12px] leading-relaxed text-m-ink"
      >
        {body}
      </pre>
    </div>
  );
}

export function SelectorCheck() {
  const { apiKey, ready } = useCheckKey();
  const [url, setUrl] = React.useState('');
  const [kind, setKind] = React.useState<SelectorKind>('css');
  const [selector, setSelector] = React.useState('');
  const [html, setHtml] = React.useState<string | null>(null);
  const [fetchedUrl, setFetchedUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const blocked = needsKey(apiKey) && ready;

  // One fetch, many selectors: matching is local, so typing re-runs without another request.
  const result = React.useMemo(
    () => (html === null ? null : matchSelector(html, selector, kind)),
    [html, selector, kind],
  );

  async function onFetch(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const target = url.trim();
      const fetched = await fetchHtmlForSelectors(target, apiKey);
      setHtml(fetched);
      setFetchedUrl(target);
    } catch (err) {
      setHtml(null);
      setError(err instanceof HelixApiError ? err.message : 'That page could not be fetched.');
    } finally {
      setBusy(false);
    }
  }

  const body = result && result.matches.length > 0 ? selectorAsScrapeBody(fetchedUrl, selector, kind) : null;

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose font-sans text-[15px] leading-relaxed text-m-ink/72">
        Test a selector against a real page, then copy it straight into a scrape. The page is fetched once through{' '}
        <code className="font-mono text-[13px]">/scrape</code> — a browser cannot read another site directly — and every
        keystroke after that re-matches locally.
      </p>

      <form onSubmit={onFetch} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="selector-url">URL</FieldLabel>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <input
              id="selector-url"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/pricing"
              className={inputClass}
            />
            <PillButton type="submit" variant="primary" disabled={busy || blocked}>
              <RunLabel busy={busy}>{html ? 'Refetch' : 'Fetch'}</RunLabel>
            </PillButton>
          </div>
        </div>
        {blocked && <KeyNote />}
        {error && <ErrorNote>{error}</ErrorNote>}
      </form>

      {html !== null && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <FieldLabel htmlFor="selector-input">Selector</FieldLabel>
              <div className="flex gap-1">
                {(['css', 'xpath'] as SelectorKind[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setKind(option)}
                    aria-pressed={kind === option}
                    className={cn(
                      'rounded-pill px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors duration-150 ease-out',
                      kind === option ? 'bg-m-ink/[0.078] text-m-ink' : 'text-m-ink/48 hover:text-m-ink',
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <input
              id="selector-input"
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
              aria-invalid={result?.error ? true : undefined}
              placeholder={kind === 'css' ? '.plan > h3' : '//h3[@class="title"]'}
              className={inputClass}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {result?.error && <ErrorNote>{result.error}</ErrorNote>}

          {result && !result.error && selector.trim() !== '' && (
            <CheckPanel>
              <div className="border-b border-m-border-faint px-5 py-3">
                <p className="font-mono text-[13px] text-m-ink">
                  {result.matches.length === 0 ? 'No matches' : `${result.matches.length} match${result.matches.length === 1 ? '' : 'es'}`}
                </p>
              </div>
              {result.matches.length > 0 && (
                <div className="max-h-[24rem] overflow-auto">
                  {result.matches.map((match) => (
                    <div key={match.index} className="border-b border-m-border-faint px-5 py-3 last:border-b-0">
                      <p className="overflow-x-auto whitespace-pre font-mono text-[12px] text-m-ink/72">{match.outerHtml}</p>
                      {match.textContent && (
                        <p className="mt-1.5 truncate font-mono text-[12px] text-m-ink/48">{match.textContent}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CheckPanel>
          )}

          {body && <CopyBody body={body} />}
          {result && result.matches.length > 0 && kind === 'xpath' && (
            <p className="font-mono text-[12px] text-m-ink/56">
              Scrape takes CSS in <code>includeSelectors</code>; there is no XPath option, so this one has no body to
              copy. Use it to find the element, then write the CSS equivalent.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
