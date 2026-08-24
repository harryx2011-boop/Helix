'use client';

import * as React from 'react';
import type { SearchRequest } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FormFooter } from './form-footer';

interface SearchFormProps {
  onSubmit: (request: SearchRequest) => void;
  onGetCode: (body: Record<string, unknown>) => void;
  loading: boolean;
}

export function SearchForm({ onSubmit, onGetCode, loading }: SearchFormProps) {
  const [query, setQuery] = React.useState('');
  const [limit, setLimit] = React.useState(10);
  const [scrape, setScrape] = React.useState(false);

  const buildRequest = React.useCallback((): SearchRequest => {
    const request: SearchRequest = { query: query.trim(), limit };
    if (scrape) request.scrape = { formats: ['markdown'] };
    return request;
  }, [query, limit, scrape]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim().length === 0 || loading) return;
    onSubmit(buildRequest());
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="search-query">Query</Label>
        <Input
          id="search-query"
          type="text"
          placeholder="transactional email APIs"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="search-limit">Limit</Label>
        <Input
          id="search-limit"
          type="number"
          min={1}
          max={100}
          value={limit}
          onChange={(event) => setLimit(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="search-scrape" className="text-sm font-normal">
          Read every result (scrape)
        </Label>
        <Switch id="search-scrape" checked={scrape} onCheckedChange={setScrape} />
      </div>

      <FormFooter
        loading={loading}
        disabled={query.trim().length === 0}
        onGetCode={() => onGetCode(buildRequest() as unknown as Record<string, unknown>)}
      />
    </form>
  );
}
