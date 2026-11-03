export const HOSTED = process.env.HELIX_HOSTED === '1' || process.env.NEXT_PUBLIC_HELIX_HOSTED === '1';

export const MARKETING_ENABLED = process.env.HELIX_MARKETING !== '0';

export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_HELIX_API_URL || 'http://localhost:7400';

export function instanceUrl(): string {
  const baked = process.env.NEXT_PUBLIC_HELIX_API_URL;
  if (baked) return baked;
  if (!HOSTED && typeof window !== 'undefined' && window.location.port !== '3400') return window.location.origin;
  return PUBLIC_API_URL;
}

export function instanceMcpUrl(): string {
  return process.env.NEXT_PUBLIC_HELIX_MCP_URL || `${instanceUrl()}/mcp`;
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3400';

export const MCP_URL = process.env.NEXT_PUBLIC_HELIX_MCP_URL || `${PUBLIC_API_URL}/mcp`;
