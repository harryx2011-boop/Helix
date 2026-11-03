
export const EMBED_HELLO = 'helix:embed-hello';
export const EMBED_KEY = 'helix:embed-key';

const WEBVIEW_ORIGIN = 'vscode-webview://';

const KEY_SHAPE = /^helix-[A-Za-z0-9_-]{8,200}$/;

export interface EmbedWindow {
  parent: unknown;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

interface Postable {
  postMessage(message: unknown, targetOrigin: string): void;
}

function trustedKey(event: MessageEvent, win: EmbedWindow): string | null {
  if (event.source !== win.parent) return null;
  if (!event.origin.startsWith(WEBVIEW_ORIGIN)) return null;

  const data: unknown = event.data;
  if (typeof data !== 'object' || data === null) return null;
  const message = data as { type?: unknown; apiKey?: unknown };
  if (message.type !== EMBED_KEY || typeof message.apiKey !== 'string') return null;
  return KEY_SHAPE.test(message.apiKey) ? message.apiKey : null;
}

export function listenForEmbedKey(onKey: (key: string) => void, win: EmbedWindow = window): () => void {
  if (win.parent === win) return () => undefined;

  const listener = (event: MessageEvent): void => {
    const key = trustedKey(event, win);
    if (key) onKey(key);
  };
  win.addEventListener('message', listener);
  (win.parent as Postable).postMessage({ type: EMBED_HELLO }, '*');

  return () => win.removeEventListener('message', listener);
}
