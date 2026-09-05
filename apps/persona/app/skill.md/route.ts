import { generateSkillMarkdown, SITE_URL } from '@/lib/agent-api';

export const dynamic = 'force-static';

/** `/skill.md`: the agent-facing SKILL.md, generated from the catalog so its directory never drifts from `content/`. */
export async function GET() {
  const body = await generateSkillMarkdown(SITE_URL);
  return new Response(body, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      'access-control-allow-origin': '*',
    },
  });
}
