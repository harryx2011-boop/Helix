import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { fetchUsageSeries } from '@/lib/usage';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const profile = await requireProfile();
  const url = new URL(request.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days')) || 30));
  return NextResponse.json(await fetchUsageSeries(profile.id, days));
}
