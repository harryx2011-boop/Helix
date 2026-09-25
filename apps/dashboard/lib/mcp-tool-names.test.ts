import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENDPOINTS } from './catalog';
import { mcpToolName } from './mcp-tool-names';

/** The server's naming rule, apps/api/src/mcp/tools.ts `toolName`. */
const toolName = (operationId: string): string =>
  `helix_${operationId
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toLowerCase()}`;

const SPEC = readFileSync(join(__dirname, '..', '..', '..', 'openapi.yaml'), 'utf8');
const SERVED = new Set([...SPEC.matchAll(/operationId:\s*(\w+)/g)].map((m) => toolName(m[1]!)));

describe('mcpToolName', () => {
  // The docs page and the code snippets used to print `helix_${id}`, which named
  // tools the server does not generate (`helix_metadata`, `helix_monitor`).
  it('names a tool the server actually serves, for every live endpoint', () => {
    for (const endpoint of ENDPOINTS.filter((e) => e.status === 'live')) {
      expect(SERVED, `${endpoint.id} -> ${mcpToolName(endpoint.id)}`).toContain(mcpToolName(endpoint.id));
    }
  });

  it('keeps a sub-operation suffix as part of the name', () => {
    expect(mcpToolName('metadata', '/scrub')).toBe('helix_metadata_scrub');
    expect(SERVED).toContain('helix_metadata_scrub');
  });
});
