import { NextResponse } from 'next/server';
import { buildIndex, SITE_URL } from '@/lib/agent-api';

export const dynamic = 'force-static';

/** The catalog as JSON, for agents. Public, no auth; derived from `content/` at build. */
export async function GET() {
  const index = await buildIndex(SITE_URL);
  return NextResponse.json(index, {
    headers: {
      'cache-control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      'access-control-allow-origin': '*',
    },
  });
}
