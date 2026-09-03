'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, PenSquare, Download, Copy, CopyPlus, Link2, Star, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useFavorites, useForks } from '@/lib/store';
import type { Role } from '@/lib/catalog';
import type { PersonaClient } from './types';
import { copyPrompt, downloadMarkdown, forkPersona, shareRoleLink } from './actions';
import { cn } from '@/lib/utils';

/** Grid cards pass a summary-derived persona with no body (kept out of the client bundle); fetch it on demand. */
async function resolveBody(role: Role, persona: PersonaClient): Promise<string | null> {
  if (persona.bodyMd) return persona.bodyMd;
  try {
    const res = await fetch(`/api/catalog?role=${role.slug}&persona=${persona.slug}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { bodyMd: string };
    return data.bodyMd;
  } catch {
    return null;
  }
}

export function CardMenu({
  role,
  persona,
  className,
}: {
  role: Role;
  persona: PersonaClient;
  className?: string;
}) {
  const router = useRouter();
  const { upsert } = useForks();
  const { has, toggle } = useFavorites();
  const [pending, setPending] = React.useState<'copy' | 'download' | 'fork' | null>(null);
  const favId = `${role.slug}/${persona.slug}`;
  const isFavorite = has(favId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="More actions"
          className={cn('h-8 w-8 rounded-card text-p-ink-3 hover:bg-p-code hover:text-p-ink', className)}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} className="rounded-card">
        <DropdownMenuItem onSelect={() => router.push(`/editor/new?role=${role.slug}&persona=${persona.slug}`)}>
          <PenSquare className="h-3.5 w-3.5" />
          Open in editor
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={pending === 'download'}
          onSelect={async (e) => {
            e.preventDefault();
            setPending('download');
            const bodyMd = await resolveBody(role, persona);
            setPending(null);
            if (bodyMd === null) toast.error('Could not load the prompt');
            else downloadMarkdown({ ...persona, bodyMd });
          }}
        >
          {pending === 'download' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={pending === 'copy'}
          onSelect={async (e) => {
            e.preventDefault();
            setPending('copy');
            const bodyMd = await resolveBody(role, persona);
            setPending(null);
            if (bodyMd === null) toast.error('Could not load the prompt');
            else copyPrompt(bodyMd);
          }}
        >
          {pending === 'copy' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
          Copy prompt
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={pending === 'fork'}
          onSelect={async (e) => {
            e.preventDefault();
            setPending('fork');
            const bodyMd = await resolveBody(role, persona);
            setPending(null);
            if (bodyMd === null) {
              toast.error('Could not load the prompt');
              return;
            }
            const fork = forkPersona(role, { ...persona, bodyMd });
            upsert(fork);
            router.push(`/editor/${fork.id}`);
          }}
        >
          {pending === 'fork' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CopyPlus className="h-3.5 w-3.5" />}
          Duplicate / fork
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => shareRoleLink(role.slug, persona.slug)}>
          <Link2 className="h-3.5 w-3.5" />
          Share link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => toggle(favId)}>
          <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-current text-blue')} />
          {isFavorite ? 'Remove favourite' : 'Favourite'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
