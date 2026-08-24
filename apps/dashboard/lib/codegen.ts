import type { Endpoint } from './supabase/types';
import { endpointById } from './catalog';

export type Lang = 'curl' | 'python' | 'node' | 'mcp';
export const LANGS: readonly { id: Lang; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'python', label: 'Python' },
  { id: 'node', label: 'Node' },
  { id: 'mcp', label: 'MCP' },
];

export const KEY_PLACEHOLDER = 'helix-YOUR_KEY';

interface Opts {
  endpoint: Endpoint;
  body: Record<string, unknown>;
  apiKey?: string;
  baseUrl?: string;
  mcpUrl?: string;
}

/** One request, four ways. Shared by the hero panel and the playground's Get code (WEBSITE.md §4.2, §7.4). */
export function generateCode(lang: Lang, opts: Opts): string {
  const def = endpointById(opts.endpoint);
  const path = def?.path ?? `/v1/${opts.endpoint}`;
  const base = (opts.baseUrl ?? 'https://api.helix.dev').replace(/\/$/, '');
  const key = opts.apiKey ?? KEY_PLACEHOLDER;
  const json = JSON.stringify(opts.body, null, 2);

  switch (lang) {
    case 'curl':
      return [
        `curl -X POST ${base}${path} \\`,
        `  -H "Authorization: Bearer ${key}" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '${JSON.stringify(opts.body)}'`,
      ].join('\n');
    case 'python':
      return [
        'import requests',
        '',
        `r = requests.post(`,
        `    "${base}${path}",`,
        `    headers={"Authorization": "Bearer ${key}"},`,
        `    json=${pyLiteral(opts.body)},`,
        `)`,
        'print(r.json())',
      ].join('\n');
    case 'node':
      return [
        `const r = await fetch("${base}${path}", {`,
        `  method: "POST",`,
        `  headers: { Authorization: "Bearer ${key}", "Content-Type": "application/json" },`,
        `  body: JSON.stringify(${json.replace(/\n/g, '\n  ')}),`,
        `});`,
        'console.log(await r.json());',
      ].join('\n');
    case 'mcp':
      return [
        `claude mcp add --transport http helix ${opts.mcpUrl ?? 'https://mcp.helix.dev/v1'} \\`,
        `  --header "Authorization: Bearer ${key}"`,
        '',
        `# then, in your agent:`,
        `# use the helix_${opts.endpoint} tool with ${JSON.stringify(opts.body)}`,
      ].join('\n');
  }
}

function pyLiteral(v: unknown, indent = 4): string {
  if (Array.isArray(v)) return `[${v.map((x) => pyLiteral(x, indent)).join(', ')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).map(([k, x]) => `${' '.repeat(indent + 4)}"${k}": ${pyLiteral(x, indent + 4)}`);
    return `{\n${entries.join(',\n')}\n${' '.repeat(indent)}}`;
  }
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (v === null) return 'None';
  return JSON.stringify(v);
}
