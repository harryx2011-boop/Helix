'use client';

import * as React from 'react';
import Link from 'next/link';
import { Moon, Sun, Trash2, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useForks, useSettings } from '@/lib/store';

export function SidebarSettings() {
  const { settings, update } = useSettings();
  const { forks, remove } = useForks();
  const [apiKey, setApiKey] = React.useState(settings.apiKey);

  React.useEffect(() => setApiKey(settings.apiKey), [settings.apiKey]);

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {settings.theme === 'dark' ? <Moon className="h-4 w-4 text-p-ink-3" /> : <Sun className="h-4 w-4 text-p-ink-3" />}
          <Label htmlFor="theme-toggle" className="text-[13px] font-medium text-p-ink">
            Dark mode
          </Label>
        </div>
        <Switch
          id="theme-toggle"
          checked={settings.theme === 'dark'}
          onCheckedChange={(checked) => update({ theme: checked ? 'dark' : 'light' })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="api-key" className="text-[13px] font-medium text-p-ink">
          API key
        </Label>
        <p className="text-[12px] leading-relaxed text-p-ink-3">Used by the wizard&apos;s model step. Stored on this device only.</p>
        <Input
          id="api-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onBlur={() => update({ apiKey })}
          placeholder="sk-..."
          className="mt-1 rounded-card border-p-line bg-p-bg font-mono text-[12.5px] focus-visible:ring-blue-ring"
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-p-ink-3">Saved forks</p>
        {forks.length === 0 ? (
          <p className="text-[12.5px] text-p-ink-3">No forks yet. Fork a persona from a role page to see it here.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {forks.map((fork) => (
              <li
                key={fork.id}
                className="group flex items-center gap-2 rounded-card px-2 py-1.5 transition-colors hover:bg-p-code"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-p-ink-3" />
                <Link href={`/editor/${fork.id}`} className="flex-1 truncate text-[13px] text-p-ink hover:text-blue">
                  {fork.title}
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${fork.title}`}
                  className="h-6 w-6 rounded-card text-p-ink-3 opacity-0 transition-opacity hover:bg-p-line hover:text-p-ink group-hover:opacity-100"
                  onClick={() => remove(fork.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
