import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectHarnesses, HARNESSES, harnessById, writeSkill } from './harnesses.js';
import { codexSection, upsertJsonMcpServer, upsertTomlSection, writeCodexConfig } from './writers.js';
import { runInit, selectHarnesses } from './init.js';
import { parseArgs } from './args.js';

const TARGET = { mcpUrl: 'https://mcp.example.test/v1', apiKey: 'helix-abcdefghijklmnop' };

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'helix-cli-'));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('JSON MCP config writer', () => {
  it('creates the file and parent directory when absent', () => {
    const path = join(home, '.cursor', 'mcp.json');
    upsertJsonMcpServer(path, { url: TARGET.mcpUrl });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ mcpServers: { helix: { url: TARGET.mcpUrl } } });
  });

  it('keeps other servers and top-level keys, replacing only helix', () => {
    const path = join(home, '.claude.json');
    writeFileSync(
      path,
      JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'x' }, helix: { url: 'stale' } } }),
    );
    upsertJsonMcpServer(path, { type: 'http', url: TARGET.mcpUrl });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      theme: 'dark',
      mcpServers: { other: { command: 'x' }, helix: { type: 'http', url: TARGET.mcpUrl } },
    });
  });

  it('refuses to clobber a file that is not a JSON object', () => {
    const path = join(home, '.cursor', 'mcp.json');
    mkdirSync(join(home, '.cursor'));
    writeFileSync(path, '[1,2]');
    expect(() => upsertJsonMcpServer(path, {})).toThrow(/not a JSON object/);
    expect(readFileSync(path, 'utf8')).toBe('[1,2]');
  });
});

describe('Codex TOML writer', () => {
  it('appends a helix table to an empty config', () => {
    expect(upsertTomlSection('', codexSection(TARGET))).toBe(
      [
        '[mcp_servers.helix]',
        'url = "https://mcp.example.test/v1"',
        'http_headers = { Authorization = "Bearer helix-abcdefghijklmnop" }',
        '',
      ].join('\n'),
    );
  });

  it('replaces an existing helix table and its sub-tables, leaving neighbours intact', () => {
    const existing = [
      'model = "gpt-5"',
      '',
      '[mcp_servers.helix]',
      'url = "old"',
      '',
      '[mcp_servers.helix.http_headers]',
      'Authorization = "Bearer old"',
      '',
      '[mcp_servers.other]',
      'command = "x"',
      '',
    ].join('\n');
    const next = upsertTomlSection(existing, codexSection(TARGET));
    expect(next).toBe(
      [
        'model = "gpt-5"',
        '',
        '[mcp_servers.other]',
        'command = "x"',
        '',
        '[mcp_servers.helix]',
        'url = "https://mcp.example.test/v1"',
        'http_headers = { Authorization = "Bearer helix-abcdefghijklmnop" }',
        '',
      ].join('\n'),
    );
    expect(next).not.toContain('old');
  });

  it('writes to disk, creating ~/.codex', () => {
    const path = join(home, '.codex', 'config.toml');
    writeCodexConfig(path, TARGET);
    expect(readFileSync(path, 'utf8')).toContain('[mcp_servers.helix]');
  });
});

describe('harness detection and skill placement', () => {
  it('detects only harnesses whose marker exists', () => {
    mkdirSync(join(home, '.claude'));
    mkdirSync(join(home, '.codeium', 'windsurf'), { recursive: true });
    expect(detectHarnesses(home).map((h) => h.id)).toEqual(['claude-code', 'windsurf']);
  });

  it('writes SKILL.md into each harness skills directory', () => {
    for (const harness of HARNESSES) {
      const path = writeSkill(harness, home, '# Helix\n');
      expect(path.endsWith(join('skills', 'helix', 'SKILL.md'))).toBe(true);
      expect(readFileSync(path, 'utf8')).toBe('# Helix\n');
    }
  });

  it('requires --all or --client when several could be meant', () => {
    mkdirSync(join(home, '.cursor'));
    expect(() => selectHarnesses({ all: false, clients: [] }, home)).toThrow(/--all/);
    expect(selectHarnesses({ all: true, clients: [] }, home).map((h) => h.id)).toEqual(['cursor']);
    expect(selectHarnesses({ all: false, clients: ['codex'] }, home)[0]).toBe(harnessById('codex'));
    expect(() => selectHarnesses({ all: false, clients: ['vim'] }, home)).toThrow(/unknown client/);
  });
});

