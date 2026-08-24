'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { MCP_URL, SITE_URL } from '@/lib/mode';
import { CONNECT_CLIENTS, cliInitCommand, mcpSnippet, type ConnectClient } from '@/lib/connect';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  const onCopy = React.useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <Button variant="ghost" size="sm" onClick={onCopy} className="gap-1.5 font-mono text-xs" aria-label={`Copy ${label}`}>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

function CodeBlock({ lines }: { lines: string[] }) {
  return (
    <pre className="overflow-x-auto rounded-card border border-border bg-secondary/40 p-3 font-mono text-xs leading-relaxed text-foreground">
      {lines.join('\n')}
    </pre>
  );
}

function ClientPanel({ client, apiKey }: { client: ConnectClient; apiKey: string }) {
  const snippet = mcpSnippet(client, { apiKey, mcpUrl: MCP_URL });
  const cli = cliInitCommand({ apiKey, mcpUrl: MCP_URL, siteUrl: SITE_URL });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            MCP · {client} · {snippet.target}
          </span>
          <CopyButton text={snippet.lines.join('\n')} label={`${client} MCP config`} />
        </div>
        <CodeBlock lines={snippet.lines} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">CLI · writes the same, plus SKILL.md</span>
          <CopyButton text={cli} label="CLI command" />
        </div>
        <CodeBlock lines={[cli]} />
      </div>
    </div>
  );
}

export function ConnectSheet({ open, onOpenChange, apiKey }: { open: boolean; onOpenChange: (open: boolean) => void; apiKey: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Set up an agent</DialogTitle>
          <DialogDescription>Connect an agent harness to Helix over MCP, or let the CLI write the config for every harness it finds.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={CONNECT_CLIENTS[0]} className="w-full">
          <TabsList className="grid w-full grid-cols-5 rounded-pill">
            {CONNECT_CLIENTS.map((c) => (
              <TabsTrigger key={c} value={c} className="rounded-pill text-xs">
                {c}
              </TabsTrigger>
            ))}
          </TabsList>
          {CONNECT_CLIENTS.map((c) => (
            <TabsContent key={c} value={c} className="pt-3">
              <ClientPanel client={c} apiKey={apiKey} />
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
