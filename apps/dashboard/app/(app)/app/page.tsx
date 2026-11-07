import { ENDPOINTS } from '@/lib/catalog';
import { OverviewClient } from './overview-client';

export default function OverviewPage() {
  return (
    <OverviewClient
      endpoints={ENDPOINTS.map((e) => ({ id: e.id, name: e.name, tagline: e.tagline, status: e.status, route: e.route }))}
      welcome={false}
    />
  );
}
