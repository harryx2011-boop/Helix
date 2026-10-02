import { FeaturePage, featureMetadata } from '@/components/marketing/pages/feature-page';

export const metadata = featureMetadata('scrape');

export default function ScrapePage() {
  return <FeaturePage id="scrape" />;
}
