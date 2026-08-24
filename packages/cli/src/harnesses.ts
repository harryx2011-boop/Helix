import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  claudeCodeEntry,
  cursorEntry,
  upsertJsonMcpServer,
  windsurfEntry,
  writeCodexConfig,
  writeFileEnsuringDir,
  type McpTarget,
} from './writers.js';

export type HarnessId = 'claude-code' | 'cursor' | 'codex' | 'windsurf';

export interface Harness {
  id: HarnessId;
  label: string;
  /** Paths (relative to home) whose presence means the harness is installed. */
  markers: string[];
  mcpConfigPath: (home: string) => string;
  skillPath: (home: string) => string;
  writeMcp: (home: string, target: McpTarget) => string;
}

export const HARNESSES: readonly Harness[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    markers: ['.claude', '.claude.json'],
    mcpConfigPath: (home) => join(home, '.claude.json'),
    skillPath: (home) => join(home, '.claude', 'skills', 'helix', 'SKILL.md'),
    writeMcp: (home, target) => {
      const path = join(home, '.claude.json');
      upsertJsonMcpServer(path, claudeCodeEntry(target));
      return path;
    },
  },
  {
    id: 'cursor',
    label: 'Cursor',
    markers: ['.cursor'],
    mcpConfigPath: (home) => join(home, '.cursor', 'mcp.json'),
    skillPath: (home) => join(home, '.cursor', 'skills', 'helix', 'SKILL.md'),
    writeMcp: (home, target) => {
      const path = join(home, '.cursor', 'mcp.json');
      upsertJsonMcpServer(path, cursorEntry(target));
      return path;
    },
  },
  {
    id: 'codex',
    label: 'Codex',
    markers: ['.codex'],
    mcpConfigPath: (home) => join(home, '.codex', 'config.toml'),
    skillPath: (home) => join(home, '.codex', 'skills', 'helix', 'SKILL.md'),
    writeMcp: (home, target) => {
      const path = join(home, '.codex', 'config.toml');
      writeCodexConfig(path, target);
      return path;
    },
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    markers: [join('.codeium', 'windsurf')],
    mcpConfigPath: (home) => join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    skillPath: (home) => join(home, '.codeium', 'windsurf', 'skills', 'helix', 'SKILL.md'),
    writeMcp: (home, target) => {
      const path = join(home, '.codeium', 'windsurf', 'mcp_config.json');
      upsertJsonMcpServer(path, windsurfEntry(target));
      return path;
    },
  },
];

export function harnessById(id: string): Harness | undefined {
  return HARNESSES.find((h) => h.id === id);
}

export function detectHarnesses(home: string): Harness[] {
  return HARNESSES.filter((h) => h.markers.some((marker) => existsSync(join(home, marker))));
}

export function writeSkill(harness: Harness, home: string, markdown: string): string {
  const path = harness.skillPath(home);
  writeFileEnsuringDir(path, markdown);
  return path;
}
