'use client';

import * as React from 'react';
import { Loader2, Play } from '@/components/icons/lucide';
import type { Extractor, Format, ScrapeRequest, Tier } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const FORMAT_OPTIONS: { value: Format; label: string }[] = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'rawHtml', label: 'Raw HTML' },
  { value: 'links', label: 'Links' },
  { value: 'screenshot', label: 'Screenshot' },
];

const TIER_OPTIONS: { value: Tier; label: string }[] = [
  { value: 'auto', label: 'Auto (escalate on evidence)' },
  { value: 'plain', label: 'Plain' },
  { value: 'tls', label: 'TLS impersonation' },
  { value: 'lightpanda', label: 'Lightpanda' },
  { value: 'chromium', label: 'Chromium' },
];

const EXTRACTOR_OPTIONS: { value: Extractor; label: string }[] = [
  { value: 'trafilatura', label: 'Trafilatura (precise)' },
  { value: 'readability', label: 'Readability (recovers more)' },
  { value: 'auto', label: 'Auto' },
];

interface ScrapeFormProps {
  onSubmit: (request: ScrapeRequest) => void;
  loading: boolean;
}

export function ScrapeForm({ onSubmit, loading }: ScrapeFormProps) {
  const [url, setUrl] = React.useState('');
  const [formats, setFormats] = React.useState<Set<Format>>(new Set(['markdown']));
  const [tier, setTier] = React.useState<Tier>('auto');
  const [extractor, setExtractor] = React.useState<Extractor>('trafilatura');
  const [onlyMainContent, setOnlyMainContent] = React.useState(true);

  const toggleFormat = (format: Format, checked: boolean) => {
    setFormats((prev) => {
      const next = new Set(prev);
      if (checked) next.add(format);
      else next.delete(format);
      return next;
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (url.trim().length === 0 || loading) return;

    const selectedFormats = Array.from(formats);
    onSubmit({
      url: url.trim(),
      formats: selectedFormats.length > 0 ? selectedFormats : ['markdown'],
      tier,
      extractor,
      onlyMainContent,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="scrape-url">URL</Label>
        <Input
          id="scrape-url"
          type="url"
          placeholder="https://example.com"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Formats</Label>
        <div className="flex flex-col gap-2">
          {FORMAT_OPTIONS.map((option) => (
            <div key={option.value} className="flex items-center gap-2">
              <Checkbox
                id={`format-${option.value}`}
                checked={formats.has(option.value)}
                onCheckedChange={(checked) => toggleFormat(option.value, checked === true)}
              />
              <Label htmlFor={`format-${option.value}`} className="text-sm font-normal">
                {option.label}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tier-select">Tier</Label>
        <Select value={tier} onValueChange={(value) => setTier(value as Tier)}>
          <SelectTrigger id="tier-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="extractor-select">Extractor</Label>
        <Select value={extractor} onValueChange={(value) => setExtractor(value as Extractor)}>
          <SelectTrigger id="extractor-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXTRACTOR_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="only-main-content"
          checked={onlyMainContent}
          onCheckedChange={(checked) => setOnlyMainContent(checked === true)}
        />
        <Label htmlFor="only-main-content" className="text-sm font-normal">
          Only main content
        </Label>
      </div>

      <Button type="submit" disabled={loading || url.trim().length === 0} className="mt-auto gap-2">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Running
          </>
        ) : (
          <>
            <Play className="h-4 w-4" />
            Run
          </>
        )}
      </Button>
    </form>
  );
}
