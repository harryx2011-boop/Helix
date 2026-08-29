/**
 * SKILL.md is served keyless and covers every endpoint. Helix keeps no account
 * data, so there is no per-account variant to prefer.
 *
 * The request is bounded: fetch has no timeout of its own, and a site that
 * accepts the connection and never answers must not hang the install.
 */

export interface SkillSource {
  markdown: string;
  source: 'public';
}

export const SKILL_FETCH_TIMEOUT_MS = 10_000;

export async function fetchSkill(
  siteUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = SKILL_FETCH_TIMEOUT_MS,
): Promise<SkillSource> {
  const base = siteUrl.replace(/\/$/, '');

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
