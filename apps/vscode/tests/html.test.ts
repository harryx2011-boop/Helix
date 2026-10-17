import { describe, expect, it } from 'vitest';
import { panelHtml } from '../src/html';

const html = panelHtml({ origin: 'http://127.0.0.1:7410', path: '/app/playground?tab=monitor', nonce: 'abc123' });

describe('panelHtml', () => {
  it('frames the Helix app at the requested page', () => {
    expect(html).toContain('<iframe id="helix" src="http://127.0.0.1:7410/app/playground?tab=monitor"');
  });

  it('allows framing only that origin, and scripts only with the nonce', () => {
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
    expect(csp).toBe("default-src 'none'; frame-src http://127.0.0.1:7410; script-src 'nonce-abc123'; style-src 'unsafe-inline';");
    expect(html).toContain('<script nonce="abc123">');
  });

  it('hands the key only to the framed app, at its exact origin', () => {
    expect(html).toContain('const ORIGIN = "http://127.0.0.1:7410";');
    expect(html).toContain('frame.contentWindow.postMessage({ type: "helix:embed-key", apiKey: message.apiKey }, ORIGIN)');
    expect(html).toContain('event.source === frame.contentWindow && event.origin === ORIGIN');
  });

  it('relays a key only when the webview host sent it, not a frame inside the app', () => {
    // Measured in VS Code 1.137: a host message carries the webview's own origin,
    // and its source is not `window.parent`. No frame inside the app has that origin.
    expect(html).toContain('event.origin === window.origin && message.type === "helix:key"');
  });

  it('escapes a path that tries to break out of the attribute', () => {
    const hostile = panelHtml({ origin: 'http://127.0.0.1:7410', path: '/app"><script>x()</script>', nonce: 'n' });
    expect(hostile).not.toContain('<script>x()');
  });
});
