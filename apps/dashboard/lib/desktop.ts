export interface HelixDesktop {
  apiKey: string;
  adminToken: string;
  version: string;
  platform: 'win32';
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
