import { FeaturePage, featureMetadata } from '@/components/marketing/pages/feature-page';

export const metadata = featureMetadata('crawl');

export default function CrawlPage() {
  return <FeaturePage id="crawl" />;
}
