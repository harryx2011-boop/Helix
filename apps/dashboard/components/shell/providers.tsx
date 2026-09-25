'use client';

import * as React from 'react';
import { Toaster } from 'sonner';
import { ThemeProvider } from './theme-provider';

/** Root providers. There are no accounts: the app gates itself with the instance's own API key. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {children}
      <Toaster position="bottom-right" toastOptions={{ className: 'font-sans text-sm' }} />
    </ThemeProvider>
  );
}
