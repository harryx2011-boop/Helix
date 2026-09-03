'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSettings } from '@/lib/store';

export function SidebarSettings() {
  const { settings, update } = useSettings();
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
    </div>
  );
}
