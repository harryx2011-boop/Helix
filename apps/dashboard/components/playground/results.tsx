'use client';

import * as React from 'react';
import {
  ArrowLeft,
  Braces,
  Check,
  CircleCheck,
  CircleX,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  Share2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type {
  ConvertResponse,
  CrawlResponse,
  Document,
  DocumentResponse,
  Estimate,
  ExtractResponse,
  ExtractRow,
  ExtractionUsage,
  FetchFailure,
  InteractResponse,
  JobAccepted,
  MapResponse,
  MetadataResponse,
  MetadataScrubResponse,
  MonitorResponse,
  ParseResponse,
  ScrapeResponse,
  ScreenshotResponse,
  SearchResponse,
} from '@/lib/api';
import { endpointById } from '@/lib/catalog';
import type { Endpoint } from '@/lib/endpoints';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { FrameCells } from '@/components/app/page-frame';
import { MetadataStrip } from '@/components/result/metadata-strip';
import { MetadataScanView, MetadataScrubView } from '@/components/result/metadata-report';
import { MetadataScanning } from '@/components/result/metadata-scanning';
import { MarkdownView } from '@/components/result/markdown-view';
import { JsonView } from '@/components/result/json-view';
import { FailurePanel } from '@/components/result/failure-panel';
import { SiteIcon } from '@/components/result/site-icon';
import { AnimatedCode } from '@/components/shared/animated-code';
import { AsciiFlow } from '@/components/shared/ascii-fields';

/**
 * A one-shot reveal (never `scramble` — that mode is reserved for decorative
 * idle widgets, not real response data the user is meant to read, per
 * research/17-firecrawl-code-animation-prompt-box.md §1/§4) of a fresh result's
 * JSON, keyed so it replays whenever a new response lands.
 */
function AnimatedJsonView({ data }: { data: unknown }) {
  const text = JSON.stringify(data, null, 2);
  return (
    <pre className="overflow-x-auto rounded-card bg-secondary p-3 font-mono text-xs leading-relaxed">
      <AnimatedCode key={text} code={text} mode="reveal" lineMs={45} playOnView={false} />
    </pre>
  );
}

export type PlaygroundResult =
  | { kind: 'scrape'; response: ScrapeResponse }
  | { kind: 'map'; response: MapResponse }
  | { kind: 'search'; response: SearchResponse }
  | { kind: 'crawl'; response: CrawlResponse }
  | { kind: 'parse'; response: ParseResponse }
  | { kind: 'metadata'; response: MetadataResponse }
  | { kind: 'metadata-scrub'; response: MetadataScrubResponse }
  | { kind: 'convert'; response: ConvertResponse }
  | { kind: 'document'; response: DocumentResponse }
  | { kind: 'extract'; response: ExtractResponse }
  | { kind: 'screenshot'; response: ScreenshotResponse }
  | { kind: 'interact'; response: InteractResponse }
  | { kind: 'monitor'; response: MonitorResponse }
  | { kind: 'handoff'; jobId: string }
  | { kind: 'coming' };

interface ResultsProps {
  result: PlaygroundResult | undefined;
  loading: boolean;
  timingMs: number | undefined;
  error: string | undefined;
  /**
   * What is currently in flight. A skeleton is the right placeholder for a
   * response whose shape is known; a metadata read is work of unknown length
   * over a file the user just handed over, and gets an animation that shows
   * the work instead.
   */
  pending?: { kind: PlaygroundResult['kind']; filename?: string | undefined } | undefined;
  /** The tab the run came from: names the Endpoint cell and the share link. */
  endpoint: Endpoint;
  /** The prompt value the run was made with (URL or query). */
  input?: string | undefined;
  /** Go back: return to the prompt with the result cleared. */
  onBack?: (() => void) | undefined;
}

function isJobAccepted(response: CrawlResponse): response is JobAccepted {
  return typeof (response as JobAccepted).id === 'string';
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function downloadText(filename: string, content: string, mime: string) {
  const href = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = React.useState(false);
  const copy = React.useCallback((text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, []);
  return [copied, copy];
}

/**
 * Markdown against the raw HTML it came from, by byte size. A proxy for the
 * token saving, hence the tilde; shown only when the API returned both.
 */
function tokenSaving(data: Document): number | undefined {
  if (typeof data.rawHtml !== 'string' || typeof data.markdown !== 'string') return undefined;
  const raw = new TextEncoder().encode(data.rawHtml).length;
  const md = new TextEncoder().encode(data.markdown).length;
  if (raw === 0 || md >= raw) return undefined;
  return Math.round((1 - md / raw) * 100);
}

function Pill({
  icon: Icon,
  children,
  onClick,
  href,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const classes =
    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-pill border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors duration-150 ease-out hover:bg-secondary';
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {children}
    </button>
  );
}

interface PillTab<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
  chip?: string | undefined;
}

function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: PillTab<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const index = tabs.findIndex((t) => t.id === value);
    const next = tabs[(index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    if (next) {
      onChange(next.id);
      (e.currentTarget.querySelector(`[data-id="${next.id}"]`) as HTMLElement | null)?.focus();
    }
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="inline-flex items-center gap-0.5 self-start rounded-pill border border-border p-0.5">
      {tabs.map((tab) => {
        const active = tab.id === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-id={tab.id}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-pill px-3 text-xs font-medium transition-colors duration-150 ease-out',
              active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {tab.label}
            {tab.chip && (
              <span className="rounded-pill bg-accent px-1.5 py-px font-mono text-[10px] text-accent-foreground" title="By byte size, markdown against the raw HTML">
                {tab.chip}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface DownloadDef {
  label: string;
  filename: string;
  content: string;
  mime: string;
}

interface Fact {
  label: string;
  value: React.ReactNode;
}

interface ChromeProps {
  endpoint: Endpoint;
  /** Identity bar centre: favicon + host for URLs, the query for search. */
  subject: { url?: string | undefined; label: string };
  status: { ok: boolean; label: string };
  facts?: Fact[];
  title?: string;
  count?: number | undefined;
  hint?: string | undefined;
  downloads?: DownloadDef[];
  /** Copied by Debug issue: everything needed to file a report. */
  debug: unknown;
  showBack?: boolean;
  onBack?: (() => void) | undefined;
  input?: string | undefined;
  children: React.ReactNode;
}

/** One chrome for every kind: identity bar, fact cells, results header, then the body. */
function Chrome({ endpoint, subject, status, facts = [], title = 'Result', count, hint, downloads = [], debug, showBack, onBack, input, children }: ChromeProps) {
  const def = endpointById(endpoint);
  const EndpointIcon = def?.icon ?? FileText;
  const [shareCopied, copyShare] = useCopy();
  const [debugCopied, copyDebug] = useCopy();

  const share = () => {
    const params = new URLSearchParams({ tab: endpoint });
    if (input) params.set('url', input);
    copyShare(`${window.location.origin}/app/playground?${params.toString()}`);
  };

  const cells: Fact[] = [
    {
      label: 'Endpoint',
      value: (
        <>
          <EndpointIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
          {def?.name ?? endpoint}
        </>
      ),
    },
    {
      label: 'Status',
      value: (
        <>
          {status.ok ? (
            <CircleCheck className="h-4 w-4 text-success" aria-hidden />
          ) : (
            <CircleX className="h-4 w-4 text-destructive" aria-hidden />
          )}
          <span className={cn(!status.ok && 'font-mono text-xs')}>{status.label}</span>
        </>
      ),
    },
    ...facts,
  ].slice(0, 4);

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border px-4 py-2.5">
        <div>{showBack && onBack && <Pill icon={ArrowLeft} onClick={onBack}>Go back</Pill>}</div>
        <div className="flex min-w-0 items-center justify-center gap-2">
          {subject.url ? (
            <SiteIcon url={subject.url} size={16} />
          ) : (
            <EndpointIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
          <span className="truncate font-mono text-[13px] text-foreground">{subject.label}</span>
        </div>
        <div className="flex justify-end">
          {input && (
            <Pill icon={shareCopied ? Check : Share2} onClick={share}>
              {shareCopied ? 'Copied' : 'Share'}
            </Pill>
          )}
        </div>
      </div>

      <FrameCells cols={cells.length as 2 | 3 | 4} className="border-b border-border">
        {cells.map((cell) => (
          <dl key={cell.label} className="flex flex-col gap-1 px-4 py-3">
            <dt className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{cell.label}</dt>
            <dd className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">{cell.value}</dd>
          </dl>
        ))}
      </FrameCells>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-sm font-medium text-foreground">
            {title}
            {count !== undefined && <span className="text-muted-foreground"> ({count})</span>}
          </h3>
          {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill icon={debugCopied ? Check : Sparkles} onClick={() => copyDebug(JSON.stringify(debug, null, 2))}>
            {debugCopied ? 'Copied' : 'Debug issue'}
          </Pill>
          {downloads.map((d) => (
            <Pill key={d.label} icon={Download} onClick={() => downloadText(d.filename, d.content, d.mime)}>
              {d.label}
            </Pill>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">{children}</div>
    </div>
  );
}

function NumberedRow({ index, url, title, children }: { index: number; url: string; title?: string | undefined; children?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[2.5rem_1fr] gap-x-2 border-b border-border px-4 py-2.5 last:border-b-0">
      <span className="pt-0.5 font-mono text-xs text-primary">#{index}</span>
      <div className="flex min-w-0 flex-col gap-1">
        <a href={url} target="_blank" rel="noreferrer" className="truncate text-sm text-foreground hover:underline">
          {title || url}
        </a>
        <span className="flex min-w-0 items-center gap-1.5">
          <SiteIcon url={url} size={13} />
          <span className="truncate font-mono text-xs text-muted-foreground">{url}</span>
        </span>
        {children}
      </div>
    </div>
  );
}

function documentDownloads(data: Document, base: string): DownloadDef[] {
  const out: DownloadDef[] = [];
  if (typeof data.markdown === 'string') out.push({ label: 'Markdown', filename: `${base}.md`, content: data.markdown, mime: 'text/markdown' });
  const html = data.html ?? data.rawHtml;
  if (typeof html === 'string') out.push({ label: 'HTML', filename: `${base}.html`, content: html, mime: 'text/html' });
  if (data.links && data.links.length > 0) out.push({ label: 'Links', filename: `${base}-links.txt`, content: data.links.join('\n'), mime: 'text/plain' });
  out.push({ label: 'JSON', filename: `${base}.json`, content: JSON.stringify(data, null, 2), mime: 'application/json' });
  return out;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function ConvertView({ result }: { result: Extract<ConvertResponse, { success: true }> }) {
  const { blob, filename, pages, pageConverted } = result;

  // Object URLs are per-blob and leak if the component remounts with a new one.
  const href = React.useMemo(() => URL.createObjectURL(blob), [blob]);
  React.useEffect(() => () => URL.revokeObjectURL(href), [href]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="truncate font-mono text-foreground">{filename}</span>
            <span className="font-mono text-xs">{formatBytes(blob.size)}</span>
          </div>
          <Button asChild size="sm" className="gap-1.5">
            <a href={href} download={filename}>
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          </Button>
        </div>
        {pages > 1 && pageConverted !== undefined && (
          <span className="font-mono text-xs text-muted-foreground">
            Page {pageConverted} of {pages}
          </span>
        )}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- object URL, not a static asset Next can optimise */}
      <img src={href} alt={`Converted preview of ${filename}`} className="max-h-[480px] w-auto rounded-card border border-border object-contain" />
    </div>
  );
}

function ScreenshotView({ result }: { result: Extract<ScreenshotResponse, { success: true }> }) {
  const { screenshot, format, bytes } = result.data;

  if (!screenshot) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        The fetch succeeded but no image came back. The warnings above say which tier answered.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Stat label="Format" value={format.toUpperCase()} />
        {bytes !== null && <Stat label="Size" value={formatBytes(bytes)} />}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL, and next/image cannot size one it has not fetched. */}
      <img
        src={screenshot}
        alt="Captured screenshot"
        className="w-full rounded-card border border-border bg-secondary"
      />
    </div>
  );
}

function ExtractView({ result }: { result: ExtractResponse }) {
  const rows = result.data;
  // Every field except the provenance envelope, in first-row order so the table
  // reads the way the schema was written.
  const columns = React.useMemo(() => {
    const seen = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) if (key !== '_source') seen.add(key);
    }
    return [...seen];
  }, [rows]);

  if (rows.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No rows came back. Any URL that could not be read is listed in the warnings above.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              {columns.map((column) => (
                <th key={column} className="px-2 py-1.5 font-medium text-muted-foreground">
                  {column}
                </th>
              ))}
              <th className="px-2 py-1.5 font-medium text-muted-foreground">source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: ExtractRow, index: number) => (
              <tr key={index} className="border-b border-border/60 last:border-0">
                {columns.map((column) => (
                  <td key={column} className="px-2 py-1.5 align-top">
                    {row[column] === undefined ? (
                      <span className="text-muted-foreground/40">—</span>
                    ) : (
                      String(row[column])
                    )}
                  </td>
                ))}
                <td className="px-2 py-1.5 align-top font-mono text-xs text-muted-foreground">
                  {hostOf(row._source.url) ?? row._source.url}
                  {row._source.blocksTotal > row._source.blocksKept && (
                    <span
                      className="ml-1"
                      title={`Only ${row._source.blocksKept} of ${row._source.blocksTotal} blocks reached the model.`}
                    >
                      ({row._source.blocksKept}/{row._source.blocksTotal})
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.dropped.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-card border border-border bg-secondary/40 p-3">
          <p className="text-sm font-medium text-foreground">
            {result.dropped.length} field{result.dropped.length === 1 ? '' : 's'} dropped
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Nothing in the page supported these, so they were removed rather than returned. Tick
            &ldquo;keep ungrounded fields&rdquo; to get them anyway.
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {result.dropped.map((entry: { url: string; field: string; reason: string }, index: number) => (
              <li key={index} className="font-mono text-xs text-muted-foreground">
                {entry.field} — {hostOf(entry.url) ?? entry.url}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EstimateCard({ estimate }: { estimate: Estimate }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pages" value={estimate.pages} />
        <Stat label="From cache" value={estimate.pagesFromCache} />
        <Stat label="Est. seconds" value={estimate.estimatedSeconds} />
        <Stat
          label="Est. provider cost"
          value={
            estimate.estimatedProviderCost?.amount !== undefined
              ? `$${estimate.estimatedProviderCost.amount.toFixed(4)}`
              : undefined
          }
        />
      </div>
      {estimate.tierBreakdown && Object.keys(estimate.tierBreakdown).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(estimate.tierBreakdown).map(([tier, count]) => (
            <Badge key={tier} variant="secondary" className="font-mono text-[11px]">
              {tier}: {count}
            </Badge>
          ))}
        </div>
      )}
      {estimate.assumptions && estimate.assumptions.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {estimate.assumptions.map((assumption, i) => (
            <li key={i}>&middot; {assumption}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionStrip({ sessionId, sessionOpen, url, timingMs }: { sessionId?: string | undefined; sessionOpen?: boolean | undefined; url?: string | undefined; timingMs?: number | undefined }) {
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
      {sessionId && <span>{sessionId}</span>}
      {sessionOpen !== undefined && (
        <Badge variant={sessionOpen ? 'default' : 'secondary'} className="font-mono text-[10px] uppercase tracking-wide">
          {sessionOpen ? 'open' : 'closed'}
        </Badge>
      )}
      {url && (
        <span className="flex min-w-0 items-center gap-1.5">
          <SiteIcon url={url} size={13} />
          <span className="truncate">{url}</span>
        </span>
      )}
      {timingMs !== undefined && <span>{timingMs}ms round-trip</span>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm text-foreground">{value ?? '—'}</span>
    </div>
  );
}

function HandoffCard({ title, jobId }: { title: string; jobId: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-4">
      <span className="text-sm font-medium text-foreground">{title}</span>
      <p className="text-sm text-muted-foreground leading-relaxed">
        This is an async job. Poll GET /v1/jobs/:id on your instance for progress and results.
      </p>
      <span className="font-mono text-xs text-muted-foreground">Job {jobId}</span>
    </div>
  );
}

type DocTab = 'markdown' | 'json' | 'screenshot';

function DocumentResult({
  data,
  timingMs,
  warnings = [],
  usage,
}: {
  data: Document;
  timingMs: number | undefined;
  warnings?: string[];
  usage?: ExtractionUsage;
}) {
  const hasMarkdown = typeof data.markdown === 'string';
  const hasJson = data.json !== undefined && data.json !== null;
  const saving = tokenSaving(data);
  const [tab, setTab] = React.useState<DocTab>(hasMarkdown ? 'markdown' : 'json');

  const tabs: PillTab<DocTab>[] = [
    ...(hasMarkdown ? [{ id: 'markdown' as const, label: 'Markdown', icon: FileText, chip: saving !== undefined ? `~${saving}% fewer tokens` : undefined }] : []),
    { id: 'json', label: 'JSON', icon: Braces },
    ...(data.screenshot ? [{ id: 'screenshot' as const, label: 'Screenshot', icon: ImageIcon }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {data.metadata && <MetadataStrip metadata={data.metadata} timingMs={timingMs} contentHash={data.metadata.contentHash} />}
      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-card border border-border px-3 py-2 font-mono text-xs text-muted-foreground">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <PillTabs tabs={tabs} value={tab} onChange={setTab} label="Result view" />
      {tab === 'markdown' && data.markdown && <MarkdownView content={data.markdown} />}
      {tab === 'json' && hasJson && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Extracted JSON</span>
            {usage && (
              <span className="font-mono text-xs text-muted-foreground">
                {usage.model} · {usage.tokens.input} in / {usage.tokens.output} out · {usage.blocksKept}/{usage.blocksTotal} blocks
              </span>
            )}
          </div>
          <AnimatedJsonView data={data.json} />
        </div>
      )}
      {tab === 'json' && <JsonView data={data} />}
      {tab === 'screenshot' && data.screenshot && (
        // eslint-disable-next-line @next/next/no-img-element -- inline data URL from the API
        <img src={data.screenshot} alt="Page screenshot" className="rounded-card border border-border" />
      )}
    </div>
  );
}

export function Results({ result, loading, timingMs, error, pending, endpoint, input, onBack }: ResultsProps) {
  if (loading) {
    // File-shaped work gets the lens: an upload the user just handed over, a
    // wait of unknown length, and a skeleton that would be shaped like the
    // wrong thing. Everything else keeps the skeleton, which is correct where
    // the response shape IS known.
    const LENS_MODE = { metadata: 'scan', 'metadata-scrub': 'scrub', parse: 'parse' } as const;
    const lensMode = pending ? LENS_MODE[pending.kind as keyof typeof LENS_MODE] : undefined;
    if (lensMode) {
      return <MetadataScanning mode={lensMode} filename={pending?.filename} />;
    }
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-16" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const inputHost = hostOf(input);
  const subjectFromInput = { url: inputHost ? input : undefined, label: inputHost ?? input ?? (endpointById(endpoint)?.name ?? endpoint) };
  const timeFact: Fact[] = timingMs !== undefined ? [{ label: 'Time', value: <span className="font-mono text-xs">{timingMs}ms</span> }] : [];
  const base = `${inputHost ?? endpoint}-${endpoint}`;

  if (error) {
    return (
      <Chrome
        endpoint={endpoint}
        subject={subjectFromInput}
        status={{ ok: false, label: 'Request failed' }}
        debug={{ endpoint, input, error }}
        input={input}
      >
        <p className="text-sm text-muted-foreground">{error}</p>
      </Chrome>
    );
  }

  if (!result) {
    return (
      <div className="relative flex h-full items-center justify-center overflow-hidden p-8 text-center">
        <AsciiFlow
          cols={100}
          rows={14}
          seed={7}
          tone="app"
          className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 opacity-80 sm:block [mask-image:radial-gradient(ellipse_at_center,transparent_44%,black_72%,transparent_100%)]"
        />
        <p className="relative max-w-xs text-sm text-muted-foreground leading-relaxed">
          Run a request. Results, including a typed failure with its next step, appear here.
        </p>
      </div>
    );
  }

  if (result.kind === 'coming') {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">This endpoint is not available yet.</p>
      </div>
    );
  }

  if (result.kind === 'handoff') {
    return (
      <Chrome
        endpoint={endpoint}
        subject={subjectFromInput}
        status={{ ok: true, label: 'Accepted' }}
        facts={timeFact}
        title="Job"
        debug={{ endpoint, input, timingMs, jobId: result.jobId }}
        showBack={endpoint === 'crawl' || endpoint === 'map'}
        onBack={onBack}
        input={input}
      >
        <HandoffCard title="Running as a background job" jobId={result.jobId} />
      </Chrome>
    );
  }

  const debug = { endpoint, input, timingMs, response: result.response };

  switch (result.kind) {
    case 'scrape': {
      const response = result.response;
      if (!response.success) {
        const { failure } = response;
        return (
          <Chrome
            endpoint={endpoint}
            subject={subjectFromInput}
            status={{ ok: false, label: failure.reason }}
            facts={[...(failure.tier ? [{ label: 'Tier', value: <span className="font-mono text-xs">{failure.tier}</span> }] : []), ...timeFact]}
            debug={debug}
            input={input}
          >
            <FailurePanel failure={failure} />
          </Chrome>
        );
      }
      const meta = response.data.metadata;
      const pageUrl = meta?.finalUrl ?? meta?.sourceUrl ?? input;
      return (
        <Chrome
          endpoint={endpoint}
          subject={{ url: pageUrl, label: hostOf(pageUrl) ?? subjectFromInput.label }}
          status={{ ok: true, label: 'Success' }}
          facts={[...(meta?.tier ? [{ label: 'Tier', value: <span className="font-mono text-xs">{meta.tier}</span> }] : []), ...timeFact]}
          hint={meta?.title}
          downloads={documentDownloads(response.data, base)}
          debug={debug}
          input={input}
        >
          <DocumentResult data={response.data} timingMs={timingMs} warnings={response.warnings} {...(response.usage ? { usage: response.usage } : {})} />
        </Chrome>
      );
    }

    case 'metadata': {
      const response = result.response;
      if (!response.success) {
        return (
          <Chrome endpoint={endpoint} subject={subjectFromInput} status={{ ok: false, label: response.failure.reason }} facts={timeFact} debug={debug} input={input}>
            <FailurePanel failure={response.failure} />
          </Chrome>
        );
      }
      return (
        <Chrome
          endpoint={endpoint}
          subject={subjectFromInput}
          status={{ ok: true, label: 'Success' }}
          facts={timeFact}
          title="Findings"
          downloads={[{ label: 'JSON', filename: `${base}.json`, content: JSON.stringify(response.data, null, 2), mime: 'application/json' }]}
          debug={debug}
          input={input}
        >
          <MetadataScanView scan={response.data} {...(response.warnings ? { warnings: response.warnings } : {})} />
        </Chrome>
      );
    }

    case 'metadata-scrub': {
      const response = result.response;
      if (!response.success) {
        return (
          <Chrome endpoint={endpoint} subject={subjectFromInput} status={{ ok: false, label: response.failure.reason }} facts={timeFact} debug={debug} input={input}>
            <FailurePanel failure={response.failure} />
          </Chrome>
        );
      }
      return (
        <Chrome endpoint={endpoint} subject={subjectFromInput} status={{ ok: true, label: 'Success' }} facts={timeFact} title="Scrubbed copy" debug={debug} input={input}>
          <MetadataScrubView result={response} />
        </Chrome>
      );
    }

    case 'convert': {
      const response = result.response;
      if (!response.success) {
        return (
          <Chrome endpoint={endpoint} subject={subjectFromInput} status={{ ok: false, label: response.failure.reason }} facts={timeFact} debug={debug} input={input}>
            <FailurePanel failure={response.failure} />
          </Chrome>
        );
      }
      return (
        <Chrome endpoint={endpoint} subject={subjectFromInput} status={{ ok: true, label: 'Success' }} facts={timeFact} title="Converted file" debug={debug} input={input}>
          <ConvertView result={response} />
        </Chrome>
      );
    }

    case 'screenshot': {
      const response = result.response;
      if (!response.success) {
        return (
          <Chrome endpoint={endpoint} subject={subjectFromInput} status={{ ok: false, label: response.failure.reason }} facts={timeFact} debug={debug} input={input}>
            <FailurePanel failure={response.failure} />
          </Chrome>
        );
      }
      return (
        <Chrome
          endpoint={endpoint}
          subject={subjectFromInput}
          status={{ ok: true, label: 'Success' }}
          facts={timeFact}
          title="Screenshot"
          debug={debug}
          input={input}
        >
          <ScreenshotView result={response} />
        </Chrome>
      );
    }

    case 'extract': {
      const response = result.response;
      return (
        <Chrome
          endpoint={endpoint}
          subject={subjectFromInput}
          status={{ ok: true, label: `${response.data.length} row${response.data.length === 1 ? '' : 's'}` }}
          facts={timeFact}
          title="Extracted rows"
          debug={debug}
          input={input}
        >
          <ExtractView result={response} />
        </Chrome>
      );
    }

    case 'document': {
      const response = result.response as { success?: boolean; failure?: FetchFailure };
      if (response.success === false && response.failure) {
        return (
          <Chrome endpoint={endpoint} subject={subjectFromInput} status={{ ok: false, label: response.failure.reason }} facts={timeFact} debug={debug} input={input}>
            <FailurePanel failure={response.failure} />
          </Chrome>
        );
      }
      // The operation is chosen at runtime, so the shape is only known to the
      // caller. JSON is the honest rendering rather than guessing a view.
      return (
        <Chrome endpoint={endpoint} subject={subjectFromInput} status={{ ok: true, label: 'Success' }} facts={timeFact} title="Document" debug={debug} input={input}>
          <AnimatedJsonView data={result.response} />
        </Chrome>
      );
    }

    case 'parse': {
      const response = result.response;
      if (!response.success) {
        return (
          <Chrome endpoint={endpoint} subject={subjectFromInput} status={{ ok: false, label: response.failure.reason }} facts={timeFact} debug={debug} input={input}>
            <FailurePanel failure={response.failure} />
          </Chrome>
        );
      }
      const meta = response.data.metadata;
      const doc: Document = {
        ...(response.data.markdown !== undefined ? { markdown: response.data.markdown } : {}),
        ...(response.data.json !== undefined ? { json: response.data.json } : {}),
      };
      return (
        <Chrome
          endpoint={endpoint}
          subject={{ url: subjectFromInput.url, label: meta.filename ?? subjectFromInput.label }}
          status={{ ok: true, label: 'Success' }}
          facts={[{ label: 'Parser', value: <span className="font-mono text-xs">{meta.parser}</span> }, { label: 'Time', value: <span className="font-mono text-xs">{meta.timingMs}ms</span> }]}
          hint={`${meta.fileType}${meta.pageCount > 0 ? ` · ${meta.pageCount} ${meta.pageCount === 1 ? 'page' : 'pages'}` : ''} · ${meta.ocrUsed ? 'ocr' : 'text layer'}${meta.fromCache ? ' · cached' : ''}`}
          downloads={documentDownloads(doc, base)}
          debug={debug}
          input={input}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {meta.filename && <span className="font-mono text-foreground">{meta.filename}</span>}
              <Badge variant="outline" className="font-mono">
                {meta.fileType}
              </Badge>
              {meta.pageCount > 0 && <span className="font-mono">{meta.pageCount} {meta.pageCount === 1 ? 'page' : 'pages'}</span>}
              <span className="font-mono">{meta.ocrUsed ? 'ocr' : 'text layer'}</span>
              <span className="font-mono">{meta.parser}</span>
              <span className="font-mono">{meta.timingMs}ms</span>
              {meta.fromCache && (
                <Badge variant="outline" className="font-mono">
                  cached
                </Badge>
              )}
              <span className="font-mono text-[11px] text-muted-foreground/70" title={meta.contentHash}>
                {meta.contentHash.slice(0, 12)}
              </span>
            </div>
            {response.warnings && response.warnings.length > 0 && (
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {response.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            <DocumentResult data={doc} timingMs={timingMs} />
          </div>
        </Chrome>
      );
    }

    case 'interact': {
      const response = result.response;
      const sessionFact: Fact[] = response.sessionId ? [{ label: 'Session', value: <span className="truncate font-mono text-xs">{response.sessionId}</span> }] : [];
      if (!response.success) {
        const { actionIndex, actionType } = response.failure;
        return (
          <Chrome endpoint={endpoint} subject={subjectFromInput} status={{ ok: false, label: response.failure.reason }} facts={[...sessionFact, ...timeFact]} debug={debug} input={input}>
            <SessionStrip sessionId={response.sessionId} sessionOpen={response.sessionOpen} />
            <p className="text-xs text-muted-foreground">
              {actionIndex === null || actionIndex === undefined
                ? 'Failed during the initial navigation, before any action ran.'
                : `Failed at action ${actionIndex}${actionType ? ` (${actionType})` : ''}. Earlier actions already ran.`}
            </p>
            <FailurePanel failure={response.failure} />
          </Chrome>
        );
      }
      return (
        <Chrome
          endpoint={endpoint}
          subject={{ url: response.url ?? subjectFromInput.url, label: hostOf(response.url) ?? subjectFromInput.label }}
          status={{ ok: true, label: 'Success' }}
          facts={[...sessionFact, ...timeFact]}
          downloads={[{ label: 'JSON', filename: `${base}.json`, content: JSON.stringify(response, null, 2), mime: 'application/json' }]}
          debug={debug}
          input={input}
        >
          <SessionStrip sessionId={response.sessionId} sessionOpen={response.sessionOpen} url={response.url} timingMs={timingMs} />
          {response.output && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Output</span>
              <p className="text-sm leading-relaxed">{response.output}</p>
            </div>
          )}
          {response.screenshot && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Screenshot</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- inline data URL from the API */}
              <img src={response.screenshot} alt="Page screenshot" className="rounded-card border border-border" />
            </div>
          )}
          {response.sessionOpen && response.liveViewUrl && (
            <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-4">
              <span className="text-sm font-medium text-foreground">Session open</span>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Paste the session ID into the form to continue on this page.
                {response.idleExpiresAt ? ` Closes at ${new Date(response.idleExpiresAt).toLocaleTimeString()} if nothing else happens.` : ''}
              </p>
              <Button variant="secondary" size="sm" className="w-fit gap-1.5" asChild>
                <a href={response.liveViewUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open live view
                </a>
              </Button>
            </div>
          )}
          <JsonView data={response} />
        </Chrome>
      );
    }

    case 'map': {
      const response = result.response;
      const links = response.links ?? [];
      return (
        <MapResult
          endpoint={endpoint}
          subject={subjectFromInput}
          links={links}
          truncated={response.truncated ?? false}
          facts={timeFact}
          base={base}
          debug={debug}
          onBack={onBack}
          input={input}
        />
      );
    }

    case 'search': {
      const response = result.response;
      const results = [...(response.data?.web ?? []), ...(response.data?.news ?? []), ...(response.data?.images ?? [])];
      const warnings = response.warnings ?? [];
      const backendFact: Fact[] = response.metadata?.backend
        ? [{ label: 'Backend', value: <span className="font-mono text-xs">{response.metadata.backend}{response.metadata.fromCache ? ' · cached' : ''}</span> }]
        : [];
      return (
        <Chrome
          endpoint={endpoint}
          subject={{ label: input ?? 'Search' }}
          status={{ ok: response.success, label: response.success ? 'Success' : 'Failed' }}
          facts={[...backendFact, ...timeFact]}
          title="Results"
          count={results.length}
          downloads={[{ label: 'JSON', filename: `${base}.json`, content: JSON.stringify(response.data, null, 2), mime: 'application/json' }]}
          debug={debug}
          input={input}
        >
          <div className="-mx-4 -mt-4 flex flex-col">
            {results.map((item, i) => (
              <NumberedRow key={`${item.url}-${i}`} index={i + 1} url={item.url} title={item.title}>
                {item.description && <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>}
                {item.failure && <FailurePanel failure={item.failure} />}
                {item.markdown && <MarkdownView content={item.markdown} />}
              </NumberedRow>
            ))}
            {results.length === 0 && <span className="px-4 py-4 text-sm text-muted-foreground">No results.</span>}
          </div>
          {warnings.length > 0 && (
            <ul className="flex flex-col gap-1 font-mono text-xs text-muted-foreground">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </Chrome>
      );
    }

    case 'crawl': {
      const response = result.response;
      if (isJobAccepted(response)) {
        return (
          <Chrome
            endpoint={endpoint}
            subject={subjectFromInput}
            status={{ ok: true, label: 'Accepted' }}
            facts={timeFact}
            title="Job"
            debug={debug}
            showBack
            onBack={onBack}
            input={input}
          >
            <HandoffCard title="Crawl started" jobId={response.id} />
          </Chrome>
        );
      }
      return (
        <Chrome
          endpoint={endpoint}
          subject={subjectFromInput}
          status={{ ok: true, label: 'Estimated' }}
          facts={timeFact}
          title="Estimate"
          count={response.pages}
          downloads={[{ label: 'JSON', filename: `${base}-estimate.json`, content: JSON.stringify(response, null, 2), mime: 'application/json' }]}
          debug={debug}
          showBack
          onBack={onBack}
          input={input}
        >
          <EstimateCard estimate={response} />
        </Chrome>
      );
    }

    case 'monitor': {
      const response = result.response;
      if (!response.success || !response.id) {
        return (
          <Chrome endpoint={endpoint} subject={subjectFromInput} status={{ ok: false, label: 'Not created' }} facts={timeFact} debug={debug} input={input}>
            <JsonView data={response} />
          </Chrome>
        );
      }
      return (
        <Chrome
          endpoint={endpoint}
          subject={subjectFromInput}
          status={{ ok: true, label: response.status }}
          facts={timeFact}
          title="Monitor"
          downloads={[{ label: 'JSON', filename: `${base}.json`, content: JSON.stringify(response, null, 2), mime: 'application/json' }]}
          debug={debug}
          input={input}
        >
          <div className="flex flex-col gap-3 rounded-card border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">Monitor created</span>
              <Badge variant="secondary" className="font-mono text-[11px]">
                {response.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Schedule" value={response.schedule.every ?? response.schedule.cron} />
              <Stat label="Timezone" value={response.schedule.timezone} />
              <Stat label="Sensitivity" value={response.sensitivity} />
              <Stat label="Diff" value={response.diff.granularity} />
            </div>
            <p className="text-xs text-muted-foreground">
              First check at {response.nextCheckAt ? new Date(response.nextCheckAt).toLocaleString() : 'the next scheduled slot'}.
              {response.webhook ? ' Changes are posted to your webhook.' : ' No webhook set: read changes from the history endpoint.'}
            </p>
            <span className="font-mono text-xs text-muted-foreground">GET /v1/monitor/{response.id}/history</span>
          </div>
          <JsonView data={response} />
        </Chrome>
      );
    }
  }
}

type MapTab = 'links' | 'json';

function MapResult({
  endpoint,
  subject,
  links,
  truncated,
  facts,
  base,
  debug,
  onBack,
  input,
}: {
  endpoint: Endpoint;
  subject: ChromeProps['subject'];
  links: NonNullable<MapResponse['links']>;
  truncated: boolean;
  facts: Fact[];
  base: string;
  debug: unknown;
  onBack: (() => void) | undefined;
  input: string | undefined;
}) {
  const [tab, setTab] = React.useState<MapTab>('links');
  const tabs: PillTab<MapTab>[] = [
    { id: 'links', label: 'Links', icon: Link2 },
    { id: 'json', label: 'JSON', icon: Braces },
  ];
  return (
    <Chrome
      endpoint={endpoint}
      subject={subject}
      status={{ ok: true, label: 'Success' }}
      facts={facts}
      title="Links"
      count={links.length}
      hint={truncated ? 'Truncated at the map limit. Raise it in Options for the full list.' : undefined}
      downloads={[
        { label: 'Links', filename: `${base}-links.txt`, content: links.map((l) => l.url).join('\n'), mime: 'text/plain' },
        { label: 'JSON', filename: `${base}.json`, content: JSON.stringify(links, null, 2), mime: 'application/json' },
      ]}
      debug={debug}
      showBack
      onBack={onBack}
      input={input}
    >
      <PillTabs tabs={tabs} value={tab} onChange={setTab} label="Map view" />
      {tab === 'links' && (
        <div className="-mx-4 flex flex-col border-t border-border">
          {links.map((link, i) => (
            <NumberedRow key={link.url} index={i + 1} url={link.url} title={link.title} />
          ))}
          {links.length === 0 && <span className="px-4 py-4 text-sm text-muted-foreground">No URLs discovered.</span>}
        </div>
      )}
      {tab === 'json' && <JsonView data={links} />}
    </Chrome>
  );
}
