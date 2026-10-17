import { describe, expect, it } from 'vitest';
import { statusView } from '../src/status';

describe('statusView', () => {
  it('shows a running API with its port and version', () => {
    const view = statusView({ port: 7410, origin: 'http://127.0.0.1:7410', status: 'ok', version: '2.3.2' }, [7410, 7400]);
    expect(view.text).toBe('$(pulse) Helix');
    expect(view.tooltip).toBe('Helix 2.3.2 on port 7410: ok. Click to open.');
    expect(view.warning).toBe(false);
  });

  it('flags a degraded API', () => {
    const view = statusView({ port: 7400, origin: 'http://127.0.0.1:7400', status: 'degraded', version: '2.3.2' }, [7410, 7400]);
    expect(view.text).toBe('$(warning) Helix');
    expect(view.tooltip).toBe('Helix 2.3.2 on port 7400: degraded. Click to open.');
    expect(view.warning).toBe(true);
  });

  it('names the ports it tried when nothing answers', () => {
    const view = statusView(null, [7410, 7400]);
    expect(view.text).toBe('$(circle-slash) Helix');
    expect(view.tooltip).toBe('No Helix API answered on port 7410 or 7400. Start the Helix desktop app or the dev stack.');
    expect(view.warning).toBe(true);
  });

  it('names a single pinned port', () => {
    expect(statusView(null, [7500]).tooltip).toMatch(/^No Helix API answered on port 7500\./);
  });
});
