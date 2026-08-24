/**
 * The commands and config snippets the connect sheet, the Overview panel and
 * the docs print. Mirrors what `@helix/cli init` writes (packages/cli/src/writers.ts):
 * a snippet pasted by hand and a file written by the CLI must produce the same
 * server entry.
 */

export const CONNECT_CLIENTS = ['Claude Code', 'Cursor', 'Codex', 'Windsurf', 'Generic'] as const;
export type ConnectClient = (typeof CONNECT_CLIENTS)[number];

/** Defaults baked into `@helix/cli`; flags are only printed when the app's values differ. */
export const CLI_DEFAULT_MCP_URL = 'https://mcp.helix.dev/v1';
export const CLI_DEFAULT_SITE_URL = 'https://helix.dev';

export const SERVER_ID = 'helix';

export interface ConnectTarget {
  apiKey: string;
  mcpUrl: string;
  siteUrl?: string | undefined;
}

export function cliInitCommand({ apiKey, mcpUrl, siteUrl }: ConnectTarget): string {
  const parts = ['npx -y @helix/cli@latest init --all', `-k ${apiKey}`];
  if (mcpUrl !== CLI_DEFAULT_MCP_URL) parts.push(`--mcp-url ${mcpUrl}`);
  if (siteUrl && siteUrl !== CLI_DEFAULT_SITE_URL) parts.push(`--site-url ${siteUrl}`);
  return parts.join(' ');
}

export function claudeMcpAddCommand({ apiKey, mcpUrl }: ConnectTarget): string[] {
  return [`claude mcp add --transport http ${SERVER_ID} ${mcpUrl} \\`, `  --header "Authorization: Bearer ${apiKey}"`];
}

const bearer = (apiKey: string) => `Bearer ${apiKey}`;

export interface ConnectSnippet {
  /** Where the snippet goes: a file path, or "terminal". */
  target: string;
  lines: string[];
}

export function mcpSnippet(client: ConnectClient, target: ConnectTarget): ConnectSnippet {
  const { apiKey, mcpUrl } = target;
  switch (client) {
    case 'Claude Code':
      return { target: 'terminal', lines: claudeMcpAddCommand(target) };
    case 'Cursor':
      return {
        target: '~/.cursor/mcp.json',
        lines: JSON.stringify({ mcpServers: { [SERVER_ID]: { url: mcpUrl, headers: { Authorization: bearer(apiKey) } } } }, null, 2).split('\n'),
      };
    case 'Codex':
      return {
        target: '~/.codex/config.toml',
        lines: [`[mcp_servers.${SERVER_ID}]`, `url = "${mcpUrl}"`, `http_headers = { Authorization = "${bearer(apiKey)}" }`],
      };
    case 'Windsurf':
      return {
        target: '~/.codeium/windsurf/mcp_config.json',
        lines: JSON.stringify({ mcpServers: { [SERVER_ID]: { serverUrl: mcpUrl, headers: { Authorization: bearer(apiKey) } } } }, null, 2).split('\n'),
      };
    case 'Generic':
      return {
        target: 'any streamable-HTTP MCP client',
        lines: [`URL:    ${mcpUrl}`, `Header: Authorization: ${bearer(apiKey)}`],
      };
  }
}
