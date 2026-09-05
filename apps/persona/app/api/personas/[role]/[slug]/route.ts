import { NextResponse } from 'next/server';
import { getPersona, getRole } from '@/lib/catalog';
import { personaDetail, SITE_URL } from '@/lib/agent-api';

export const dynamic = 'force-dynamic';

const CACHE = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

/**
 * One persona. JSON by default (frontmatter, placeholders, guides, body);
 * the system prompt alone as `text/markdown` on `?format=md` or an Accept
 * header that asks for it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ role: string; slug: string }> }) {
  const { role: roleSlug, slug } = await params;
  const [role, persona] = await Promise.all([getRole(roleSlug), getPersona(roleSlug, slug)]);
  if (!role || !persona) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'access-control-allow-origin': '*' } });
  }

  const url = new URL(request.url);
  const wantsMarkdown = url.searchParams.get('format') === 'md' || (request.headers.get('accept') ?? '').includes('text/markdown');
  if (wantsMarkdown) {
    return new Response(`${persona.bodyMd}\n`, {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'cache-control': CACHE,
        'access-control-allow-origin': '*',
        'x-persona-version': String(persona.version),
      },
    });
  }

  return NextResponse.json(personaDetail(SITE_URL, role, persona), {
    headers: { 'cache-control': CACHE, 'access-control-allow-origin': '*' },
  });
}
