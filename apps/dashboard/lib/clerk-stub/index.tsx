'use client';

import * as React from 'react';

/**
 * Self-host stub for @clerk/nextjs.
 *
 * next.config aliases the package here when building the static export. Clerk
 * ships Server Actions, which `output: export` refuses outright, so the
 * self-host build must not import the real package at all — a runtime `HOSTED`
 * branch still bundles it.
 *
 * Every export below is unreachable in self-host: the surfaces that use them
 * (`/sign-in`, `/sign-up`, the user chip, account settings) are hosted-only.
 */

const noAccounts = (): never => {
  throw new Error('Clerk is not available in the self-host build.');
};

export function ClerkProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function SignIn(): React.ReactElement | null {
  return null;
}

export function SignUp(): React.ReactElement | null {
  return null;
}

export function UserProfile(): React.ReactElement | null {
  return null;
}

export function UserButton(): React.ReactElement | null {
  return null;
}

export function useUser() {
  return { isLoaded: true, isSignedIn: false, user: null } as const;
}

export function useClerk() {
  return { signOut: noAccounts, openUserProfile: noAccounts } as const;
}
