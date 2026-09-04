import { Badge } from '@/components/ui/badge';
import { FetchLadder } from '@/components/ladder/fetch-ladder';
import { SiteIcon } from '@/components/result/site-icon';
import type { DocumentMetadata } from '@/lib/api';

/** Timing and hash are surfaced from the raw response, since Document.metadata doesn't carry them (see openapi.yaml Metadata vs. the route's actual payload). */
interface MetadataStripProps {
  metadata: DocumentMetadata;
  timingMs?: number | undefined;
  contentHash?: string | undefined;
}

export function MetadataStrip({ metadata, timingMs, contentHash }: MetadataStripProps) {
  // Server-reported timing (pipeline duration) is authoritative; the client
  // stopwatch (round-trip including network) is the fallback for callers
  // that pass no metadata.timingMs.
  const displayedTimingMs = metadata.timingMs ?? timingMs;
  const displayedUrl = metadata.finalUrl ?? metadata.sourceUrl;

  return (
    <div className="flex flex-col gap-3 border-b border-border pb-3">
      {displayedUrl && (
        <div className="flex min-w-0 items-center gap-1.5 text-xs">
          <SiteIcon url={displayedUrl} src={metadata.favicon} size={14} />
          <span className="truncate font-mono text-muted-foreground">{displayedUrl}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {metadata.statusCode !== undefined && (
          <span className="flex items-center gap-1.5">
            Status
            <Badge variant={metadata.statusCode < 400 ? 'success' : 'destructive'} className="font-mono">
              {metadata.statusCode}
            </Badge>
          </span>
        )}
        {displayedTimingMs !== undefined && <span className="font-mono">{displayedTimingMs}ms</span>}
        {metadata.fromCache && (
          <Badge variant="outline" className="font-mono">
            cached
          </Badge>
        )}
        {contentHash && (
          <span className="font-mono text-[11px] text-muted-foreground/70" title={contentHash}>
            {contentHash.slice(0, 12)}
          </span>
        )}
      </div>
      {metadata.tiersAttempted && metadata.tiersAttempted.length > 0 && (
        <FetchLadder tiersAttempted={metadata.tiersAttempted} resolvedTier={metadata.tier} />
      )}
    </div>
  );
}
