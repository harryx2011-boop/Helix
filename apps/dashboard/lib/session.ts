import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ensureProfile, getProfileByClerkId } from './profiles';
import type { ProfileRow } from './supabase/types';
import { supabaseConfigured } from './supabase/server';

/**
 * Server-side session for hosted mode. Resolves the Clerk user to a profile,
 * creating it on first sight so a missed webhook never strands a user.
 */
export async function requireProfile(): Promise<ProfileRow> {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  if (!supabaseConfigured()) {
    return {
      id: 'local', clerk_user_id: userId, email: '', name: null, avatar_url: null, role: null, use_cases: [],
      llm_provider: null, deploy_intent: null, selected_endpoints: [], onboarding_completed_at: new Date().toISOString(),
      monthly_budget_usd: null, created_at: '', updated_at: '',
    };
  }
  const existing = await getProfileByClerkId(userId);
  if (existing) return existing;
  const user = await currentUser();
  return ensureProfile({
    clerkUserId: userId,
    email: user?.primaryEmailAddress?.emailAddress ?? '',
    name: user?.fullName ?? null,
    avatarUrl: user?.imageUrl ?? null,
  });
}

/** Like requireProfile, but sends users who have not finished onboarding there first. */
export async function requireOnboardedProfile(): Promise<ProfileRow> {
  const profile = await requireProfile();
  if (!profile.onboarding_completed_at) redirect('/onboarding');
  return profile;
}
