export const RELEASES_REPO = 'harryx2011-boop/helix-releases';
export const RELEASES_URL = `https://github.com/${RELEASES_REPO}/releases`;

export interface Installer {
  version: string;
  url: string;
  bytes: number;
}

interface ReleaseAsset {
  name?: unknown;
  browser_download_url?: unknown;
  size?: unknown;
}

interface Release {
  tag_name?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  assets?: unknown;
}

const INSTALLER = /^Helix-Setup-.+\.exe$/;

/** The NSIS installer in a release, or null when the release has none (a draft, a prerelease, or assets still uploading). */
export function pickInstaller(release: Release): Installer | null {
  if (release.draft === true || release.prerelease === true || typeof release.tag_name !== 'string') return null;
  const assets = Array.isArray(release.assets) ? (release.assets as ReleaseAsset[]) : [];
  const asset = assets.find((a) => typeof a.name === 'string' && INSTALLER.test(a.name));
  if (!asset || typeof asset.browser_download_url !== 'string' || typeof asset.size !== 'number') return null;
  return { version: release.tag_name.replace(/^v/, ''), url: asset.browser_download_url, bytes: asset.size };
}

/**
 * The latest published installer, re-checked every ten minutes. Null until the
 * first release exists and on any failure, so the page shows "coming soon"
 * rather than a download link that 404s.
 */
export async function fetchLatestInstaller(): Promise<Installer | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    return pickInstaller((await res.json()) as Release);
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1_048_576)} MB`;
}
