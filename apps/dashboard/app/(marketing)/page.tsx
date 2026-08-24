import { Hero } from '@/components/marketing/hero';
import { Capabilities } from '@/components/marketing/capabilities';
import { ObjectionA } from '@/components/marketing/objection-a';
import { SelfHostPromise } from '@/components/marketing/self-host-promise';
import { ObjectionB } from '@/components/marketing/objection-b';
import { UseCases } from '@/components/marketing/use-cases';

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Capabilities />
      <ObjectionA />
      <SelfHostPromise />
      <ObjectionB />
      <UseCases />
    </>
  );
}
