'use client';

import * as React from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from 'sonner';
import { ThemeProvider } from './theme-provider';

const HOSTED = process.env.NEXT_PUBLIC_HELIX_HOSTED === '1';

/**
 * Root providers. Clerk is mounted only in hosted mode; the self-host build
 * has no accounts and gates /app with a local API key instead (WEBSITE.md §1).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const tree = (
    <ThemeProvider>
      {children}
      <Toaster position="bottom-right" toastOptions={{ className: 'font-sans text-sm' }} />
    </ThemeProvider>
  );
  // The fallback redirects are set in code for the same reason the middleware
  // sets the sign-in paths: without NEXT_PUBLIC_CLERK_*_FALLBACK_REDIRECT_URL
  // a completed sign-in landed on the marketing page, which reads as nothing
  // having happened.
  return HOSTED ? (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/app"
      signUpFallbackRedirectUrl="/onboarding"
      afterSignOutUrl="/"
    >
      {tree}
    </ClerkProvider>
  ) : (
    tree
  );
}
