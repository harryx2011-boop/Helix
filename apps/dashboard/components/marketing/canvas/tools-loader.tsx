'use client';

import * as React from 'react';
import { CanvasToolsExplorer, type CanvasTool } from './tools-explorer';

/**
 * Fetches the tool catalog at runtime instead of importing it.
 *
 * `public/canvas/tools.json` is ~89KB. Importing it into the explorer would ship
 * all of it in the client bundle for a page most visitors reach from the nav and
 * scroll rather than search; fetching keeps it out of the initial payload and
 * lets it be cached separately from the app.
 *
 * The explorer reads `useSearchParams`, which suspends during prerender, so it
 * is wrapped here — under `output: export` an unwrapped call fails the build
 * rather than degrading.
 */
export function CanvasToolsLoader() {
  return (
    <React.Suspense fallback={<ToolsSkeleton />}>
      <Loader />
    </React.Suspense>
  );
}

function Loader() {
  const [tools, setTools] = React.useState<CanvasTool[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    fetch('/canvas/tools.json')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<CanvasTool[]>;
      })
      .then((data) => {
        if (live) setTools(data);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  if (failed) {
    return (
      <div className="rounded-panel border border-m-border-faint py-16 text-center">
        <p className="text-[14px] text-m-ink/72">The tool catalog could not be loaded.</p>
        <p className="mt-1 text-[13px] text-m-ink/48">
          Run <code className="font-mono text-m-ink/72">canvaslms-api --list-tools</code> to see it from the server.
        </p>
      </div>
    );
  }

  if (!tools) return <ToolsSkeleton />;
  return <CanvasToolsExplorer tools={tools} />;
}

/** Matches the explorer's real rhythm so the swap does not jump the page. */
function ToolsSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="h-9 w-full max-w-sm rounded-card bg-m-ink/[0.059]" />
      <div className="mt-4 flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 w-28 rounded-card bg-m-ink/[0.039]" />
        ))}
      </div>
      <div className="mt-10 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-card bg-m-ink/[0.028]" />
        ))}
      </div>
    </div>
  );
}
