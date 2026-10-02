import { Hero } from '@/components/marketing/hero';
import { WhatItDoes } from '@/components/marketing/what-it-does';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { StaysOnYourPc } from '@/components/marketing/stays-on-your-pc';
import { UseCases } from '@/components/marketing/use-cases';
import { ClosingCta } from '@/components/marketing/closing-cta';
import { ScrollStrip } from '@/components/marketing/scroll-strip';

export default function LandingPage() {
  return (
    <>
      <Hero />
      <WhatItDoes />
      <ScrollStrip seed={11} direction="right" />
      <HowItWorks />
      <ScrollStrip seed={3} direction="left" />
      <StaysOnYourPc />
      <ScrollStrip seed={13} direction="right" />
      <UseCases />
      <ScrollStrip seed={7} direction="left" />
      <ClosingCta />
    </>
  );
}
