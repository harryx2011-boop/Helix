import { FeaturePage, featureMetadata } from '@/components/marketing/pages/feature-page';

export const metadata = featureMetadata('search');

export default function SearchPage() {
  return <FeaturePage id="search" />;
}
