import { afterEach, describe, expect, it, vi } from 'vitest';
import { instanceMcpUrl, instanceUrl } from './mode';

function atOrigin(origin: string): void {
  const { port } = new URL(origin);
  vi.stubGlobal('window', { location: { origin, port } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('instanceUrl', () => {
  it('shows the localhost fallback during static render, where there is no window', () => {
    vi.stubEnv('NEXT_PUBLIC_HELIX_API_URL', '');
    expect(instanceUrl()).toBe('http://localhost:7400');
  });

  it('shows the page origin when the API serves the page itself, as in the desktop app', () => {
    vi.stubEnv('NEXT_PUBLIC_HELIX_API_URL', '');
    atOrigin('http://127.0.0.1:7410');
    expect(instanceUrl()).toBe('http://127.0.0.1:7410');
  });

  it('keeps the sibling API on the dev port, where the dashboard runs apart from it', () => {
    vi.stubEnv('NEXT_PUBLIC_HELIX_API_URL', '');
    atOrigin('http://localhost:3400');
    expect(instanceUrl()).toBe('http://localhost:7400');
  });

  it('puts the MCP endpoint on the same origin unless one is baked', () => {
    vi.stubEnv('NEXT_PUBLIC_HELIX_API_URL', '');
    atOrigin('http://127.0.0.1:7410');
    expect(instanceMcpUrl()).toBe('http://127.0.0.1:7410/mcp');

    vi.stubEnv('NEXT_PUBLIC_HELIX_MCP_URL', 'https://mcp.helix.dev/v1');
    expect(instanceMcpUrl()).toBe('https://mcp.helix.dev/v1');
  });

  it('shows a baked API URL over the page origin', () => {
    vi.stubEnv('NEXT_PUBLIC_HELIX_API_URL', 'https://helix.example.com');
    atOrigin('http://127.0.0.1:7410');
    expect(instanceUrl()).toBe('https://helix.example.com');
  });
});
