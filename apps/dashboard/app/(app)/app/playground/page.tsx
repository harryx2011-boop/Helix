'use client';

import * as React from 'react';
import { HelixClient, HelixApiError, type ScrapeRequest, type ScrapeResponse } from '@/lib/api';
import { useApiKey } from '@/components/shell/api-key-provider';
import { ScrapeForm } from '@/components/ladder/scrape-form';
import { ResultPanel } from '@/components/result/result-panel';

export default function PlaygroundPage() {
  const { apiKey } = useApiKey();
  const [result, setResult] = React.useState<ScrapeResponse | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [timingMs, setTimingMs] = React.useState<number | undefined>(undefined);

  const handleSubmit = React.useCallback(
    async (request: ScrapeRequest) => {
      if (!apiKey) return;

      setLoading(true);
      setError(undefined);
      const started = performance.now();

      try {
        const client = new HelixClient({ apiKey });
        const response = await client.scrape(request);
        setResult(response);
        setTimingMs(Math.round(performance.now() - started));
      } catch (err) {
        setResult(undefined);
        setError(err instanceof HelixApiError ? err.message : 'Unexpected error contacting the API.');
      } finally {
        setLoading(false);
      }
    },
    [apiKey],
  );

  return (
    <div className="grid h-full grid-cols-[360px_1px_1fr]">
      <ScrapeForm onSubmit={handleSubmit} loading={loading} />
      <div className="bg-border" />
      <ResultPanel result={result} loading={loading} timingMs={timingMs} error={error} />
    </div>
  );
}
