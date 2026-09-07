import 'server-only';
import { headers } from 'next/headers';
import { HOSTED } from '@/lib/mode';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isLocalHost(host: string | null): boolean {
  if (!host) return false;
  const bare = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.replace(/:\d+$/, '');
  return LOCAL_HOSTS.has(bare.toLowerCase());
}

/**
 * Vulcan exists only on a Next server answering on localhost. Self-host is a
 * static export with no route handlers, and a hosted deployment has no
 * `~/.claude` to read, so everywhere else the page, the route and the nav row
 * are absent rather than empty.
 */
export async function vulcanEnabled(): Promise<boolean> {
  if (!HOSTED) return false;
  const h = await headers();
  const forwarded = h.get('x-forwarded-host');
  if (forwarded !== null && !isLocalHost(forwarded)) return false;
  return isLocalHost(h.get('host'));
}
