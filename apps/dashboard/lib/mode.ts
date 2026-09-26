/**
 * One app, two build modes (DESKTOP-PLAN.md Phase 2).
 *
 * Hosted:    HELIX_HOSTED=1 — the public website on Vercel, server output, no instance and no accounts.
 * Self-host: default       — local API-key gate, static export served by the API.
 */
export const HOSTED = process.env.HELIX_HOSTED === '1' || process.env.NEXT_PUBLIC_HELIX_HOSTED === '1';

export const MARKETING_ENABLED = process.env.HELIX_MARKETING !== '0';

export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_HELIX_API_URL || 'http://localhost:7400';

/**
 * The instance URL to show a person. Off the dev port with no baked URL, the
 * API serves this page itself (the desktop app, a self-host export), so the
 * page's own origin is the instance; `resolveBaseUrl` in `lib/api.ts` makes the
 * same call for requests. Browser-only: server render and export get the fallback.
 */
export function instanceUrl(): string {
  const baked = process.env.NEXT_PUBLIC_HELIX_API_URL;
  if (baked) return baked;
  if (!HOSTED && typeof window !== 'undefined' && window.location.port !== '3400') return window.location.origin;
  return PUBLIC_API_URL;
}

/** `MCP_URL` for display, on the same origin rule as `instanceUrl`. */
export function instanceMcpUrl(): string {
  return process.env.NEXT_PUBLIC_HELIX_MCP_URL ?? `${instanceUrl()}/mcp`;
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3400';

/** The API serves MCP at `/mcp` on its own host; a hosted deployment may front it with `https://mcp.helix.dev/v1`. */
export const MCP_URL = process.env.NEXT_PUBLIC_HELIX_MCP_URL ?? `${PUBLIC_API_URL}/mcp`;
