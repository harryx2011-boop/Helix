'use client';

import * as React from 'react';
import { Download, ShieldAlert, ShieldCheck } from 'lucide-react';
import type {
  MetadataFinding,
  MetadataRisk,
  MetadataRiskSummary,
  MetadataScan,
  MetadataScrubSuccess,
} from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A metadata report a person can act on.
 *
 * The one design decision that matters here: **the risk bands are the
 * structure, not a column.** A flat table of forty tag/value pairs is
 * technically the same information and useless — the reader's question is
 * "does this file give away something I care about", and the answer has to be
 * legible before they read a single row.
 */

const RISK_BADGE: Record<MetadataRisk, 'destructive' | 'warning' | 'secondary'> = {
  high: 'destructive',
  medium: 'warning',
  low: 'secondary',
};

const RISK_LABEL: Record<MetadataRisk, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const BANDS: MetadataRisk[] = ['high', 'medium', 'low'];

function RiskSummary({ summary, total }: { summary: MetadataRiskSummary; total: number }) {
  if (total === 0) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <ShieldCheck className="h-4 w-4 text-success" />
        <span>No metadata found in this file.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {BANDS.filter((band) => summary[band] > 0).map((band) => (
        <Badge key={band} variant={RISK_BADGE[band]} className="font-mono">
          {summary[band]} {RISK_LABEL[band].toLowerCase()}
        </Badge>
      ))}
      <span className="text-xs text-muted-foreground">
        {total} {total === 1 ? 'finding' : 'findings'}
      </span>
    </div>
  );
}

function FindingRow({ finding }: { finding: MetadataFinding }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 py-2 sm:grid-cols-[5rem_minmax(0,14rem)_minmax(0,1fr)]">
      <Badge variant={RISK_BADGE[finding.risk]} className="w-fit font-mono">
        {RISK_LABEL[finding.risk]}
      </Badge>
      <div className="min-w-0">
        <p className="truncate font-mono text-xs text-foreground">{finding.key}</p>
        <p className="truncate text-xs text-muted-foreground">
          {finding.group} · {finding.category}
        </p>
      </div>
      <p className="col-span-2 min-w-0 break-words font-mono text-xs text-muted-foreground sm:col-span-1">
        {finding.value}
      </p>
    </div>
  );
}

function FindingList({ findings }: { findings: MetadataFinding[] }) {
  return (
    <div className="divide-y divide-border">
      {findings.map((finding, index) => (
        <FindingRow key={`${finding.group}.${finding.key}.${index}`} finding={finding} />
      ))}
    </div>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-warning/40 bg-warning/10 p-3">
      {warnings.map((warning) => (
        <p key={warning} className="text-xs leading-relaxed text-foreground">
          {warning}
        </p>
      ))}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function MetadataScanView({ scan, warnings }: { scan: MetadataScan; warnings?: string[] }) {
  const { findings, riskSummary, metadata } = scan;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 border-b border-border pb-3">
        <RiskSummary summary={riskSummary} total={findings.length} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {metadata.filename && <span className="truncate font-mono">{metadata.filename}</span>}
          <Badge variant="outline" className="font-mono uppercase">
            {metadata.fileType}
          </Badge>
          <span className="font-mono">{formatBytes(metadata.sizeBytes)}</span>
          <span className="font-mono">{metadata.timingMs}ms</span>
          <span className="font-mono text-[11px] text-muted-foreground/70" title={metadata.contentHash}>
            {metadata.contentHash.slice(0, 12)}
          </span>
        </div>
      </div>

      <Warnings warnings={warnings ?? []} />

      {findings.length > 0 && <FindingList findings={findings} />}
    </div>
  );
}

export function MetadataScrubView({ result }: { result: MetadataScrubSuccess }) {
  const { report, blob, filename } = result;
  const { removed, retained, metadata } = report;

  // Object URLs are per-blob and leak if the component remounts with a new one.
  const href = React.useMemo(() => URL.createObjectURL(blob), [blob]);
  React.useEffect(() => () => URL.revokeObjectURL(href), [href]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            {retained.length > 0 ? (
              <ShieldAlert className="h-4 w-4 text-warning" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-success" />
            )}
            <span>
              {removed.length} removed
              {retained.length > 0 && `, ${retained.length} could not be removed`}
            </span>
          </div>
          <Button asChild size="sm" className="gap-1.5">
            <a href={href} download={filename}>
              <Download className="h-3.5 w-3.5" />
              Download cleaned file
            </a>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="truncate font-mono">{filename}</span>
          <Badge variant="outline" className="font-mono uppercase">
            {metadata.fileType}
          </Badge>
          <span className="font-mono">
            {formatBytes(metadata.bytesBefore)} → {formatBytes(metadata.bytesAfter)}
          </span>
          <span className="font-mono">{metadata.timingMs}ms</span>
        </div>
      </div>

      <Warnings warnings={report.warnings ?? []} />

      {/*
        Retained comes first and is visually louder than removed. A reader who
        stops at the first section must not walk away believing the file is
        clean when something is still in it.
      */}
      {retained.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">Still in the File</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            These could not be removed without corrupting the file. Treat the download as improved, not clean.
          </p>
          <div className={cn('rounded-card border border-warning/40 bg-warning/5 px-3')}>
            <FindingList findings={retained} />
          </div>
        </section>
      )}

      {removed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">Removed</h3>
          <FindingList findings={removed} />
        </section>
      )}

      {removed.length === 0 && retained.length === 0 && (
        <p className="text-sm text-muted-foreground">This file carried no metadata; the download is unchanged.</p>
      )}
    </div>
  );
}