describe('init end to end', () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/app/skill')) return new Response('# account skill\n', { status: 200 });
    return new Response('# public skill\n', { status: 200 });
  };

  it('writes MCP config and the account SKILL.md for every detected harness', async () => {
    mkdirSync(join(home, '.claude'));
    mkdirSync(join(home, '.codex'));
    const result = await runInit({
      apiKey: TARGET.apiKey,
      all: true,
      clients: [],
      browser: false,
      mcpUrl: TARGET.mcpUrl,
      siteUrl: 'https://app.example.test',
      skill: true,
      dryRun: false,
      home,
      fetchImpl,
    });

    expect(result.harnesses.map((h) => h.id)).toEqual(['claude-code', 'codex']);
    expect(result.skillSource).toBe('account');
    expect(result.warnings).toEqual([]);

    const claude = JSON.parse(readFileSync(join(home, '.claude.json'), 'utf8'));
    expect(claude.mcpServers.helix).toEqual({
      type: 'http',
      url: TARGET.mcpUrl,
      headers: { Authorization: `Bearer ${TARGET.apiKey}` },
    });
    expect(readFileSync(join(home, '.claude', 'skills', 'helix', 'SKILL.md'), 'utf8')).toBe('# account skill\n');
    expect(readFileSync(join(home, '.codex', 'config.toml'), 'utf8')).toContain(`Bearer ${TARGET.apiKey}`);
    expect(readFileSync(join(home, '.codex', 'skills', 'helix', 'SKILL.md'), 'utf8')).toBe('# account skill\n');
  });

  it('falls back to the public SKILL.md with a warning when the account route rejects the key', async () => {
    mkdirSync(join(home, '.cursor'));
    const rejecting: typeof fetch = async (input) =>
      String(input).endsWith('/api/app/skill') ? new Response('', { status: 401 }) : new Response('# public skill\n');
    const result = await runInit({
      apiKey: TARGET.apiKey,
      all: true,
      clients: [],
      browser: false,
      mcpUrl: TARGET.mcpUrl,
      siteUrl: 'https://app.example.test',
      skill: true,
      dryRun: false,
      home,
      fetchImpl: rejecting,
    });
    expect(result.skillSource).toBe('public');
    expect(result.warnings[0]).toMatch(/public version/);
    expect(readFileSync(join(home, '.cursor', 'skills', 'helix', 'SKILL.md'), 'utf8')).toBe('# public skill\n');
  });

  it('dry-run touches nothing', async () => {
    mkdirSync(join(home, '.cursor'));
    await runInit({
      apiKey: TARGET.apiKey,
      all: true,
      clients: [],
      browser: false,
      mcpUrl: TARGET.mcpUrl,
      siteUrl: 'https://app.example.test',
      skill: false,
      dryRun: true,
      home,
      fetchImpl,
    });
    expect(() => readFileSync(join(home, '.cursor', 'mcp.json'))).toThrow();
  });

  it('refuses to run without a key or --browser', async () => {
    await expect(
      runInit({ all: true, clients: [], browser: false, mcpUrl: TARGET.mcpUrl, siteUrl: 'x', skill: false, dryRun: true, home }),
    ).rejects.toThrow(/API key is required/);
  });
});

describe('argv parsing', () => {
  it('handles aliases, repeated flags and --flag=value', () => {
    const parsed = parseArgs(['init', '-k', 'helix-x', '--client', 'cursor', '--client=codex', '--all'], new Set(['key', 'client']));
    expect(parsed.positional).toEqual(['init']);
    expect(parsed.flags).toEqual({ key: ['helix-x'], client: ['cursor', 'codex'], all: true });
  });
});
