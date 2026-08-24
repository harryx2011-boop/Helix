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
  "estimate": true
}`;

const RESPONSE = `{ "success": true, "jobId": "crawl_abc123",
  "url": "http://localhost:7400/v1/crawl/crawl_abc123" }

GET /v1/crawl/crawl_abc123
{
  "status": "scraping",
  "total": 100,
  "completed": 42,
  "data": [ { "url": "...", "markdown": "..." } ]
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
        └─ /pricing        queued

42 / 100 pages`,
      }}
      features={[
        { icon: GitBranch, title: 'BFS discovery, predictable depth', body: 'Breadth-first traversal by default, so `maxDepth` behaves the way it reads.' },
        { icon: ShieldHalf, title: 'Robots-aware', body: 'robots.txt is honoured by default, with longest-match rules and Crawl-delay respected.' },
        { icon: Gauge, title: 'Adaptive politeness', body: 'Per-host concurrency ramps while a site stays healthy and backs off hard on 429s and latency spikes.' },
        { icon: Calculator, title: 'Estimate before you run', body: '`estimate: true` returns a projected page count and cost before a single page is fetched.' },
        { icon: Webhook, title: 'Webhooks per page', body: 'Get a webhook per discovered page and on completion, signed and retried with backoff.' },
        { icon: Network, title: 'Path filters', body: 'Include or exclude paths with glob patterns, and choose whether external links are followed.' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
