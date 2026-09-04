import type { Metadata } from 'next';
import { Map as MapIcon, Filter, Link2, Gauge } from 'lucide-react';
import { CapabilityPage } from '@/components/marketing/pages/capability-page';

export const metadata: Metadata = {
  title: 'Site Map API',
  description: "List a site's URLs without reading them. Sitemap first, then the seed page's own links; filter by a term and cap the count.",
};

/* Request and response mirror POST /map in openapi.yaml. */
const REQUEST = `POST /v1/map
{
  "url": "https://example.com",
  "search": "pricing",
  "sitemap": "include",
  "ignoreQueryParameters": true,
  "limit": 5000
}`;

const RESPONSE = `{
  "success": true,
  "links": [
    {
      "url": "https://example.com/pricing",
      "source": "both",
      "lastModified": "2026-08-30T09:00:00Z"
    },
    {
      "url": "https://example.com/pricing/enterprise",
      "source": "sitemap",
      "lastModified": "2026-08-12T16:40:00Z"
    },
    {
      "url": "https://example.com/blog/pricing-update",
      "source": "links"
    }
  ],
  "truncated": false
}`;

export default function MapPage() {
  return (
    <CapabilityPage
      endpoint="map"
      h1={["List a site's URLs,", 'read none of them.']}
      subhead="Sitemap first, then the seed page's own links. Nothing else is fetched, which is what makes it cheap enough to run before every crawl."
      mock={{
        chrome: 'terminal',
        label: '$ helix map',
        code: `$ curl -X POST localhost:7400/v1/map \\
    -H 'Authorization: Bearer helix-...' \\
    -d '{"url":"https://example.com","search":"pricing"}'

{
  "success": true,
  "links": [
    { "url": "https://example.com/pricing",             "source": "both" },
    { "url": "https://example.com/pricing/enterprise",  "source": "sitemap" },
    { "url": "https://example.com/blog/pricing-update", "source": "links" }
  ],
  "truncated": false
}`,
      }}
      features={[
        { icon: MapIcon, eyebrow: 'Sitemap first', lead: 'Read the sitemap, then the seed page.', body: 'robots.txt names the sitemaps; the seed page’s own links fill the gaps a sitemap leaves. Set sitemap to only or skip to take one side.', evidence: 'discovered URLs by source · sample site', meters: [
          { label: 'sitemap', value: 61, accent: true },
          { label: 'links', value: 27 },
          { label: 'both', value: 12 },
        ] },
        { icon: Filter, eyebrow: 'Narrow up front', lead: 'A search term filters the list.', body: 'search keeps only URLs that contain the term. Nothing is fetched to decide.', evidence: '"search": "pricing"' },
        { icon: Link2, eyebrow: 'One URL, once', lead: 'Query strings collapse by default.', body: 'ignoreQueryParameters folds ?utm and ?page variants into one entry. A URL found in both the sitemap and the page says so.', evidence: '"source": "both"' },
        { icon: Gauge, eyebrow: 'Before you crawl', lead: 'Count pages before paying for them.', body: 'Map is what /crawl’s estimate runs on. Learn the size, then decide the limit.', evidence: 'discovered against limit · sample site', meterSize: 'thin', meters: [
          { label: 'discovered', value: 48, accent: true, display: '2,410' },
          { label: 'limit', value: 100, display: '5,000' },
          { label: 'truncated', value: 0, display: 'false' },
        ] },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
