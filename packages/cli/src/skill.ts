/**
 * SKILL.md comes from the app, generated for the account the key belongs to
 * (WEBSITE.md §9.3). The public, keyless version is the fallback when the
 * account route is unreachable, so an install never ends without a skill.
 */

export interface SkillSource {
  markdown: string;
  source: 'account' | 'public';
}

export async function fetchSkill(
  siteUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SkillSource> {
  const base = siteUrl.replace(/\/$/, '');

  try {
    const response = await fetchImpl(`${base}/api/app/skill`, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'text/markdown' },
      redirect: 'manual',
    });
    if (response.ok) return { markdown: await response.text(), source: 'account' };
  } catch {
    // Fall through to the public document.
  }

  const response = await fetchImpl(`${base}/agent-onboarding/SKILL.md`, { headers: { accept: 'text/markdown' } });
  if (!response.ok) throw new Error(`could not fetch SKILL.md from ${base} (HTTP ${response.status})`);
  return { markdown: await response.text(), source: 'public' };
}
