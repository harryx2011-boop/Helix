import type { Endpoint } from './endpoints';

/**
 * The MCP tool name for each catalog endpoint. The server names a tool
 * `helix_<snake(operationId)>` (apps/api/src/mcp/tools.ts), and an operationId
 * is not always the catalog id: `metadata` is `metadataScan`, `monitor` is
 * `createMonitor`. Every surface that prints a tool name reads this map, and
 * `mcp-tool-names.test.ts` checks each entry against openapi.yaml.
 */
const OVERRIDES: Partial<Record<Endpoint, string>> = {
  metadata: 'helix_metadata_scan',
  monitor: 'helix_create_monitor',
};

export function mcpToolName(id: Endpoint, pathSuffix = ''): string {
  if (pathSuffix) return `helix_${id}${pathSuffix.replace(/\//g, '_')}`;
  return OVERRIDES[id] ?? `helix_${id}`;
}
