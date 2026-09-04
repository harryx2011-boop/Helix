'use client';

import * as React from 'react';
import type { CrawlRequest } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormFooter } from './form-footer';

function parseLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

type SitemapMode = NonNullable<CrawlRequest['sitemap']>;

interface CrawlFormProps {
  url: string;
  onSubmit: (request: CrawlRequest) => void;
  onGetCode: (body: Record<string, unknown>) => void;
  loading: boolean;
}

const TEXTAREA_CLASS =
  'flex w-full rounded-card border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export function CrawlForm({ url, onSubmit, onGetCode, loading }: CrawlFormProps) {
  const [limit, setLimit] = React.useState(100);
  const [maxDepth, setMaxDepth] = React.useState<number | ''>('');
  const [includePaths, setIncludePaths] = React.useState('');
  const [excludePaths, setExcludePaths] = React.useState('');
  const [sitemap, setSitemap] = React.useState<SitemapMode>('include');
  const [respectRobots, setRespectRobots] = React.useState(true);
  const [allowExternal, setAllowExternal] = React.useState(false);
  const [webhook, setWebhook] = React.useState('');
  const [estimate, setEstimate] = React.useState(true);

  const buildRequest = React.useCallback((): CrawlRequest => {
    const request: CrawlRequest = { url: url.trim(), limit, estimate };
    if (maxDepth !== '') request.maxDepth = maxDepth;
    const include = parseLines(includePaths);
    const exclude = parseLines(excludePaths);
    if (include.length > 0) request.includePaths = include;
    if (exclude.length > 0) request.excludePaths = exclude;
    if (sitemap !== 'include') request.sitemap = sitemap;
    if (!respectRobots) request.respectRobots = false;
    if (allowExternal) request.allowExternal = true;
    if (webhook.trim().length > 0) request.webhook = webhook.trim();
    return request;
  }, [url, limit, maxDepth, includePaths, excludePaths, sitemap, respectRobots, allowExternal, webhook, estimate]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (url.trim().length === 0 || loading) return;
    onSubmit(buildRequest());
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="crawl-limit">Page limit</Label>
          <Input
            id="crawl-limit"
            type="number"
            min={1}
            value={limit}
            onChange={(event) => setLimit(Math.max(1, Number(event.target.value) || 1))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="crawl-depth">Max depth</Label>
          <Input
            id="crawl-depth"
            type="number"
            min={0}
            placeholder="No limit"
            value={maxDepth}
            onChange={(event) => setMaxDepth(event.target.value === '' ? '' : Math.max(0, Number(event.target.value)))}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="crawl-include">Include paths (one glob per line)</Label>
        <textarea
          id="crawl-include"
          rows={2}
          placeholder="/docs/*"
          value={includePaths}
          onChange={(event) => setIncludePaths(event.target.value)}
          className={TEXTAREA_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="crawl-exclude">Exclude paths (one glob per line)</Label>
        <textarea
          id="crawl-exclude"
          rows={2}
          placeholder="/docs/changelog/*"
          value={excludePaths}
          onChange={(event) => setExcludePaths(event.target.value)}
          className={TEXTAREA_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="crawl-sitemap">Sitemap</Label>
        <Select value={sitemap} onValueChange={(value) => setSitemap(value as SitemapMode)}>
          <SelectTrigger id="crawl-sitemap" className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="include">Seed from sitemap and links</SelectItem>
            <SelectItem value="skip">Links only</SelectItem>
            <SelectItem value="only">Sitemap only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="crawl-robots" className="text-sm font-normal">
          Respect robots.txt
        </Label>
        <Switch id="crawl-robots" checked={respectRobots} onCheckedChange={setRespectRobots} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="crawl-external" className="text-sm font-normal">
          Follow external links
        </Label>
        <Switch id="crawl-external" checked={allowExternal} onCheckedChange={setAllowExternal} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="crawl-webhook">Webhook URL (optional)</Label>
        <Input
          id="crawl-webhook"
          type="url"
          placeholder="https://your.app/webhooks/helix"
          value={webhook}
          onChange={(event) => setWebhook(event.target.value)}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="crawl-estimate" className="text-sm font-normal">
          Estimate only (no crawl runs)
        </Label>
        <Switch id="crawl-estimate" checked={estimate} onCheckedChange={setEstimate} />
      </div>

      <FormFooter
        loading={loading}
        disabled={url.trim().length === 0}
        onGetCode={() => onGetCode(buildRequest() as unknown as Record<string, unknown>)}
      />
    </form>
  );
}
