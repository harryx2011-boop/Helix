'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Search/filter state lives in the URL (`?q=&dept=&platform=&tone=`) so the
 * sidebar and the grid agree and the page is shareable. Multi-select filters
 * are comma-separated.
 */
export interface CatalogFilters {
  q: string;
  dept: string[];
  platform: string[];
  tone: string[];
}

function parse(params: URLSearchParams): CatalogFilters {
  const list = (key: string) => (params.get(key) ? params.get(key)!.split(',').filter(Boolean) : []);
  return { q: params.get('q') ?? '', dept: list('dept'), platform: list('platform'), tone: list('tone') };
}

export function useCatalogFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = React.useMemo(() => parse(searchParams), [searchParams]);

  const update = React.useCallback(
    (patch: Partial<CatalogFilters>) => {
      const next = { ...filters, ...patch };
      const params = new URLSearchParams();
      if (next.q) params.set('q', next.q);
      if (next.dept.length) params.set('dept', next.dept.join(','));
      if (next.platform.length) params.set('platform', next.platform.join(','));
      if (next.tone.length) params.set('tone', next.tone.join(','));
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [filters, pathname, router],
  );

  const toggle = React.useCallback(
    (key: 'dept' | 'platform' | 'tone', value: string) => {
      const current = filters[key];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      update({ [key]: next });
    },
    [filters, update],
  );

  const clear = React.useCallback(() => update({ q: '', dept: [], platform: [], tone: [] }), [update]);

  return { filters, update, toggle, clear };
}
