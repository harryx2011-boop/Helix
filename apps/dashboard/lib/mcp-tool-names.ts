import type { Endpoint } from './endpoints';

const OVERRIDES: Partial<Record<Endpoint, string>> = {
  metadata: 'helix_metadata_scan',
  monitor: 'helix_create_monitor',
};

export function mcpToolName(id: Endpoint, pathSuffix = ''): string {
  if (pathSuffix) return `helix_${id}${pathSuffix.replace(/\//g, '_')}`;
  return OVERRIDES[id] ?? `helix_${id}`;
}
