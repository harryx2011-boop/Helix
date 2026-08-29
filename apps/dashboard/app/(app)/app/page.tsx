import { ENDPOINTS } from '@/lib/catalog';
import { OverviewClient } from './overview-client';

/**
 * No server-side data: the key lives in the browser and every figure on this
 * page comes from the instance it talks to. Static in both modes, which also
 * keeps the self-host export buildable — awaiting `searchParams` would not be.
 */
export default function OverviewPage() {
  return (
    <OverviewClient
      endpoints={ENDPOINTS.map((e) => ({ id: e.id, name: e.name, tagline: e.tagline, status: e.status, route: e.route }))}
      welcome={false}
    />
  );
}
