import type { Metadata } from 'next';
import { Eye, GitCompareArrows, CalendarClock, BellRing, SlidersHorizontal, History } from 'lucide-react';
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
  "monitorId": "mon_def456",
  "status": "active",
  "nextCheckAt": "2026-08-24T13:00:00Z"
}`;

export default function MonitorPage() {
  return (
    <CapabilityPage
      endpoint="monitor"
      h1={['Know when', 'the web changes.']}
      subhead="Scheduled re-reads with inline diffs. Unchanged pages cost nothing and trigger nothing."
      mock={{
        chrome: 'terminal',
        label: 'diff · mon_def456',
        code: `- ## Standard
- $29/month, billed annually.
+ ## Standard
+ $34/month, billed annually.

  ## Pro
  $79/month. Includes priority support.`,
      }}
      features={[
        { icon: CalendarClock, title: 'Cron scheduling', body: 'Set a check interval with a standard cron string, bounded by an operator-configured minimum.' },
        { icon: GitCompareArrows, title: 'Diffs inline', body: 'Word, line and character-level diffs ship inside the webhook payload. No second call to learn what changed.' },
        { icon: SlidersHorizontal, title: 'Sensitivity filtering', body: '`significant` filters out rotating ads and "updated 2 min ago" timestamps so real changes are not buried in noise.' },
        { icon: BellRing, title: 'Unchanged costs nothing', body: 'A check that finds no change stores a snapshot for the timeline and fires no webhook.' },
        { icon: History, title: 'A real change timeline', body: 'Snapshot history is retained per monitor, so you can see when a page last changed, not just its current state.' },
        { icon: Eye, title: 'Field-level diffs', body: 'Pair a monitor with an extraction schema and diffs report which specific field changed, not just that the page did.' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
