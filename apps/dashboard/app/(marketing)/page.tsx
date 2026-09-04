import { Hero } from '@/components/marketing/hero';
import { Capabilities } from '@/components/marketing/capabilities';
import { HardParts } from '@/components/marketing/hard-parts';
import { Performance } from '@/components/marketing/performance';
import { SetupGuides } from '@/components/marketing/setup-guides';
import { SelfHostPromise } from '@/components/marketing/self-host-promise';
import { UseCases } from '@/components/marketing/use-cases';
import { ClosingCta } from '@/components/marketing/closing-cta';
import { ScrollStrip } from '@/components/marketing/scroll-strip';

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Capabilities />
      <HardParts />
      <ScrollStrip seed={3} direction="left" />
      <Performance />
      <SetupGuides />
      <ScrollStrip seed={5} direction="right" />
      <SelfHostPromise />
      <UseCases />
      <ScrollStrip seed={7} direction="left" />
      <ClosingCta />
    </>
  );
}
