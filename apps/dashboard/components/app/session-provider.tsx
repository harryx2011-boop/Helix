'use client';

import { useApiKey, useOptionalApiKey } from '@/components/shell/api-key-provider';

/**
 * The app runs against the operator's own instance in both modes, so there is
 * one session shape: the API key held in localStorage. Hosted mode differs
 * only in that Clerk gates the route.
 */
export function useAppSession(): { apiKey: string | null } {
  return { apiKey: useOptionalApiKey()?.apiKey ?? null };
}

export { useApiKey };
