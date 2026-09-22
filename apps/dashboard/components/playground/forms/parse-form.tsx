'use client';

import * as React from 'react';
import { Upload } from 'lucide-react';
import type { ParseJsonOptions, ParseRequest } from '@/lib/api';
import { UPLOAD_ACCEPT } from '@/lib/uploads';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { FormFooter } from './form-footer';

const OCR_OPTIONS: { value: NonNullable<ParseRequest['ocr']>; label: string }[] = [
  { value: 'auto', label: 'Auto (only when the text layer is missing)' },
  { value: 'force', label: 'Force OCR' },
  { value: 'off', label: 'Off' },
];

const TABLE_OPTIONS: { value: NonNullable<ParseRequest['tables']>; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'high-fidelity', label: 'High fidelity (table-specialised parser)' },
];

interface ParseFormProps {
  url: string;
  /** Owned by the playground so the prompt box's paperclip and this form share one file. */
  file: File | null;
  onFileChange: (file: File | null) => void;
  onSubmit: (request: ParseRequest | FormData) => void;
  onGetCode: (body: Record<string, unknown>) => void;
  loading: boolean;
}

/** A JSON object becomes a schema; anything else is a prompt. */
function jsonOptionsFrom(instruction: string): ParseJsonOptions | undefined {
  const trimmed = instruction.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { schema: parsed as Record<string, unknown> };
      }
    } catch {
      // Not valid JSON: treat it as a prompt.
    }
  }
  return { prompt: trimmed };
}

export function ParseForm({ url, file, onFileChange, onSubmit, onGetCode, loading }: ParseFormProps) {
  const [ocr, setOcr] = React.useState<NonNullable<ParseRequest['ocr']>>('auto');
  const [tables, setTables] = React.useState<NonNullable<ParseRequest['tables']>>('auto');
  const [maxPages, setMaxPages] = React.useState('');
  const [includeJson, setIncludeJson] = React.useState(false);
  const [instruction, setInstruction] = React.useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // The prompt box can clear the file too; without this the native input
  // still holds it and picking the same file again fires no change event.
  React.useEffect(() => {
    if (file === null && fileInputRef.current) fileInputRef.current.value = '';
  }, [file]);

  const jsonOptions = includeJson ? jsonOptionsFrom(instruction) : undefined;
  const jsonReady = !includeJson || jsonOptions !== undefined;
  const canSubmit = (url.trim().length > 0 || file !== null) && jsonReady;

  const buildJsonBody = React.useCallback((): ParseRequest => {
    const body: ParseRequest = {
      url: url.trim(),
      formats: includeJson ? ['markdown', 'json'] : ['markdown'],
      ocr,
    };
    if (tables !== 'auto') body.tables = tables;
    const pages = Number.parseInt(maxPages, 10);
    if (Number.isFinite(pages) && pages > 0) body.maxPages = pages;
    if (jsonOptions) body.jsonOptions = jsonOptions;
    return body;
  }, [url, ocr, tables, maxPages, includeJson, jsonOptions]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || loading) return;

    if (file) {
      const body = buildJsonBody();
      const formData = new FormData();
      formData.set('file', file);
      formData.set('ocr', ocr);
      formData.set('formats', (body.formats ?? ['markdown']).join(','));
      if (body.tables) formData.set('tables', body.tables);
      if (body.maxPages) formData.set('maxPages', String(body.maxPages));
      if (body.jsonOptions) formData.set('jsonOptions', JSON.stringify(body.jsonOptions));
      onSubmit(formData);
      return;
    }
    onSubmit(buildJsonBody());
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <p className="text-xs text-muted-foreground">
        {file ? 'A file is selected below; it takes priority over the URL in the prompt box.' : 'Reads the URL from the prompt box above, or upload a file instead.'}
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="parse-file">Upload a file</Label>
        <input
          ref={fileInputRef}
          id="parse-file"
          type="file"
          accept={UPLOAD_ACCEPT.parse}
          className="hidden"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            onFileChange(selected);
            event.target.value = '';
          }}
        />
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="w-fit gap-1.5" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            {file ? file.name : 'Choose file'}
          </Button>
          {file && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onFileChange(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            >
              Clear
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">PDF, DOCX, PPTX, XLSX. Sent as a multipart request.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="parse-max-pages">Max pages</Label>
          <Input
            id="parse-max-pages"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="all"
            value={maxPages}
            onChange={(event) => setMaxPages(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="parse-tables">Tables</Label>
        <Select value={tables} onValueChange={(value) => setTables(value as NonNullable<ParseRequest['tables']>)}>
          <SelectTrigger id="parse-tables">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TABLE_OPTIONS.map((option) => (
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

      {includeJson && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="parse-instruction">Schema or prompt</Label>
          <textarea
            id="parse-instruction"
            rows={5}
            spellCheck={false}
            placeholder={'{"type":"object","properties":{"invoiceTotal":{"type":"number"}}}\nor: the invoice total and due date'}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            className="flex w-full rounded-card border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
          <p className="text-xs text-muted-foreground">
            A JSON object is sent as <code className="font-mono">jsonOptions.schema</code>; plain text as <code className="font-mono">jsonOptions.prompt</code>. Resolved by the model configured on the server.
          </p>
        </div>
      )}

      <FormFooter
        loading={loading}
        disabled={!canSubmit}
        onGetCode={() => onGetCode(buildJsonBody() as unknown as Record<string, unknown>)}
      />
    </form>
  );
}
