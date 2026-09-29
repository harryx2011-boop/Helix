/**
 * The Electron preload exposes `window.helixDesktop` through `contextBridge`.
 * Its presence is the one signal that the dashboard is running inside the
 * desktop app, where the instance's own key and admin token are handed over
 * instead of typed in.
 */
export interface HelixDesktop {
  apiKey: string;
  adminToken: string;
  version: string;
  platform: 'win32';
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

/** Null outside the desktop app; an empty string from the bridge counts as absent. */
export function desktopCredentials(): { apiKey: string | null; adminToken: string | null } | null {
  const value = bridge();
  if (!value) return null;
  const pick = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  return { apiKey: pick(value.apiKey), adminToken: pick(value.adminToken) };
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

/** The desktop app's dictation service, or null in a browser and in a desktop build without it. */
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
