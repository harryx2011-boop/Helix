'use client';

import * as React from 'react';
import type { ExtractProvider, Extractor, Format, ScrapeRequest, Tier } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { FormFooter } from './form-footer';

/** Every format the route serves (routes/scrape.ts FORMATS); nothing listed here is unshipped. */
const FORMAT_OPTIONS: { value: Format; label: string }[] = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML (sanitised)' },
  { value: 'rawHtml', label: 'Raw HTML' },
  { value: 'text', label: 'Text' },
  { value: 'links', label: 'Links' },
  { value: 'screenshot', label: 'Screenshot' },
  { value: 'json', label: 'JSON (schema extraction)' },
  { value: 'chunks', label: 'Chunks' },
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

type ProxyMode = 'auto' | 'stealth' | 'none';

const PROXY_OPTIONS: { value: ProxyMode; label: string }[] = [
  { value: 'auto', label: 'Auto (instance proxy if configured)' },
  { value: 'stealth', label: 'Stealth (instance proxy required)' },
  { value: 'none', label: 'None (direct)' },
];

const PROVIDER_OPTIONS: { value: ExtractProvider | 'default'; label: string }[] = [
  { value: 'default', label: 'Instance default' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'google', label: 'Google' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'vllm', label: 'vLLM' },
  { value: 'openai-compatible', label: 'OpenAI-compatible' },
];

const DEFAULT_SCHEMA = `{
  "type": "object",
  "properties": {
    "title": { "type": "string" }
  }
}`;

interface ScrapeFormProps {
  url: string;
  onSubmit: (request: ScrapeRequest) => void;
  onGetCode: (body: Record<string, unknown>) => void;
  loading: boolean;
}

function parseSchema(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function ScrapeForm({ url, onSubmit, onGetCode, loading }: ScrapeFormProps) {
  const [formats, setFormats] = React.useState<Set<Format>>(new Set(['markdown']));
  const [tier, setTier] = React.useState<Tier>('auto');
  const [extractor, setExtractor] = React.useState<Extractor>('trafilatura');
  const [onlyMainContent, setOnlyMainContent] = React.useState(true);
  const [mobile, setMobile] = React.useState(false);
  const [proxy, setProxy] = React.useState<ProxyMode>('auto');
  const [schemaText, setSchemaText] = React.useState(DEFAULT_SCHEMA);
  const [prompt, setPrompt] = React.useState('');
  const [provider, setProvider] = React.useState<ExtractProvider | 'default'>('default');
  const [model, setModel] = React.useState('');

  const wantsJson = formats.has('json');
  const schema = React.useMemo(() => parseSchema(schemaText), [schemaText]);
  const schemaInvalid = wantsJson && schema === undefined;

  const toggleFormat = (format: Format, checked: boolean) => {
    setFormats((prev) => {
      const next = new Set(prev);
      if (checked) next.add(format);
      else next.delete(format);
      return next;
    });
  };

  const buildRequest = React.useCallback((): ScrapeRequest => {
    const selectedFormats = Array.from(formats);
    const request: ScrapeRequest = {
      url: url.trim(),
      formats: selectedFormats.length > 0 ? selectedFormats : ['markdown'],
      tier,
      extractor,
      onlyMainContent,
    };
    if (mobile) request.mobile = true;
    if (proxy !== 'auto') request.proxy = proxy;
    if (wantsJson) {
      request.jsonOptions = {
        ...(schema ? { schema } : {}),
        ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
        ...(provider !== 'default' ? { provider } : {}),
        ...(model.trim() ? { model: model.trim() } : {}),
      };
    }
    return request;
  }, [url, formats, tier, extractor, onlyMainContent, mobile, proxy, wantsJson, schema, prompt, provider, model]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (url.trim().length === 0 || loading || schemaInvalid) return;
    onSubmit(buildRequest());
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <div className="flex flex-col gap-2">
        <Label>Formats</Label>
        <div className="grid grid-cols-2 gap-2">
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

      {wantsJson && (
        <div className="flex flex-col gap-4 rounded-card border border-border p-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scrape-schema">JSON Schema</Label>
            <textarea
              id="scrape-schema"
              value={schemaText}
              onChange={(event) => setSchemaText(event.target.value)}
              rows={7}
              spellCheck={false}
              aria-invalid={schemaInvalid}
              className={cn(
                'w-full rounded-card border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                schemaInvalid && 'border-destructive',
              )}
            />
            <span className="text-xs text-muted-foreground">
              {schemaInvalid ? 'Not valid JSON. The json format needs a schema to fill.' : 'Length keywords (minItems, maxItems) are rejected; describe expectations in field descriptions.'}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scrape-prompt">Prompt (optional)</Label>
            <Input
              id="scrape-prompt"
              placeholder="Extract every pricing plan on the page"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scrape-provider">Provider</Label>
              <Select value={provider} onValueChange={(value) => setProvider(value as ExtractProvider | 'default')}>
                <SelectTrigger id="scrape-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scrape-model">Model</Label>
              <Input
                id="scrape-model"
                placeholder="instance default"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
            </div>
          </div>
          <span className="text-xs text-muted-foreground">Keys stay on the instance. A provider you pick here must already be configured there.</span>
        </div>
      )}

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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="proxy-select">Proxy</Label>
        <Select value={proxy} onValueChange={(value) => setProxy(value as ProxyMode)}>
          <SelectTrigger id="proxy-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROXY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
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
        <div className="flex items-center gap-2">
          <Checkbox id="mobile" checked={mobile} onCheckedChange={(checked) => setMobile(checked === true)} />
          <Label htmlFor="mobile" className="text-sm font-normal">
            Mobile viewport (forces Chromium)
          </Label>
        </div>
      </div>

      <FormFooter
        loading={loading}
        disabled={url.trim().length === 0 || schemaInvalid}
        onGetCode={() => onGetCode(buildRequest() as unknown as Record<string, unknown>)}
      />
    </form>
  );
}
