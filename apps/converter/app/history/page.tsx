'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, X } from 'lucide-react';
import { PillButton, pillButtonClass } from '@/components/ui/pill-button';
import { removeStoredJob, useStoredJobs } from '@/lib/jobs/store';
import { withKey } from '@/lib/auth';
import { API_BASE, formatBytes, label } from '@/lib/formats';

function relative(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins <= 0) return 'under a minute';
  if (mins < 60) return `${mins} min`;
  return `${Math.round(mins / 60)} h`;
}

/** Jobs run from this browser. Only ids and sizes are stored, never files. */
export default function HistoryPage() {
  const jobs = useStoredJobs();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    document.title = 'History · Converter API';
    setMounted(true);
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(tick);
  }, []);

  const clear = () => {
    for (const j of jobs) removeStoredJob(j.id);
  };

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-h1 font-semibold tracking-[-0.02em] text-p-ink sm:text-h1lg">History</h1>
            <p className="mt-2 max-w-[56ch] text-body text-p-ink-2">
              Jobs from this browser. Each download works for one hour after the job finishes;
              after that the file is deleted from the server and the row goes with it.
            </p>
          </div>
          {mounted && jobs.length > 0 && (
            <PillButton variant="secondary" size="md" onClick={clear}>
              Clear history
            </PillButton>
          )}
        </div>

        <div className="mt-8" aria-live="polite">
          {!mounted && (
            <ul className="space-y-3" aria-label="Loading history">
              {[0, 1, 2].map((i) => (
                <li key={i} className="shimmer h-16 rounded-card" />
              ))}
            </ul>
          )}

          {mounted && jobs.length === 0 && (
            <div className="rounded-panel border border-dashed border-p-line-2 px-6 py-12 text-center">
              <p className="text-body font-medium text-p-ink">No jobs yet</p>
              <p className="mt-1 text-note text-p-ink-3">They appear here as soon as one starts.</p>
              <Link
                href="/convert"
                className={pillButtonClass({ variant: 'ink', size: 'md', className: 'mt-5' })}
              >
                Open the converter
              </Link>
            </div>
          )}

          {mounted && jobs.length > 0 && (
            <ul className="space-y-3">
              {jobs.map((j, i) => {
                const live = j.status === 'done' && j.url;
                // Followed as a plain link, so it needs the key like any other
                // download URL; the stored value is relative to the API.
                const href = j.url ? withKey(j.url.startsWith('http') ? j.url : `${API_BASE}${j.url}`) : '';
                return (
                  <li
                    key={j.id}
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                    className="flex animate-fade-up items-center justify-between gap-4 rounded-card border border-p-line bg-p-surface py-3 pl-4 pr-2"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-p-ink">
                        <span className="font-mono">
                          {label(j.from)} → {label(j.to)}
                        </span>
                        <span
                          className={`rounded-pill px-2 py-0.5 text-micro font-medium ${
                            j.status === 'error'
                              ? 'bg-p-code text-destructive'
                              : j.status === 'done'
                                ? 'bg-blue-soft text-blue'
                                : 'bg-p-code text-p-ink-2'
                          }`}
                        >
                          {j.status}
                        </span>
                      </p>
                      <p className="mt-0.5 font-mono text-caption text-p-ink-3">
                        {j.id}
                        {j.size != null && ` · ${formatBytes(j.size)}`}
                        {j.status === 'done' && ` · deleted in ${relative(j.expiresAt - now)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {live && (
                        <a
                          href={href}
                          className={pillButtonClass({ variant: 'ink', size: 'md', className: 'gap-1.5' })}
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          Download
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => removeStoredJob(j.id)}
                        aria-label={`Remove ${j.id} from history`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-pill text-p-ink-3 transition-colors duration-150 ease-out hover:bg-p-code hover:text-p-ink"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
