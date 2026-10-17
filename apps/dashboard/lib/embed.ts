/**
 * The API key handoff for `/app` shown inside the Helix VS Code extension.
 *
 * The extension hosts `/app` in an iframe inside a webview. The iframe sees no
 * `window.helixDesktop` and its storage is not the browser's, so the key the
 * extension keeps is passed in by message: the app asks its parent once, and
 * takes an answer only from that parent, only from a VS Code webview origin,
 * and only in the shape of a Helix key.
 */

export const EMBED_HELLO = 'helix:embed-hello';
export const EMBED_KEY = 'helix:embed-key';

/** The webview origin scheme VS Code gives every webview. */
const WEBVIEW_ORIGIN = 'vscode-webview://';

const KEY_SHAPE = /^helix-[A-Za-z0-9_-]{8,200}$/;

/** The parts of `window` this module uses, so tests can pass a stand-in. */
export interface EmbedWindow {
  parent: unknown;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

interface Postable {
  postMessage(message: unknown, targetOrigin: string): void;
}

/** The key in a trusted handoff message, or null for anything else. */
function trustedKey(event: MessageEvent, win: EmbedWindow): string | null {
  if (event.source !== win.parent) return null;
  if (!event.origin.startsWith(WEBVIEW_ORIGIN)) return null;

  const data: unknown = event.data;
  if (typeof data !== 'object' || data === null) return null;
  const message = data as { type?: unknown; apiKey?: unknown };
  if (message.type !== EMBED_KEY || typeof message.apiKey !== 'string') return null;
  return KEY_SHAPE.test(message.apiKey) ? message.apiKey : null;
}

/**
 * Inside a frame, ask the parent for a key and call `onKey` with each trusted
 * answer. Outside a frame, do nothing. Returns the unsubscribe.
 *
 * The hello is sent to any origin because it carries nothing; the answer is
 * what gets checked.
 */
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
