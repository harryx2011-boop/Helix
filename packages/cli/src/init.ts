import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { detectHarnesses, harnessById, writeSkill, type Harness } from './harnesses.js';
import { fetchSkill } from './skill.js';

export const DEFAULT_MCP_URL = 'https://mcp.helix.dev/v1';
export const DEFAULT_SITE_URL = 'https://helix.dev';

const KEY_SHAPE = /^helix-[A-Za-z0-9]{16}$/;

export interface InitOptions {
  apiKey?: string | undefined;
  all: boolean;
  clients: string[];
  browser: boolean;
  mcpUrl: string;
  siteUrl: string;
  skill: boolean;
  dryRun: boolean;
  home?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
  log?: ((line: string) => void) | undefined;
}

export interface InitResult {
  harnesses: { id: string; mcpConfigPath: string; skillPath?: string }[];
  skillSource?: 'public';
  warnings: string[];
}

export function openInBrowser(url: string, platform: NodeJS.Platform = process.platform): void {
  const [command, args] =
    platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

export function selectHarnesses(opts: Pick<InitOptions, 'all' | 'clients'>, home: string): Harness[] {
  if (opts.clients.length > 0) {
    return opts.clients.map((id) => {
      const harness = harnessById(id);
      if (!harness) throw new Error(`unknown client "${id}". Known: claude-code, cursor, codex, windsurf`);
      return harness;
    });
  }
  const detected = detectHarnesses(home);
  if (!opts.all) {
    const hint = detected.length > 0 ? `Detected: ${detected.map((h) => h.id).join(', ')}.` : 'No harness detected.';
    throw new Error(`pass --all to configure every detected harness, or --client <id>. ${hint}`);
  }
  return detected;
}

export async function runInit(opts: InitOptions): Promise<InitResult> {
  const log = opts.log ?? (() => undefined);
  const home = opts.home ?? homedir();
  const warnings: string[] = [];

  if (opts.browser) {
    const url = `${opts.siteUrl.replace(/\/$/, '')}/app?connect=1`;
    log(`Opening ${url}`);
    log('Copy the command shown there and run it here.');
    openInBrowser(url);
    return { harnesses: [], warnings };
  }

  const apiKey = opts.apiKey;
  if (!apiKey) throw new Error('an API key is required: -k helix-… (or set HELIX_API_KEY), or --browser');
  if (!KEY_SHAPE.test(apiKey)) warnings.push(`"${apiKey.slice(0, 10)}…" does not look like a Helix key (helix- + 16 chars)`);

  const harnesses = selectHarnesses(opts, home);
  if (harnesses.length === 0) {
    throw new Error('no agent harness detected (looked for ~/.claude, ~/.cursor, ~/.codex, ~/.codeium/windsurf). Use --client <id> to force one.');
  }

  let skill: { markdown: string; source: 'public' } | undefined;
  if (opts.skill) {
    try {
      skill = await fetchSkill(opts.siteUrl, opts.fetchImpl);
    } catch (error) {
      warnings.push(`SKILL.md skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const result: InitResult = { harnesses: [], warnings };
  if (skill) result.skillSource = skill.source;

  for (const harness of harnesses) {
    const mcpConfigPath = harness.mcpConfigPath(home);
    const entry: InitResult['harnesses'][number] = { id: harness.id, mcpConfigPath };
    if (skill) entry.skillPath = harness.skillPath(home);

    if (opts.dryRun) {
      log(`[dry-run] ${harness.label}: would write ${mcpConfigPath}${entry.skillPath ? ` and ${entry.skillPath}` : ''}`);
    } else {
      harness.writeMcp(home, { mcpUrl: opts.mcpUrl, apiKey });
      log(`${harness.label}: MCP server "helix" -> ${mcpConfigPath}`);
      if (skill) {
        writeSkill(harness, home, skill.markdown);
        log(`${harness.label}: SKILL.md -> ${entry.skillPath}`);
      }
    }
    result.harnesses.push(entry);
  }

  return result;
}
