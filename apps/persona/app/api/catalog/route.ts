import { NextResponse } from 'next/server';
import { getPersona } from '@/lib/catalog';

/**
 * On-demand body lookup for actions that need the full markdown (copy,
 * download) from surfaces that only hold a `PersonaSummary` (no body, to
 * keep the client bundle small) — the browse grid's card menu — and the
 * editor's version chip, which compares `version` with a fork's source.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role');
  const persona = searchParams.get('persona');
  if (!role || !persona) {
    return NextResponse.json({ error: 'role and persona query params are required' }, { status: 400 });
  }
  const found = await getPersona(role, persona);
  if (!found) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ bodyMd: found.bodyMd, name: found.name, slug: found.slug, version: found.version });
}
