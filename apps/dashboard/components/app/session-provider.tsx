'use client';

import { useApiKey, useOptionalApiKey } from '@/components/shell/api-key-provider';

/** The app runs against the operator's own instance; the session is the API key held in localStorage. */
export function useAppSession(): { apiKey: string | null } {
  return { apiKey: useOptionalApiKey()?.apiKey ?? null };
}

export { useApiKey };
