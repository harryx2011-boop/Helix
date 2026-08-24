'use client';

import * as React from 'react';
import { Upload } from 'lucide-react';
import type { ParseRequest } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { FormFooter } from './form-footer';

const OCR_OPTIONS: { value: NonNullable<ParseRequest['ocr']>; label: string }[] = [
  { value: 'auto', label: 'Auto (only when text layer is missing)' },
  { value: 'force', label: 'Force OCR' },
  { value: 'off', label: 'Off' },
];

interface ParseFormProps {
  onSubmit: (request: ParseRequest | FormData) => void;
  onGetCode: (body: Record<string, unknown>) => void;
  loading: boolean;
}

export function ParseForm({ onSubmit, onGetCode, loading }: ParseFormProps) {
  const [url, setUrl] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [ocr, setOcr] = React.useState<NonNullable<ParseRequest['ocr']>>('auto');
  const [includeJson, setIncludeJson] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const canSubmit = url.trim().length > 0 || file !== null;

  const buildJsonBody = React.useCallback((): ParseRequest => {
    const formats: ParseRequest['formats'] = includeJson ? ['markdown', 'json'] : ['markdown'];
    return { url: url.trim(), formats, ocr };
  }, [url, ocr, includeJson]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || loading) return;

    if (file) {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('ocr', ocr);
      formData.set('formats', includeJson ? 'markdown,json' : 'markdown');
      onSubmit(formData);
      return;
    }
    onSubmit(buildJsonBody());
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="parse-url">File URL</Label>
        <Input
          id="parse-url"
          type="url"
          placeholder="https://example.com/files/report.pdf"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            if (event.target.value) setFile(null);
          }}
          disabled={file !== null}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="parse-file">Upload a file</Label>
        <input
          ref={fileInputRef}
          id="parse-file"
          type="file"
          accept=".pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg"
          className="hidden"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            setFile(selected);
            if (selected) setUrl('');
          }}
        />
        <Button type="button" variant="outline" size="sm" className="w-fit gap-1.5" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />
          {file ? file.name : 'Choose file'}
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="parse-ocr">OCR</Label>
        <Select value={ocr} onValueChange={(value) => setOcr(value as NonNullable<ParseRequest['ocr']>)}>
          <SelectTrigger id="parse-ocr">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OCR_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="parse-json" checked={includeJson} onCheckedChange={(checked) => setIncludeJson(checked === true)} />
        <Label htmlFor="parse-json" className="text-sm font-normal">
          Also extract structured JSON
        </Label>
      </div>

      <FormFooter
        loading={loading}
        disabled={!canSubmit}
        onGetCode={() => onGetCode(buildJsonBody() as unknown as Record<string, unknown>)}
      />
    </form>
  );
}
