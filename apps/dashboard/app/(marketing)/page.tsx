import { Hero } from '@/components/marketing/hero';
import { Capabilities } from '@/components/marketing/capabilities';
import { SetupGuides } from '@/components/marketing/setup-guides';
import { SelfHostPromise } from '@/components/marketing/self-host-promise';
import { UseCases } from '@/components/marketing/use-cases';
import { ClosingCta } from '@/components/marketing/closing-cta';

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Capabilities />
      <SetupGuides />
      <SelfHostPromise />
      <UseCases />
      <ClosingCta />
    </>
  );
}
