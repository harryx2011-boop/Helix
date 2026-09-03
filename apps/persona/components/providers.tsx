'use client';

import * as React from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from 'sonner';
import { useSettings, STORE_KEYS } from '@/lib/store';

/** Applies the stored theme to <html> and mounts the toaster. */
export function Providers({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();

  React.useEffect(() => {
    const hasStoredSettings = window.localStorage.getItem(STORE_KEYS.settings) !== null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = hasStoredSettings ? settings.theme === 'dark' : prefersDark;
    document.documentElement.classList.toggle('dark', isDark);
  }, [settings.theme]);

  return (
    <TooltipProvider delayDuration={200}>
      {children}
      <Toaster position="bottom-right" toastOptions={{ className: 'font-sans' }} theme={settings.theme} />
    </TooltipProvider>
  );
}
