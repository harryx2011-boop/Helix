export const GITHUB_REPO = 'harryx2011-boop/Helix';
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;

/**
 * Star count for the nav button, fetched server-side and cached for an hour.
 * Returns `null` on any failure (rate limit, private repo, offline build) and
 * the nav falls back to the word "GitHub"; a missing number is never an error.
 */
export async function fetchGithubStars(): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: unknown };
    return typeof data.stargazers_count === 'number' ? formatStars(data.stargazers_count) : null;
  } catch {
    return null;
  }
}

export function formatStars(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}
