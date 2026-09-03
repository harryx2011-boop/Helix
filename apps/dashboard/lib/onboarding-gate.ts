import 'server-only';
import { supabaseConfigured } from '@/lib/supabase/server';
import { ensureProfileForCurrentUser } from '@/lib/profiles';

/**
 * Whether a signed-in user still owes us the wizard.
 *
 * Deliberately fails OPEN. Onboarding is a survey, not a permission check, so
 * every reason it cannot be answered — no Supabase on this deployment, a
 * profile that could not be read, the table missing because 0003 has not been
 * applied — lets the user into the app rather than bouncing them to a wizard
 * that would fail to save and strand them in a redirect loop. The cost of
 * failing open is an un-personalised sidebar; the cost of failing closed is a
 * dashboard nobody can reach.
 */
export interface OnboardingState {
  /** True only when we positively know the wizard is unanswered. */
  pending: boolean;
  /** Drives sidebar ordering; empty when unknown, which every consumer treats as "no preference". */
  selectedEndpoints: readonly string[];
}

export async function readOnboardingState(): Promise<OnboardingState> {
  if (!supabaseConfigured()) return { pending: false, selectedEndpoints: [] };

  try {
    const profile = await ensureProfileForCurrentUser();
    if (!profile) return { pending: false, selectedEndpoints: [] };
    return {
      pending: profile.onboarding_completed_at === null,
      selectedEndpoints: profile.selected_endpoints ?? [],
    };
  } catch {
    return { pending: false, selectedEndpoints: [] };
  }
}
