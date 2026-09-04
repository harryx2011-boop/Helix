import type { Metadata } from 'next';
import { StatusView } from '@/components/marketing/status/status-view';

export const metadata: Metadata = {
  title: 'Status',
  description: 'Live status for Helix — per-service health, latency and 90-day uptime history.',
};

export default function StatusPage() {
  return <StatusView />;
}
