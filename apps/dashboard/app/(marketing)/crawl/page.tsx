import type { Metadata } from 'next';
import { GitBranch, ShieldHalf, Gauge, Calculator } from 'lucide-react';
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
        { icon: GitBranch, eyebrow: 'Predictable depth', lead: 'BFS discovery.', body: 'maxDepth: 3 means three links from the seed; sitemaps seed the frontier too.', evidence: '"maxDepth": 3, "limit": 100' },
        { icon: ShieldHalf, eyebrow: 'Robots-aware', lead: 'robots.txt is honoured by default.', body: 'Disallowed URLs are reported as robots_denied, not silently dropped.', evidence: '"status": "robots_denied"' },
        { icon: Gauge, eyebrow: 'Adaptive politeness', lead: 'Per-host concurrency ramps and backs off.', body: 'Pin a fixed delay when you would rather not adapt.', evidence: '429 → concurrency reduced, retried' },
        { icon: Calculator, eyebrow: 'Estimate before you run', lead: 'Nothing is fetched.', body: 'estimate: true returns projected pages, time and tokens.', evidence: '"estimate": true' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
