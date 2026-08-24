import type { Metadata } from 'next';
import { Network, GitBranch, ShieldHalf, Gauge, Webhook, Calculator } from 'lucide-react';
import { CapabilityPage } from '@/components/marketing/pages/capability-page';

export const metadata: Metadata = {
  title: 'Web Crawling API',
  description: 'BFS discovery, robots honoured, adaptive per-host concurrency, and an estimate before a single page is fetched.',
};

const REQUEST = `POST /v1/crawl
{
  "url": "https://example.com",
  "limit": 100,
  "maxDepth": 3,
  "includePaths": ["/blog/*"],
  "excludePaths": ["/blog/tag/*"],
  "scrapeOptions": { "formats": ["markdown"] },
  "webhook": "https://myapp.example/webhooks/helix"
}`;

const RESPONSE = `202 Accepted
{
  "success": true,
  "id": "6f1c…",
  "jobId": "6f1c…",
  "url": "/v1/crawl/6f1c…"
}

GET /v1/crawl/6f1c…
{
  "status": "running",
  "total": 100,
  "completed": 42,
  "failed": 0,
  "data": [
    { "url": "https://example.com/blog/post-1",
      "markdown": "…",
      "metadata": { "title": "…", "sourceUrl": "…" } }
  ],
  "next": "/v1/crawl/6f1c…?cursor=100"
}`;

export default function CrawlPage() {
  return (
    <CapabilityPage
      endpoint="crawl"
      h1={['Whole sites,', 'politely.']}
      subhead="BFS discovery, robots honoured, adaptive per-host concurrency, and an estimate before a single page is fetched."
      mock={{
        chrome: 'browser',
        label: 'frontier → page list',
        code: `┌─┬┬─┐  example.com
├─┼┼─┤  ├─ /blog
│ ││ │  ├─ /blog/post-1   done
└─┴┴─┘  ├─ /blog/post-2   done
        ├─ /blog/tag/x    excluded
        └─ /pricing        queued

42 / 100 pages · status: running`,
      }}
      features={[
        { icon: GitBranch, title: 'BFS discovery, predictable depth', body: 'Breadth-first traversal, so `maxDepth: 3` means three links from the seed. Sitemaps seed the frontier too, so pages nothing links to are still found.' },
        { icon: ShieldHalf, title: 'Robots-aware', body: 'robots.txt is honoured by default, longest-match rules and `Crawl-delay` included. Disallowed URLs are reported as `robots_denied`, not silently dropped.' },
        { icon: Gauge, title: 'Adaptive politeness', body: 'Per-host concurrency ramps while a site stays healthy and backs off on 429s and latency spikes. Pin a fixed `delay` when you would rather not adapt.' },
        { icon: Calculator, title: 'Estimate before you run', body: '`estimate: true` returns the projected page count, time and provider tokens with its assumptions listed. Nothing is fetched.' },
        { icon: Webhook, title: 'Webhooks per page', body: 'Point `webhook` at a URL for `started`, `page`, `completed` and `failed` events. Retried with backoff for days, signed when you configure a secret, dead-lettered rather than lost.' },
        { icon: Network, title: 'Path filters as globs', body: '`includePaths: ["/blog/*"]` and `excludePaths: ["/blog/tag/*"]`, exclusion winning. Subdomains and external links stay out unless you opt in.' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
