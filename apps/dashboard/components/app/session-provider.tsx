'use client';

import { useApiKey, useOptionalApiKey } from '@/components/shell/api-key-provider';

export function useAppSession(): { apiKey: string | null } {
  return { apiKey: useOptionalApiKey()?.apiKey ?? null };
}

export { useApiKey };
