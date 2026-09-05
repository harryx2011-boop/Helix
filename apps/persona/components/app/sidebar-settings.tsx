'use client';

import { Moon, Sun } from 'lucide-react';
import { useSettings } from '@/lib/store';

/** The only setting left is the theme, so it lives as one control in the sidebar footer. */
export function ThemeToggle() {
  const { settings, update } = useSettings();
  const dark = settings.theme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => update({ theme: dark ? 'light' : 'dark' })}
      className="flex h-7 w-7 items-center justify-center rounded-card text-p-ink-3 transition-colors duration-150 ease-out hover:bg-p-code hover:text-p-ink"
    >
      {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
