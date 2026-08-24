import type { Metadata } from 'next';
import { GitCompareArrows, CalendarClock, BellRing, SlidersHorizontal, History, Webhook } from 'lucide-react';
import { CapabilityPage } from '@/components/marketing/pages/capability-page';

export const metadata: Metadata = {
  title: 'Web Monitoring API',
  description: 'Scheduled re-reads with inline diffs. Unchanged pages cost nothing and trigger nothing.',
};

const REQUEST = `POST /v1/monitor
{
  "url": "https://example.com/pricing",
  "schedule": "0 * * * *",
  "sensitivity": "significant",
  "webhook": "https://your.app/webhooks/helix"
}`;

const RESPONSE = `{
  "success": true,
  "id": "f2a1c6e0-4b7d-4c1e-9a3b-2d5e8f7a1b23",
  "monitorId": "f2a1c6e0-4b7d-4c1e-9a3b-2d5e8f7a1b23",
  "url": "https://example.com/pricing",
  "schedule": { "cron": "0 * * * *", "timezone": "UTC" },
  "sensitivity": "significant",
  "diff": { "granularity": "word", "inline": true },
  "status": "active",
  "nextCheckAt": "2026-08-24T13:00:00.000Z",
  "stats": { "checks": 0, "changes": 0, "pagesUnchanged": 0 }
}`;

export default function MonitorPage() {
  return (
    <CapabilityPage
      endpoint="monitor"
      h1={['Know when', 'the web changes.']}
      subhead="Scheduled re-reads with inline diffs. Unchanged pages cost nothing and trigger nothing."
      mock={{
        chrome: 'terminal',
        label: 'GET /v1/monitor/f2a1c6e0/history · line diff',
        code: `  ## Standard
- $29/month, billed annually.
+ $34/month, billed annually.

  ## Pro
  $79/month. Includes priority support.`,
      }}
      features={[
        { icon: CalendarClock, title: 'Cron or interval scheduling', body: 'A cron string, or `every: "6h"` with a timezone. The operator sets the minimum gap between checks, hourly by default, and a faster schedule is refused up front.' },
        { icon: GitCompareArrows, title: 'Diffs inline', body: 'Word, line or character diffs ship inside the webhook payload and the history entry. No second call to learn what moved.' },
        { icon: SlidersHorizontal, title: 'Sensitivity and keyword triggers', body: '`significant` strips relative timestamps, clock times, dates and tracking parameters before comparing. Keyword triggers fire only when a phrase appears or disappears, with no model call.' },
        { icon: BellRing, title: 'Unchanged costs nothing', body: 'A check that finds no change stores no snapshot and sends no webhook. The history records that it looked, and that is all.' },
        { icon: History, title: 'A real change timeline', body: 'Every check is an entry with its reason and a link to the snapshot it produced. Retention is set per instance by count and age.' },
        { icon: Webhook, title: 'Webhooks that keep trying', body: 'HMAC-signed deliveries retried with backoff over ten attempts, then dead-lettered where you can inspect and replay them.' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
