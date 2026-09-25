'use client';

import * as React from 'react';
import { HelixApiError, type RobotsCheckResponse } from '@/lib/api';
import { runRobotsCheck } from '@/lib/checks';
import { PillButton } from '@/components/shared/pill-button';
import {
  CheckPanel,
  ErrorNote,
  FieldLabel,
  KeyNote,
  ResultRow,
  RunLabel,
  Verdict,
  inputClass,
  needsKey,
  useCheckKey,
} from './check-shell';

const DEFAULT_UA = 'HelixBot';

export function RobotsCheck() {
  const { apiKey, ready } = useCheckKey();
  const [url, setUrl] = React.useState('');
  const [userAgent, setUserAgent] = React.useState(DEFAULT_UA);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RobotsCheckResponse | null>(null);

  const blocked = needsKey(apiKey) && ready;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const trimmed = userAgent.trim();
      const response = await runRobotsCheck({ url: url.trim(), ...(trimmed ? { userAgent: trimmed } : {}) }, apiKey);
      setResult(response);
    } catch (err) {
      setError(err instanceof HelixApiError ? err.message : 'That check could not run.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose font-sans text-[15px] leading-relaxed text-m-ink/72">
        Whether a crawl would be allowed to fetch a URL. Answered by the same robots cache{' '}
        <code className="font-mono text-[13px]">/crawl</code> and <code className="font-mono text-[13px]">/map</code>{' '}
        consult, so this is the decision a crawl would actually make — not a second opinion from a different parser.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="robots-url">URL</FieldLabel>
          <input
            id="robots-url"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/pricing"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="robots-ua">User agent</FieldLabel>
          <input
            id="robots-ua"
            value={userAgent}
            onChange={(e) => setUserAgent(e.target.value)}
            placeholder={DEFAULT_UA}
            className={inputClass}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PillButton type="submit" variant="primary" disabled={busy || blocked}>
            <RunLabel busy={busy}>Check</RunLabel>
          </PillButton>
          {blocked && <KeyNote />}
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
      </form>

      {result && (
        <CheckPanel>
          <Verdict
            tone={result.allowed ? 'good' : 'bad'}
            headline={result.allowed ? 'Allowed' : 'Blocked'}
            detail={
              result.allowed
                ? 'A crawl would fetch this URL.'
                : 'A crawl would skip this URL and record robots_denied.'
            }
          />
          <ResultRow label="User agent">{result.userAgent}</ResultRow>
          <ResultRow label="Crawl delay">
            {result.crawlDelaySeconds === null ? 'none' : `${result.crawlDelaySeconds}s`}
          </ResultRow>
          <ResultRow label="Sitemaps">
            {result.sitemaps.length === 0 ? (
              'none declared'
            ) : (
              <span className="flex flex-col gap-1">
                {result.sitemaps.map((sitemap) => (
                  <span key={sitemap} className="break-all">
                    {sitemap}
                  </span>
                ))}
              </span>
            )}
          </ResultRow>
        </CheckPanel>
      )}
    </div>
  );
}
