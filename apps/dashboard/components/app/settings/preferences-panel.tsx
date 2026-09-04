'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { FrameRow, FrameHeading } from '@/components/app/page-frame';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useTheme } from '@/components/shell/theme-provider';
import { ENDPOINTS } from '@/lib/catalog';
import { usePreferences, type Preferences } from '@/lib/preferences';
import type { Endpoint } from '@/lib/endpoints';
import type { Format } from '@/lib/api';

/** Mirrors FORMATS in apps/api/src/routes/scrape.ts; nothing the API will not accept. */
const FORMATS: readonly { id: Format; label: string }[] = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'html', label: 'HTML (cleaned)' },
  { id: 'rawHtml', label: 'HTML (raw)' },
  { id: 'text', label: 'Text' },
  { id: 'links', label: 'Links' },
  { id: 'screenshot', label: 'Screenshot' },
  { id: 'json', label: 'JSON' },
  { id: 'chunks', label: 'Chunks' },
];

const APPEARANCES: readonly { id: Preferences['appearance']; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'system', label: 'Match system' },
];

function PreferenceRow({
  label,
  description,
  control,
  last,
  htmlFor,
}: {
  label: string;
  description: string;
  control: React.ReactNode;
  last?: boolean;
  htmlFor?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-6 px-6 py-4 ${last ? '' : 'border-b border-border'}`}>
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
          {label}
        </label>
        <p className="mt-1 max-w-[60ch] text-[13px] leading-snug text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}

export function PreferencesPanel() {
  const { preferences, setPreference, hydrated } = usePreferences();
  const { setTheme } = useTheme();

  const changeAppearance = (next: Preferences['appearance']): void => {
    setPreference('appearance', next);
    // `system` resolves once here rather than subscribing: the /app surface is
    // pinned dark by its own layout, so this only takes effect on marketing
    // and self-host pages, and re-resolving on every OS change would fight a
    // deliberate choice made on this screen.
    const resolved =
      next === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : next;
    setTheme(resolved);
    toast.success(next === 'system' ? 'Appearance follows your system.' : `Appearance set to ${next}.`);
  };

  return (
    <>
      <FrameRow>
        <FrameHeading
          id="preferences"
          title="Preferences"
          description="Stored in this browser, so each machine you sign in from keeps its own answers."
        />
      </FrameRow>

      {!hydrated ? (
        <FrameRow flush className="flex flex-col gap-3 p-6">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </FrameRow>
      ) : (
        <FrameRow flush>
          <PreferenceRow
            label="Appearance"
            description="The dashboard is dark by design; this sets the marketing pages and a self-host install."
            control={
              <Select value={preferences.appearance} onValueChange={(v) => changeAppearance(v as Preferences['appearance'])}>
                <SelectTrigger className="h-9 w-44 text-[13px]" aria-label="Appearance">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPEARANCES.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="text-[13px]">
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />

          <PreferenceRow
            label="Default endpoint"
            description="Which playground tab opens when you go there without naming one."
            control={
              <Select
                value={preferences.defaultEndpoint}
                onValueChange={(v) => {
                  setPreference('defaultEndpoint', v as Endpoint);
                  toast.success(`Playground opens on ${v}.`);
                }}
              >
                <SelectTrigger className="h-9 w-44 text-[13px]" aria-label="Default endpoint">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENDPOINTS.filter((e) => e.status === 'live').map((e) => (
                    <SelectItem key={e.id} value={e.id} className="text-[13px]">
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />

          <PreferenceRow
            label="Default format"
            description="Preselected in the playground. Every request can still override it."
            control={
              <Select
                value={preferences.defaultFormat}
                onValueChange={(v) => {
                  setPreference('defaultFormat', v as Format);
                  toast.success(`Default format is ${v}.`);
                }}
              >
                <SelectTrigger className="h-9 w-44 text-[13px]" aria-label="Default format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map((f) => (
                    <SelectItem key={f.id} value={f.id} className="text-[13px]">
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />

          <PreferenceRow
            label="Reduce motion"
            description="Stills the character fields and transitions. Your system setting already does this; turn it on to reduce motion here regardless."
            htmlFor="pref-reduce-motion"
            control={
              <Switch
                id="pref-reduce-motion"
                checked={preferences.reduceMotion}
                onCheckedChange={(v) => setPreference('reduceMotion', v)}
                aria-label="Reduce motion"
              />
            }
          />

          <PreferenceRow
            label="Start with the sidebar collapsed"
            description="Applies on the next load; collapsing it by hand still wins for this session."
            htmlFor="pref-sidebar"
            last
            control={
              <Switch
                id="pref-sidebar"
                checked={preferences.sidebarStartsCollapsed}
                onCheckedChange={(v) => setPreference('sidebarStartsCollapsed', v)}
                aria-label="Start with the sidebar collapsed"
              />
            }
          />
        </FrameRow>
      )}
    </>
  );
}
