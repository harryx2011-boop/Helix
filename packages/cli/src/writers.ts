import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * File writers shared by every harness. Each preserves whatever else is in the
 * file: a user's other MCP servers and settings are not ours to touch.
 */

export const SERVER_ID = 'helix';

export interface McpTarget {
  mcpUrl: string;
  apiKey: string;
}

export type JsonObject = Record<string, unknown>;

function readJson(path: string): JsonObject {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8');
  if (raw.trim() === '') return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path} is not a JSON object`);
  }
  return parsed as JsonObject;
}

export function writeFileEnsuringDir(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

/** Sets `mcpServers.helix` in a JSON config, keeping every other key. */
export function upsertJsonMcpServer(path: string, entry: JsonObject): JsonObject {
  const config = readJson(path);
  const servers = (config['mcpServers'] && typeof config['mcpServers'] === 'object' && !Array.isArray(config['mcpServers'])
    ? (config['mcpServers'] as JsonObject)
    : {}) as JsonObject;
  const next = { ...config, mcpServers: { ...servers, [SERVER_ID]: entry } };
  writeFileEnsuringDir(path, JSON.stringify(next, null, 2) + '\n');
  return next;
}

export function claudeCodeEntry({ mcpUrl, apiKey }: McpTarget): JsonObject {
  return { type: 'http', url: mcpUrl, headers: { Authorization: `Bearer ${apiKey}` } };
}

export function cursorEntry({ mcpUrl, apiKey }: McpTarget): JsonObject {
  return { url: mcpUrl, headers: { Authorization: `Bearer ${apiKey}` } };
}

export function windsurfEntry({ mcpUrl, apiKey }: McpTarget): JsonObject {
  return { serverUrl: mcpUrl, headers: { Authorization: `Bearer ${apiKey}` } };
}

const tomlString = (value: string): string => JSON.stringify(value);

export function codexSection({ mcpUrl, apiKey }: McpTarget): string {
  return [
    `[mcp_servers.${SERVER_ID}]`,
    `url = ${tomlString(mcpUrl)}`,
    `http_headers = { Authorization = ${tomlString(`Bearer ${apiKey}`)} }`,
  ].join('\n');
}

/**
 * Replaces the `[mcp_servers.helix]` table (and any of its sub-tables) in a
 * TOML file, leaving the rest byte-for-byte intact. Full TOML parsing is not
 * needed to do that safely: tables start at column 0 with `[`.
 */
export function upsertTomlSection(existing: string, section: string): string {
  const lines = existing.split(/\r?\n/);
  const header = section.split('\n')[0]!;
  const ownPrefix = header.slice(0, -1);
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      skipping = trimmed === header || trimmed.startsWith(`${ownPrefix}.`);
    }
    if (!skipping) kept.push(line);
  }

  while (kept.length > 0 && kept[kept.length - 1]!.trim() === '') kept.pop();
  const body = kept.join('\n');
  return (body ? `${body}\n\n` : '') + section + '\n';
}

export function writeCodexConfig(path: string, target: McpTarget): string {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const next = upsertTomlSection(existing, codexSection(target));
  writeFileEnsuringDir(path, next);
  return next;
}
