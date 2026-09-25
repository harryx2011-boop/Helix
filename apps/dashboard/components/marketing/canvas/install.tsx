'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Segmented } from '@/components/shared/segmented';
import { CodePanel, CodeBlock } from '@/components/shared/code-panel';
import {
  CANVAS_CLIENTS,
  CANVAS_ENV,
  INSTALL_STEPS,
  OS_LABEL,
  type CanvasOS,
} from '@/lib/canvas';

const OS_ITEMS = (Object.keys(OS_LABEL) as CanvasOS[]).map((id) => ({ id, label: OS_LABEL[id] }));
const CLIENT_ITEMS = CANVAS_CLIENTS.map((c) => ({ id: c.id, label: c.label }));

/**
 * The two-step install: pick an OS to get the server running, then pick a client
 * to point at it. Two independent selections rather than one matrix, because the
 * OS half is the same whatever client you use.
 *
 * Deliberately not URL-synced — `output: export` serves this page statically and
 * a hash here would collide with the `#install` anchor the nav chip targets.
 */
export function CanvasInstall({ className }: { className?: string }) {
  const [os, setOs] = React.useState<CanvasOS>('windows');
  const [client, setClient] = React.useState<string>(CANVAS_CLIENTS[0]!.id);
  const active = CANVAS_CLIENTS.find((c) => c.id === client) ?? CANVAS_CLIENTS[0]!;

  return (
    <div className={cn('space-y-8', className)}>
      <div>
        <p className="font-mono text-[12px] uppercase tracking-wide text-m-ink/48">Run the server</p>
        <Segmented items={OS_ITEMS} value={os} onChange={setOs} aria-label="Operating system" className="mt-3" />
        <div className="mt-4 space-y-3">
          {INSTALL_STEPS[os].map((step) => (
            <CodePanel key={step.title} chrome="terminal" label={step.title} copyText={step.code}>
              <CodeBlock dark>{step.code}</CodeBlock>
            </CodePanel>
          ))}
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-m-ink/56">
          Set <code className="font-mono text-m-ink/72">CANVAS_URL</code> and{' '}
          <code className="font-mono text-m-ink/72">CANVAS_TOKEN</code> in{' '}
          <code className="font-mono text-m-ink/72">.env</code> before the verify step. Prefer plain pip? A standard{' '}
          <code className="font-mono text-m-ink/72">venv</code> plus{' '}
          <code className="font-mono text-m-ink/72">pip install -e .</code> works identically.
        </p>
      </div>

      <div>
        <p className="font-mono text-[12px] uppercase tracking-wide text-m-ink/48">Point a client at it</p>
        <Segmented items={CLIENT_ITEMS} value={client} onChange={setClient} aria-label="MCP client" className="mt-3" />
        <div className="mt-4 space-y-3">
          {active.steps.map((step) => (
            <CodePanel key={step.title} chrome="terminal" label={step.title} copyText={step.code}>
              <CodeBlock dark>{step.code}</CodeBlock>
            </CodePanel>
          ))}
        </div>
        {active.note && <p className="mt-3 text-[13px] leading-relaxed text-m-ink/56">{active.note}</p>}
        <p className="mt-2 text-[13px] leading-relaxed text-m-ink/56">
          No client config carries your token — the server reads{' '}
          <code className="font-mono text-m-ink/72">.env</code> from its own folder.
        </p>
      </div>

      <div>
        <p className="font-mono text-[12px] uppercase tracking-wide text-m-ink/48">Configuration</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-m-border-faint">
                <th className="py-2 pr-4 font-mono text-[11px] uppercase tracking-wide text-m-ink/48">Variable</th>
                <th className="py-2 pr-4 font-mono text-[11px] uppercase tracking-wide text-m-ink/48">Default</th>
                <th className="py-2 font-mono text-[11px] uppercase tracking-wide text-m-ink/48">Notes</th>
              </tr>
            </thead>
            <tbody>
              {CANVAS_ENV.map((row) => (
                <tr key={row.key} className="border-b border-m-border-faint/60 last:border-0">
                  <td className="py-2.5 pr-4 align-top">
                    <span className="font-mono text-[13px] text-m-ink">{row.key}</span>
                    {row.required && (
                      <span className="ml-2 rounded-pill bg-violet-12 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-violet">
                        required
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 align-top font-mono text-[13px] text-m-ink/56">{row.fallback}</td>
                  <td className="py-2.5 align-top text-[13px] leading-snug text-m-ink/56">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
