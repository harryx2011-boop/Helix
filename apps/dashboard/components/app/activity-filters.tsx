'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { ENDPOINTS } from '@/lib/catalog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface ActivityFiltersProps {
  endpoint?: string | undefined;
  status?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

const STATUSES = ['success', 'failure', 'running', 'cancelled'] as const;

/** Filters as search params (WEBSITE.md §7.5) — navigating re-fetches the server component above. */
export function ActivityFilters({ endpoint, status, from, to }: ActivityFiltersProps) {
  const router = useRouter();

  const pushParam = React.useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(window.location.search);
      params.delete('cursor');
      if (value) params.set(key, value);
      else params.delete(key);
      router.push(`/app/activity?${params.toString()}`);
    },
    [router],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={endpoint ?? 'all'} onValueChange={(v) => pushParam('endpoint', v === 'all' ? undefined : v)}>
        <SelectTrigger className="h-8 w-40 text-xs">
          <SelectValue placeholder="Endpoint" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All endpoints</SelectItem>
          {ENDPOINTS.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={status ?? 'all'} onValueChange={(v) => pushParam('status', v === 'all' ? undefined : v)}>
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <Input
          type="date"
          defaultValue={from}
          onBlur={(e) => pushParam('from', e.target.value || undefined)}
          className="h-8 w-36 text-xs"
          aria-label="From date"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="date"
          defaultValue={to}
          onBlur={(e) => pushParam('to', e.target.value || undefined)}
          className="h-8 w-36 text-xs"
          aria-label="To date"
        />
      </div>
    </div>
  );
}
