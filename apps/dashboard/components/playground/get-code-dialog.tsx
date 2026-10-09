'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { generateCode, LANGS, type Lang } from '@/lib/codegen';
import { instanceMcpUrl, instanceUrl } from '@/lib/mode';
import type { Endpoint } from '@/lib/endpoints';

interface GetCodeDialogProps {
  endpoint: Endpoint;
  body: Record<string, unknown>;
  apiKey: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** For an endpoint with more than one operation, e.g. `/scrub` on Metadata. */
  pathSuffix?: string | undefined;
}

export function GetCodeDialog({ endpoint, body, apiKey, open, onOpenChange, pathSuffix }: GetCodeDialogProps) {
  const [lang, setLang] = React.useState<Lang>('curl');
  const [includeKey, setIncludeKey] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const code = React.useMemo(
    () =>
      generateCode(lang, {
        endpoint,
        body,
        baseUrl: instanceUrl(),
        mcpUrl: instanceMcpUrl(),
        ...(pathSuffix ? { pathSuffix } : {}),
        ...(includeKey && apiKey ? { apiKey } : {}),
      }),
    [lang, endpoint, body, includeKey, apiKey, pathSuffix],
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Get Code</DialogTitle>
        </DialogHeader>

        <Tabs value={lang} onValueChange={(value) => setLang(value as Lang)}>
          <TabsList>
            {LANGS.map((l) => (
              <TabsTrigger key={l.id} value={l.id} className="font-mono text-xs">
                {l.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative">
          <pre className="max-h-80 overflow-auto rounded-card bg-secondary p-3 font-mono text-xs leading-relaxed">{code}</pre>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute right-2 top-2 h-7 w-7"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {apiKey && (
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="include-key" className="text-sm font-normal text-muted-foreground">
              Include my key
            </Label>
            <Switch id="include-key" checked={includeKey} onCheckedChange={setIncludeKey} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
