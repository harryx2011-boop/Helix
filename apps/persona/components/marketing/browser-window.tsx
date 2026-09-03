import type { ReactNode } from 'react';

/** Shared flat browser-window chrome for the marketing mockups. */
export function BrowserWindow({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-panel border border-p-line bg-p-surface shadow-panel ring-1 ring-p-highlight">
      <div className="flex items-center gap-1.5 border-b border-p-line px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-p-line-2" />
        <span className="h-2.5 w-2.5 rounded-full bg-p-line-2" />
        <span className="h-2.5 w-2.5 rounded-full bg-p-line-2" />
        <span className="ml-3 truncate rounded-md bg-p-code px-2.5 py-1 font-mono text-[11px] text-p-ink-3">{url}</span>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
