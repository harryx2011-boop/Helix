import type { Metadata } from 'next';
import { GitCompareArrows, CalendarClock, BellRing, SlidersHorizontal } from 'lucide-react';
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
        { icon: CalendarClock, eyebrow: 'Cron or interval', lead: 'Scheduled re-reads.', body: 'A cron string or every: "6h", with a timezone attached.', evidence: '"schedule": "0 * * * *"' },
        { icon: GitCompareArrows, eyebrow: 'Diffs inline', lead: 'No second call to learn what moved.', body: 'Word, line or character diffs ship in the webhook payload.', evidence: '"diff": { "granularity": "word" }' },
        { icon: SlidersHorizontal, eyebrow: 'Sensitivity and triggers', lead: 'Noise gets filtered out.', body: 'significant strips timestamps and tracking params before comparing.', evidence: '"sensitivity": "significant"' },
        { icon: BellRing, eyebrow: 'Unchanged costs nothing', lead: 'No snapshot, no webhook.', body: 'A check with no change just records that it looked.', evidence: '"stats": { "checks": 12, "changes": 0 }' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
