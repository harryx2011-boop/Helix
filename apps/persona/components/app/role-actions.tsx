'use client';

import * as React from 'react';
import Link from 'next/link';
import { Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WizardLauncher } from '@/components/wizard/launcher';
import type { Role, Persona } from '@/lib/catalog';
import { CardMenu } from './card-menu';
import { copyPrompt } from './actions';

export function RoleActions({ role, persona }: { role: Role; persona: Persona }) {
  const [copying, setCopying] = React.useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <WizardLauncher persona={persona} role={role} />
      <Button
        asChild
        variant="outline"
        className="rounded-pill border-p-line text-p-ink hover:bg-p-code"
      >
        <Link href={`/editor/new?role=${role.slug}&persona=${persona.slug}`}>Open in editor</Link>
      </Button>
      <Button
        variant="ghost"
        disabled={copying}
        onClick={async () => {
          setCopying(true);
          copyPrompt(persona.bodyMd);
          setTimeout(() => setCopying(false), 600);
        }}
        className="gap-1.5 rounded-pill text-p-ink-2 hover:bg-p-code hover:text-p-ink"
      >
        {copying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
        Copy prompt
      </Button>
      <CardMenu role={role} persona={persona} />
    </div>
  );
}
