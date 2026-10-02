import { FeaturePage, featureMetadata } from '@/components/marketing/pages/feature-page';

export const metadata = featureMetadata('agent');

export default function AgentPage() {
  return <FeaturePage id="agent" />;
}
