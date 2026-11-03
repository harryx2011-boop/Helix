'use client';

import * as React from 'react';
import { Toaster } from 'sonner';
import { ThemeProvider } from './theme-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {children}
      <Toaster position="bottom-right" toastOptions={{ className: 'font-sans text-sm' }} />
    </ThemeProvider>
  );
}
