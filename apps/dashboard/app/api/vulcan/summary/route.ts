import { auth } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { ingestAll } from '@/lib/vulcan/ingest';
import { aggregate } from '@/lib/vulcan/aggregate';
import { vulcanEnabled } from '@/lib/vulcan/gate';

/**
 * Vulcan reads Claude Code transcripts off the machine running this server,
 * so the route exists only when that server is reached on localhost (see
 * lib/vulcan/gate.ts). It is a dev-facing tool, not a product surface, and is
 * deliberately absent from openapi.yaml and the MCP server.
 */
export const dynamic = 'force-dynamic';

const WINDOWS = new Set([7, 30, 90]);

export async function GET(req: NextRequest) {
  if (!(await vulcanEnabled())) return new NextResponse(null, { status: 404 });
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const raw = req.nextUrl.searchParams.get('days');
  const days = raw === 'all' ? null : Number(raw ?? 30);
  const windowDays = days === null ? null : WINDOWS.has(days) ? days : 30;

  const { records, ...source } = await ingestAll();
  return NextResponse.json(aggregate(records, source, windowDays));
}
