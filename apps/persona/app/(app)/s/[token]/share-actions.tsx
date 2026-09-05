'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, CopyPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useForks, newForkId } from '@/lib/store';
import type { Share } from '@/lib/share';

/** Fork the snapshot into this browser's local forks, or copy the filled prompt. */
export function ShareActions({ share, filled }: { share: Share; filled: string }) {
  const router = useRouter();
  const { upsert } = useForks();
  const [forking, setForking] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  function fork() {
    setForking(true);
    const id = newForkId();
    const now = new Date().toISOString();
    upsert({
      id,
      roleSlug: share.roleSlug,
      personaSlug: share.personaSlug,
      sourceVersion: share.sourceVersion,
      title: share.title,
      bodyMd: share.bodyMd,
      values: share.values,
      createdAt: now,
      updatedAt: now,
    });
    router.push(`/editor/${id}`);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(filled);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" onClick={fork} disabled={forking} className="h-9 rounded-pill bg-p-ink px-4 text-sm text-p-bg hover:bg-p-ink/90">
        {forking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CopyPlus className="h-3.5 w-3.5" />}
        Fork this
      </Button>
      <Button type="button" variant="outline" onClick={copy} className="h-9 rounded-pill border-p-line px-4 text-sm text-p-ink hover:bg-p-code">
        {copied ? <Check className="h-3.5 w-3.5 text-blue" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy prompt'}
      </Button>
    </div>
  );
}
