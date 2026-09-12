/**
 * One app, two build modes (WEBSITE.md §1).
 *
 * Hosted:    HELIX_HOSTED=1 — Clerk auth, Supabase-backed keys/runs, server output.
 * Self-host: default       — local API-key gate, static export served by the API.
 */
export const HOSTED = process.env.HELIX_HOSTED === '1' || process.env.NEXT_PUBLIC_HELIX_HOSTED === '1';

export const MARKETING_ENABLED = process.env.HELIX_MARKETING !== '0';

export const HOSTED_API_URL = process.env.HELIX_HOSTED_API_URL ?? 'http://localhost:7400';

export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_HELIX_API_URL ?? 'http://localhost:7400';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3400';

/** The API serves MCP at `/mcp` on its own host; a hosted deployment may front it with `https://mcp.helix.dev/v1`. */
export const MCP_URL = process.env.NEXT_PUBLIC_HELIX_MCP_URL ?? `${PUBLIC_API_URL}/mcp`;
