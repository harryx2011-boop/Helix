'use client';

import * as React from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Composer } from '@/components/app/agent/composer';
import { RefineBar } from '@/components/app/agent/refine-bar';
import { SchemaPanel } from '@/components/app/agent/schema-panel';
import { ResultsPanel } from '@/components/app/agent/results-panel';
import type { AgentOutputFormat } from '@/components/app/agent/output-toggle';
import Link from 'next/link';
import { useOptionalApiKey } from '@/components/shell/api-key-provider';
import { requestAgentSchema, scrapeUrlsForSchema, scrapeForSchema, searchForSchema } from '@/lib/agent';
import type { AgentPageResult } from '@/lib/agent';
import { HelixApiError } from '@/lib/api';
import { listProviders } from '@/lib/providers';

type Stage = 'idle' | 'schema-loading' | 'schema-ready' | 'running' | 'done';

interface RunState {
  results: AgentPageResult[];
  completed: number;
  total: number;
  stage: 'searching' | 'reading' | 'done';
  error: string | null;
}

export function AgentClient() {
  const apiKey = useOptionalApiKey()?.apiKey ?? null;
  const [prompt, setPrompt] = React.useState('');
  const [urls, setUrls] = React.useState<string[]>([]);
  const [outputFormat, setOutputFormat] = React.useState<AgentOutputFormat>('json');
  const [stage, setStage] = React.useState<Stage>('idle');
  const [schema, setSchema] = React.useState<Record<string, unknown> | null>(null);
  const [schemaError, setSchemaError] = React.useState<string | null>(null);
  const [refineValue, setRefineValue] = React.useState('');
  const [refining, setRefining] = React.useState(false);
  const [run, setRun] = React.useState<RunState | null>(null);
  const [noProvider, setNoProvider] = React.useState(false);
  const transcriptEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    listProviders(apiKey)
      .then(({ providers }) => {
        if (!cancelled) setNoProvider(providers.every((p) => p.source === 'none'));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const scrollToEnd = React.useCallback(() => {
    requestAnimationFrame(() => transcriptEndRef.current?.scrollIntoView({ block: 'end' }));
  }, []);

  const generateSchema = React.useCallback(
    async (input: { prompt: string; urls: string[]; hint?: Record<string, unknown>; instruction?: string }) => {
      setStage('schema-loading');
      setSchemaError(null);
      try {
        const response = await requestAgentSchema(
          {
            prompt: input.prompt,
            ...(input.urls.length > 0 ? { urls: input.urls } : {}),
            ...(input.hint ? { hint: input.hint } : {}),
            ...(input.instruction ? { instruction: input.instruction } : {}),
          },
          apiKey,
        );
        if (!response.success) {
          setSchemaError(response.failure.message ?? response.failure.detail ?? response.failure.reason);
          setStage('schema-loading');
          return;
        }
        setSchema(response.schema);
        setStage('schema-ready');
      } catch (error) {
        setSchemaError(error instanceof HelixApiError ? error.message : 'Request failed.');
        setStage('schema-loading');
      }
      scrollToEnd();
    },
    [apiKey, scrollToEnd],
  );

  const handleSubmit = React.useCallback(() => {
    if (prompt.trim().length === 0) return;
    const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
    void generateSchema({ prompt, urls: cleanUrls });
  }, [prompt, urls, generateSchema]);

  const handleRetrySchema = React.useCallback(() => {
    const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
    void generateSchema({ prompt, urls: cleanUrls });
  }, [prompt, urls, generateSchema]);

  const handleRefine = React.useCallback(async () => {
    if (!schema || refineValue.trim().length === 0) return;
    setRefining(true);
    try {
      const response = await requestAgentSchema(
        { prompt, hint: schema, instruction: refineValue.trim() },
        apiKey,
      );
      if (response.success) {
        setSchema(response.schema);
        setRefineValue('');
      } else {
        setSchemaError(response.failure.message ?? response.failure.detail ?? response.failure.reason);
      }
    } catch (error) {
      setSchemaError(error instanceof HelixApiError ? error.message : 'Request failed.');
    } finally {
      setRefining(false);
    }
  }, [schema, refineValue, prompt, apiKey]);

  const runAgent = React.useCallback(async () => {
    if (!schema) return;
    const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
    setStage('running');
    setRun({ results: [], completed: 0, total: cleanUrls.length, stage: 'searching', error: null });
    scrollToEnd();
    try {
      if (cleanUrls.length > 0) {
        setRun({ results: [], completed: 0, total: cleanUrls.length, stage: 'reading', error: null });
        const results = await scrapeUrlsForSchema(cleanUrls, schema, apiKey, (_result, completed, total) => {
          setRun((prev) => (prev ? { ...prev, completed, total } : prev));
        });
        setRun({ results, completed: results.length, total: results.length, stage: 'done', error: null });
      } else {
        const results = await searchForSchema(prompt, schema, apiKey);
        setRun({ results, completed: results.length, total: results.length, stage: 'done', error: null });
      }
      setStage('done');
    } catch (error) {
      setRun({
        results: [],
        completed: 0,
        total: cleanUrls.length,
        stage: 'done',
        error: error instanceof HelixApiError ? error.message : 'Request failed.',
      });
      setStage('done');
    }
    scrollToEnd();
  }, [schema, urls, prompt, apiKey, scrollToEnd]);

  const retryPage = React.useCallback(
    async (url: string) => {
      if (!schema) return;
      const result = await scrapeForSchema(url, schema, apiKey);
      setRun((prev) => (prev ? { ...prev, results: prev.results.map((r) => (r.url === url ? result : r)) } : prev));
    },
    [schema, apiKey],
  );

  const reset = React.useCallback(() => {
    setPrompt('');
    setUrls([]);
    setOutputFormat('json');
    setStage('idle');
    setSchema(null);
    setSchemaError(null);
    setRefineValue('');
    setRun(null);
  }, []);

  if (stage === 'idle') {
    return (
      <div className="relative flex h-full items-center justify-center px-4">
        <div className="relative flex w-full max-w-[640px] flex-col items-center gap-6">
          <h1 className="text-center text-[28px] font-medium leading-tight tracking-tight text-foreground">
            What data do you want to gather?
          </h1>
          <Composer
            value={prompt}
            onValueChange={setPrompt}
            urls={urls}
            onUrlsChange={setUrls}
            outputFormat={outputFormat}
            onOutputFormatChange={setOutputFormat}
            onSubmit={handleSubmit}
            loading={false}
            placeholder="Describe the data you want"
            className="w-full items-center"
          />
          {noProvider ? (
            <p className="font-mono text-[11px] text-muted-foreground">
              [ utilities ]  Needs a model key —{' '}
              <Link
                href="/app/settings?tab=providers"
                className="text-foreground underline underline-offset-2 transition-colors duration-150 ease-out hover:text-muted-foreground"
              >
                connect a provider
              </Link>{' '}
              to run.
            </p>
          ) : (
            <p className="font-mono text-[11px] text-muted-foreground">
              [ utilities ]  Generates a schema first, then searches and reads the pages that match.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-border px-4 py-2.5 lg:px-6">
        <Button type="button" variant="ghost" size="sm" className="rounded-pill text-xs" onClick={reset}>
          New request
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6 lg:px-6">
        <div className="mx-auto flex max-w-[760px] flex-col gap-4">
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-panel bg-primary px-4 py-2.5 text-sm text-primary-foreground">{prompt}</div>
          </div>

          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-panel bg-secondary px-4 py-2.5 text-sm text-foreground">
              {schema ? 'Here is the schema I will extract.' : 'Generating a schema from your request…'}
            </div>
          </div>

          {stage === 'schema-loading' && !schemaError && (
            <div className="flex flex-col gap-2 rounded-panel border border-border bg-card p-4">
              <div className="h-3 w-2/3 animate-pulse rounded-card bg-secondary" />
              <div className="h-3 w-1/2 animate-pulse rounded-card bg-secondary" />
              <div className="h-3 w-3/5 animate-pulse rounded-card bg-secondary" />
            </div>
          )}

          {schemaError && (
            <div className="flex flex-col gap-2 rounded-panel border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">{schemaError}</p>
              <Button type="button" variant="outline" size="sm" className="w-fit gap-1.5 rounded-pill" onClick={handleRetrySchema}>
                <RotateCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          )}

          {schema && (
            <SchemaPanel
              schema={schema}
              onApplyEdit={(next) => setSchema(next)}
            />
          )}

          {schema && stage !== 'running' && (
            <RefineBar
              urls={urls}
              onUrlsChange={setUrls}
              outputFormat={outputFormat}
              onOutputFormatChange={setOutputFormat}
              refineValue={refineValue}
              onRefineValueChange={setRefineValue}
              onRefine={handleRefine}
              refining={refining}
              onRun={runAgent}
              running={false}
            />
          )}

          {run && (
            <div className="flex justify-start">
              <div className="flex max-w-[80%] items-center gap-2 rounded-panel bg-secondary px-4 py-2.5 text-sm text-foreground">
                {stage === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {run.stage === 'searching' && 'Searching…'}
                {run.stage === 'reading' && `Reading ${run.total} page${run.total === 1 ? '' : 's'}… ${run.completed} of ${run.total} read`}
                {run.stage === 'done' && !run.error && `Read ${run.results.length} page${run.results.length === 1 ? '' : 's'}.`}
                {run.error && run.error}
              </div>
            </div>
          )}

          {run?.error && (
            <div className="flex flex-col gap-2 rounded-panel border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">{run.error}</p>
              <Button type="button" variant="outline" size="sm" className="w-fit gap-1.5 rounded-pill" onClick={runAgent}>
                <RotateCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          )}

          {run && !run.error && run.stage === 'done' && (
            <ResultsPanel results={run.results} onRetry={retryPage} outputFormat={outputFormat} />
          )}

          <div ref={transcriptEndRef} />
        </div>
      </div>
    </div>
  );
}
