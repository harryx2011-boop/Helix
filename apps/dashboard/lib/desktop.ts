export interface HelixDesktop {
  apiKey: string;
  adminToken: string;
  version: string;
  platform: 'win32';
  /** The API origin that takes the API key, set by the browser launcher; its page origin is gated by a cookie. */
  apiOrigin?: string;
  /** Starts the local voice service on first use and answers where it is; absent in older desktop builds. */
  voice?: { connect: () => Promise<unknown> };
}

declare global {
  interface Window {
    helixDesktop?: HelixDesktop;
  }
}

function bridge(): HelixDesktop | undefined {
  if (typeof window === 'undefined') return undefined;
  const value = window.helixDesktop;
  if (!value || typeof value !== 'object') return undefined;
  return value;
}

export function isDesktop(): boolean {
  return bridge() !== undefined;
}

export function desktopCredentials(): { apiKey: string | null; adminToken: string | null } | null {
  const value = bridge();
  if (!value) return null;
  const pick = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  return { apiKey: pick(value.apiKey), adminToken: pick(value.adminToken) };
}

/** The API origin the browser launcher names, or null (Electron, a plain browser). */
export function desktopApiOrigin(): string | null {
  const origin = bridge()?.apiOrigin;
  return typeof origin === 'string' && origin.length > 0 ? origin : null;
}

/** Whether a listed key (known only by its prefix) is the one the desktop app authenticates with. */
export function isDesktopKey(keyPrefix: string): boolean {
  const apiKey = desktopCredentials()?.apiKey;
  return Boolean(apiKey && keyPrefix.length > 0 && apiKey.startsWith(keyPrefix));
}

export interface VoiceConnection {
  baseUrl: string;
  token: string;
}

function isVoiceConnection(value: unknown): value is VoiceConnection {
  if (typeof value !== 'object' || value === null) return false;
  const { baseUrl, token } = value as Record<string, unknown>;
  if (typeof baseUrl !== 'string' || typeof token !== 'string' || token.length === 0) return false;
  try {
    return new URL(baseUrl).hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function desktopVoice(): { connect: () => Promise<VoiceConnection | null> } | null {
  const voice = bridge()?.voice;
  if (!voice || typeof voice.connect !== 'function') return null;
  return {
    connect: async () => {
      const found = await voice.connect();
      return isVoiceConnection(found) ? found : null;
    },
  };
}
