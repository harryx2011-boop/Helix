/**
 * SKILL.md comes from the app, generated for the account the key belongs to
 * (WEBSITE.md §9.3). The public, keyless version is the fallback when the
 * account route is unreachable, so an install never ends without a skill.
 *
 * Both requests are bounded: fetch has no timeout of its own, and a site that
 * accepts the connection and never answers must not hang the install.
 */

export interface SkillSource {
  markdown: string;
  source: 'account' | 'public';
}

export const SKILL_FETCH_TIMEOUT_MS = 10_000;

export async function fetchSkill(
  siteUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = SKILL_FETCH_TIMEOUT_MS,
): Promise<SkillSource> {
  const base = siteUrl.replace(/\/$/, '');

  try {
    const response = await fetchImpl(`${base}/api/app/skill`, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'text/markdown' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) return { markdown: await response.text(), source: 'account' };
  } catch {
    // Fall through to the public document.
  }

  let response: Response;
  try {
    response = await fetchImpl(`${base}/agent-onboarding/SKILL.md`, {
      headers: { accept: 'text/markdown' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError' ? `no response within ${timeoutMs}ms` : String(error);
    throw new Error(`could not fetch SKILL.md from ${base} (${reason})`);
  }
  if (!response.ok) throw new Error(`could not fetch SKILL.md from ${base} (HTTP ${response.status})`);
  return { markdown: await response.text(), source: 'public' };
}
