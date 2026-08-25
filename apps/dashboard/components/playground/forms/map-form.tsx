'use client';

import * as React from 'react';
import type { MapRequest } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormFooter } from './form-footer';

const SITEMAP_OPTIONS: { value: NonNullable<MapRequest['sitemap']>; label: string }[] = [
  { value: 'include', label: 'Include sitemap' },
  { value: 'skip', label: 'Skip sitemap' },
  { value: 'only', label: 'Sitemap only' },
];

interface MapFormProps {
  url: string;
  onSubmit: (request: MapRequest) => void;
  onGetCode: (body: Record<string, unknown>) => void;
  loading: boolean;
}

export function MapForm({ url, onSubmit, onGetCode, loading }: MapFormProps) {
  const [search, setSearch] = React.useState('');
  const [sitemap, setSitemap] = React.useState<NonNullable<MapRequest['sitemap']>>('include');
  const [includeSubdomains, setIncludeSubdomains] = React.useState(false);

  const buildRequest = React.useCallback((): MapRequest => {
    const request: MapRequest = { url: url.trim(), sitemap, includeSubdomains };
    if (search.trim().length > 0) request.search = search.trim();
    return request;
  }, [url, search, sitemap, includeSubdomains]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (url.trim().length === 0 || loading) return;
    onSubmit(buildRequest());
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="map-search">Rank by relevance to (optional)</Label>
        <Input
          id="map-search"
          type="text"
          placeholder="pricing"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="map-sitemap">Sitemap</Label>
        <Select value={sitemap} onValueChange={(value) => setSitemap(value as NonNullable<MapRequest['sitemap']>)}>
          <SelectTrigger id="map-sitemap">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SITEMAP_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="map-subdomains"
          checked={includeSubdomains}
          onCheckedChange={(checked) => setIncludeSubdomains(checked === true)}
        />
        <Label htmlFor="map-subdomains" className="text-sm font-normal">
          Include subdomains
        </Label>
      </div>

      <FormFooter
        loading={loading}
        disabled={url.trim().length === 0}
        onGetCode={() => onGetCode(buildRequest() as unknown as Record<string, unknown>)}
      />
    </form>
  );
}
