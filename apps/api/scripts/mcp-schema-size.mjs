// Prints the compact-JSON size of every MCP tool in tools/list.
// Usage: node apps/api/scripts/mcp-schema-size.mjs [--json out.json] [--url http://host:port/mcp]
// Without --url it boots a scratch API on HELIX_SCRATCH_PORT (default 7485) with a throwaway
// data dir and key, exposing the agent-facing 30-tool core. With --url, HELIX_API_KEY is the bearer.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const CORE_TOOLS = [
  'helix_scrape', 'helix_search', 'helix_map', 'helix_crawl', 'helix_estimate_crawl', 'helix_get_crawl',
  'helix_cancel_crawl', 'helix_batch_scrape', 'helix_get_batch_scrape', 'helix_extract', 'helix_agent_schema',
  'helix_parse', 'helix_document', 'helix_screenshot', 'helix_metadata_scan', 'helix_diff', 'helix_enrich',
  'helix_interact', 'helix_list_monitors', 'helix_create_monitor', 'helix_get_monitor', 'helix_monitor_history',
  'helix_check_monitor', 'helix_get_job', 'helix_get_job_errors', 'helix_get_job_ladder', 'helix_get_job_cost',
  'helix_robots_check', 'helix_health', 'helix_vectors_search', 'helix_image_sheet',
].join(',');

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = join(here, '..');

export async function startScratch(port = Number(process.env.HELIX_SCRATCH_PORT ?? 7485)) {
  if (port >= 7400 && port <= 7412) throw new Error('refusing a port in the live range 7400-7412');
  const key = `helix-${randomBytes(24).toString('hex')}`;
  const dataDir = mkdtempSync(join(tmpdir(), 'helix-mcp-scratch-'));
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: apiDir,
    env: {
      ...process.env,
      HELIX_PORT: String(port),
      HELIX_HOST: '127.0.0.1',
      HELIX_DB: 'pglite',
      HELIX_DATA_DIR: dataDir,
      HELIX_BOOTSTRAP_KEY: key,
      HELIX_LOG_LEVEL: 'error',
      HELIX_MCP_TOOLS: process.env.HELIX_MCP_TOOLS ?? CORE_TOOLS,
    },
    stdio: ['ignore', 'ignore', 'inherit'],
    windowsHide: true,
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/v1/health`)).status < 500) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    url: `${base}/mcp`,
    key,
    stop() {
      child.kill();
      try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* pglite may still hold files */ }
    },
  };
}

export async function connect(url, key) {
  const client = new Client({ name: 'mcp-schema-size', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${key}` } } }));
  return client;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const scratch = opt('--url') ? undefined : await startScratch();
  try {
    const client = await connect(opt('--url') ?? scratch.url, scratch?.key ?? process.env.HELIX_API_KEY);
    const { tools } = await client.listTools();
    const rows = tools.map((t) => ({ name: t.name, chars: JSON.stringify(t).length, descChars: (t.description ?? '').length }));
    rows.sort((a, b) => b.chars - a.chars);
    for (const r of rows) console.log(`${String(r.chars).padStart(7)}  ${r.name}`);
    const total = JSON.stringify({ tools }).length;
    console.log(`${String(total).padStart(7)}  TOTAL (${tools.length} tools, ${rows.reduce((s, r) => s + r.descChars, 0)} description chars)`);
    if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(tools));
    await client.close();
  } finally {
    scratch?.stop();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
}
