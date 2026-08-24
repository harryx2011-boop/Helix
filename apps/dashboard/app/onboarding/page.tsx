import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/session';
import { OnboardingWizard } from '@/components/onboarding/wizard';

export const metadata = { title: 'Get started' };

export default async function OnboardingPage() {
  const profile = await requireProfile();
  if (profile.onboarding_completed_at) redirect('/app');

  return (
    <OnboardingWizard
      initial={{
        role: profile.role,
        useCases: profile.use_cases,
        llmProvider: profile.llm_provider,
        deployIntent: profile.deploy_intent,
        selectedEndpoints: profile.selected_endpoints,
      }}
    />
  );
}
