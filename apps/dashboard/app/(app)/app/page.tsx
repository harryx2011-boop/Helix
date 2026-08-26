import { HOSTED } from '@/lib/mode';
import { requireOnboardedProfile } from '@/lib/session';
import { listApiKeys, byteaToBuffer } from '@/lib/profiles';
import { decryptApiKey, maskApiKey } from '@/lib/keys';
import { ENDPOINTS, orderBySelection } from '@/lib/catalog';
import { fetchUsageSeries } from '@/lib/usage';
import { OverviewClient } from './overview-client';

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const welcome = params.welcome === '1';
  // `helix init --browser` lands here with the connect sheet already open.
  const connect = params.connect === '1';

  if (!HOSTED) {
    return (
      <OverviewClient
        endpoints={ENDPOINTS.map((e) => ({ id: e.id, name: e.name, tagline: e.tagline, status: e.status, route: e.route }))}
        keyMasked={null}
        revealedKey={null}
        welcome={false}
        connect={connect}
      />
    );
  }

  const profile = await requireOnboardedProfile();
  const [keys, usage] = await Promise.all([listApiKeys(profile.id), fetchUsageSeries(profile.id, 7)]);
  const defaultKey = keys.find((k) => !k.revoked_at) ?? keys[0];
  const keyMasked = defaultKey ? maskApiKey(defaultKey.prefix, defaultKey.last3) : null;

  // On first visit after onboarding, show the full key once (WEBSITE.md §7.2).
  let revealedKey: string | null = null;
  if (welcome && defaultKey) {
    try {
      revealedKey = decryptApiKey(byteaToBuffer(defaultKey.key_ciphertext), byteaToBuffer(defaultKey.key_iv));
    } catch {
      revealedKey = null;
    }
  }

  const ordered = orderBySelection(profile.selected_endpoints);

  return (
    <OverviewClient
      endpoints={ordered.map((e) => ({ id: e.id, name: e.name, tagline: e.tagline, status: e.status, route: e.route }))}
      keyMasked={keyMasked}
      revealedKey={revealedKey}
      welcome={welcome}
      connect={connect}
      requestsSeries={{ labels: usage.labels, values: usage.requests }}
    />
  );
}
