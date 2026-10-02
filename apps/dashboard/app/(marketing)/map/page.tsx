import { FeaturePage, featureMetadata } from '@/components/marketing/pages/feature-page';

export const metadata = featureMetadata('map');

export default function MapPage() {
  return <FeaturePage id="map" />;
}
