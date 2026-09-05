'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpCircle, GitBranch } from 'lucide-react';
import type { Fork } from '@/lib/store';

type Source = { status: 'loading' } | { status: 'gone' } | { status: 'ready'; name: string; version: number };

/**
 * "Based on Support Agent v3, v4 available": every fork records the catalog
 * version it came from, and the catalog moves on. One fetch per fork id.
 */
export function VersionChip({ fork }: { fork: Pick<Fork, 'id' | 'roleSlug' | 'personaSlug' | 'sourceVersion'> }) {
  const [source, setSource] = React.useState<Source>({ status: 'loading' });

  React.useEffect(() => {
    const controller = new AbortController();
    setSource({ status: 'loading' });
    fetch(`/api/catalog?role=${encodeURIComponent(fork.roleSlug)}&persona=${encodeURIComponent(fork.personaSlug)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          setSource({ status: 'gone' });
          return;
        }
        const data = (await res.json()) as { name: string; version: number };
        setSource({ status: 'ready', name: data.name, version: data.version });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSource({ status: 'gone' });
      });
    return () => controller.abort();
  }, [fork.id, fork.roleSlug, fork.personaSlug]);

  if (source.status === 'loading') return null;

  const base = 'inline-flex h-6 items-center gap-1.5 rounded-pill px-2.5 font-mono text-[11px]';

  if (source.status === 'gone') {
    return (
      <span className={`${base} bg-p-code text-p-ink-3`}>
        <GitBranch className="h-3 w-3" />
        v{fork.sourceVersion} · source no longer in the library
      </span>
    );
  }

  const newer = source.version > fork.sourceVersion;
  const roleHref = `/roles/${fork.roleSlug}?persona=${fork.personaSlug}`;

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Link href={roleHref} className={`${base} bg-p-code text-p-ink-2 transition-colors duration-150 ease-out hover:text-p-ink`}>
        <GitBranch className="h-3 w-3" />
        Based on {source.name} v{fork.sourceVersion}
      </Link>
      {newer ? (
        <>
          <span className={`${base} bg-blue-soft text-blue`}>
            <ArrowUpCircle className="h-3 w-3" />
            v{source.version} available
          </span>
          <Link
            href={`/editor/new?role=${fork.roleSlug}&persona=${fork.personaSlug}`}
            className="text-[12px] font-medium text-blue transition-colors duration-150 ease-out hover:text-blue-hover"
          >
            Start a fork from v{source.version}
          </Link>
        </>
      ) : null}
    </span>
  );
}
