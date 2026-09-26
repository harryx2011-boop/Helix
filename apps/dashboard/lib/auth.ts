import { desktopCredentials } from './desktop';

const STORAGE_KEY = 'helix.apiKey';

export function getApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return desktopCredentials()?.apiKey ?? window.localStorage.getItem(STORAGE_KEY);
}

export function setApiKey(key: string): void {
  window.localStorage.setItem(STORAGE_KEY, key);
}

export function clearApiKey(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
