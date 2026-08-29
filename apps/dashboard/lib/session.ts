import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

/**
 * Server-side session for hosted mode.
 *
 * Clerk decides who you are and nothing else: Helix keeps no account data, so
 * there is no profile row to resolve. Everything the app shows comes from the
 * instance the browser talks to directly, with the key held in localStorage.
 */
export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  return userId;
}
