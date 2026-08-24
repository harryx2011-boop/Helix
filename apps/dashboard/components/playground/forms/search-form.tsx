'use client';

import * as React from 'react';
import type { SearchFormat, SearchRequest } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormFooter } from './form-footer';

interface SearchFormProps {
  onSubmit: (request: SearchRequest) => void;
  onGetCode: (body: Record<string, unknown>) => void;
  loading: boolean;
}

/** Google `tbs` windows; the value `any` sends no filter. */
const TIME_WINDOWS: { value: string; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'qdr:d', label: 'Past day' },
  { value: 'qdr:w', label: 'Past week' },
  { value: 'qdr:m', label: 'Past month' },
  { value: 'qdr:y', label: 'Past year' },
];

const FORMAT_OPTIONS: SearchFormat[] = ['markdown', 'text', 'links', 'rawHtml', 'screenshot'];

export function SearchForm({ onSubmit, onGetCode, loading }: SearchFormProps) {
  const [query, setQuery] = React.useState('');
  const [limit, setLimit] = React.useState(5);
  const [lang, setLang] = React.useState('');
  const [country, setCountry] = React.useState('');
  const [tbs, setTbs] = React.useState('any');
  const [read, setRead] = React.useState(false);
  const [formats, setFormats] = React.useState<SearchFormat[]>(['markdown']);
  const [onlyMainContent, setOnlyMainContent] = React.useState(true);

  const buildRequest = React.useCallback((): SearchRequest => {
    const request: SearchRequest = { query: query.trim(), limit };
    if (lang.trim().length === 2) request.lang = lang.trim().toLowerCase();
    if (country.trim().length === 2) request.country = country.trim().toLowerCase();
    if (tbs !== 'any') request.tbs = tbs;
    if (read) request.scrapeOptions = { formats, onlyMainContent };
    return request;
  }, [query, limit, lang, country, tbs, read, formats, onlyMainContent]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim().length === 0 || loading) return;
    onSubmit(buildRequest());
  };

  const toggleFormat = (format: SearchFormat, checked: boolean) => {
    setFormats((current) => {
      const next = checked ? [...current, format] : current.filter((f) => f !== format);
      return next.length === 0 ? ['markdown'] : next;
    });
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

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="search-limit">Limit</Label>
          <Input
            id="search-limit"
            type="number"
            min={1}
            max={50}
            value={limit}
            onChange={(event) => setLimit(Math.max(1, Math.min(50, Number(event.target.value) || 1)))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="search-lang">Language</Label>
          <Input
            id="search-lang"
            type="text"
            placeholder="en"
            maxLength={2}
            value={lang}
            onChange={(event) => setLang(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="search-country">Country</Label>
          <Input
            id="search-country"
            type="text"
            placeholder="us"
            maxLength={2}
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="search-tbs">Time window</Label>
        <Select value={tbs} onValueChange={setTbs}>
          <SelectTrigger id="search-tbs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_WINDOWS.map((window) => (
              <SelectItem key={window.value} value={window.value}>
                {window.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="search-read" className="text-sm font-normal">
          Read every result
        </Label>
        <Switch id="search-read" checked={read} onCheckedChange={setRead} />
      </div>

      {read && (
        <div className="flex flex-col gap-3 rounded-card border border-border p-3">
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">scrapeOptions</span>
          <div className="grid grid-cols-2 gap-2">
            {FORMAT_OPTIONS.map((format) => (
              <div key={format} className="flex items-center gap-2">
                <Checkbox
                  id={`search-format-${format}`}
                  checked={formats.includes(format)}
                  onCheckedChange={(checked) => toggleFormat(format, checked === true)}
                />
                <Label htmlFor={`search-format-${format}`} className="font-mono text-xs font-normal">
                  {format}
                </Label>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="search-main" className="text-sm font-normal">
              Main content only
            </Label>
            <Switch id="search-main" checked={onlyMainContent} onCheckedChange={setOnlyMainContent} />
          </div>
        </div>
      )}

      <FormFooter
        loading={loading}
        disabled={query.trim().length === 0}
        onGetCode={() => onGetCode(buildRequest() as unknown as Record<string, unknown>)}
      />
    </form>
  );
}
