'use client';

import { Moon, Sun } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSettings } from '@/lib/store';

export function SidebarSettings() {
  const { settings, update } = useSettings();

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
    </div>
  );
}
