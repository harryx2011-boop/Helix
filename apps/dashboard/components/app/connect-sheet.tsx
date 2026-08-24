'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { MCP_URL } from '@/lib/mode';

const CLIENTS = ['Claude Code', 'Cursor', 'Codex', 'Windsurf', 'Generic'] as const;
type Client = (typeof CLIENTS)[number];

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

function ClientPanel({ client, apiKey }: { client: Client; apiKey: string }) {
  const mcpLines = [`claude mcp add --transport http helix ${MCP_URL}`, `claude mcp login helix`];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">MCP · {client}</span>
          <CopyButton text={mcpLines.join('\n')} label="MCP command" />
        </div>
        <CodeBlock lines={mcpLines} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">CLI</span>
          <CopyButton text={`npx -y @helix/cli@latest init --all -k ${apiKey}`} label="CLI command" />
        </div>
        <CodeBlock lines={[`npx -y @helix/cli@latest init --all -k ${apiKey}`]} />
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
          <DialogDescription>Connect an agent harness to Helix over MCP, or install with the CLI.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={CLIENTS[0]} className="w-full">
          <TabsList className="grid w-full grid-cols-5 rounded-pill">
            {CLIENTS.map((c) => (
              <TabsTrigger key={c} value={c} className="rounded-pill text-xs">
                {c}
              </TabsTrigger>
            ))}
          </TabsList>
          {CLIENTS.map((c) => (
            <TabsContent key={c} value={c} className="pt-3">
              <ClientPanel client={c} apiKey={apiKey} />
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
