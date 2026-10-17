import { describe, expect, it, vi } from 'vitest';
import { EMBED_HELLO, EMBED_KEY, listenForEmbedKey, type EmbedWindow } from './embed';

/** A window inside a frame, with a parent that records what it was sent. */
function framedWindow() {
  const listeners: ((event: MessageEvent) => void)[] = [];
  const parent = { postMessage: vi.fn() };
  const win: EmbedWindow = {
    parent,
    addEventListener: (_type, listener) => listeners.push(listener),
    removeEventListener: (_type, listener) => listeners.splice(listeners.indexOf(listener), 1),
  };
  const deliver = (data: unknown, origin: string, source: unknown = parent): void => {
    for (const listener of [...listeners]) listener({ data, origin, source } as MessageEvent);
  };
  return { win, parent, listeners, deliver };
}

const KEY = 'helix-0123456789abcdef0123456789abcdef';
const WEBVIEW = 'vscode-webview://1a2b3c4d';

describe('listenForEmbedKey', () => {
  it('does nothing in a window that is not framed', () => {
    const win: EmbedWindow = { parent: undefined, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    win.parent = win;
    listenForEmbedKey(vi.fn(), win);
    expect(win.addEventListener).not.toHaveBeenCalled();
  });

  it('asks the parent for a key, and takes one from a VS Code webview', () => {
    const { win, parent, deliver } = framedWindow();
    const onKey = vi.fn();
    listenForEmbedKey(onKey, win);

    expect(parent.postMessage).toHaveBeenCalledWith({ type: EMBED_HELLO }, '*');
    deliver({ type: EMBED_KEY, apiKey: KEY }, WEBVIEW);
    expect(onKey).toHaveBeenCalledWith(KEY);
  });

  it('ignores a key from any other origin', () => {
    const { win, deliver } = framedWindow();
    const onKey = vi.fn();
    listenForEmbedKey(onKey, win);

    deliver({ type: EMBED_KEY, apiKey: KEY }, 'https://evil.example');
    deliver({ type: EMBED_KEY, apiKey: KEY }, 'null');
    expect(onKey).not.toHaveBeenCalled();
  });

  it('ignores a key from a frame that is not its parent', () => {
    const { win, deliver } = framedWindow();
    const onKey = vi.fn();
    listenForEmbedKey(onKey, win);

    deliver({ type: EMBED_KEY, apiKey: KEY }, WEBVIEW, { postMessage: vi.fn() });
    expect(onKey).not.toHaveBeenCalled();
  });

  it('ignores a message that is not a well-formed Helix key', () => {
    const { win, deliver } = framedWindow();
    const onKey = vi.fn();
    listenForEmbedKey(onKey, win);

    deliver({ type: EMBED_KEY, apiKey: 'not-a-key' }, WEBVIEW);
    deliver({ type: EMBED_KEY, apiKey: 42 }, WEBVIEW);
    deliver({ type: 'other', apiKey: KEY }, WEBVIEW);
    deliver('helix-string', WEBVIEW);
    expect(onKey).not.toHaveBeenCalled();
  });

  it('stops listening when unsubscribed', () => {
    const { win, listeners } = framedWindow();
    const stop = listenForEmbedKey(vi.fn(), win);
    expect(listeners).toHaveLength(1);
    stop();
    expect(listeners).toHaveLength(0);
  });
});
