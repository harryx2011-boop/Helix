import type { Metadata } from 'next';
import { Search, ListChecks, Server, Gauge, Filter, Globe } from 'lucide-react';
import { CapabilityPage } from '@/components/marketing/pages/capability-page';

export const metadata: Metadata = {
  title: 'Web Search API',
  description: 'One call returns ranked results with their content attached. SearXNG or your own SERP key.',
};

const REQUEST = `POST /v1/search
{
  "query": "transactional email APIs",
  "limit": 5,
  "scrapeOptions": { "formats": ["markdown"] }
}`;

const RESPONSE = `{
  "success": true,
  "data": {
    "web": [
      {
        "url": "https://example.com/best-email-apis",
        "title": "13 Best Transactional Email APIs",
        "description": "A comparison of...",
        "markdown": "# 13 Best...\\n..."
      }
    ]
  }
}`;

export default function SearchPage() {
  return (
    <CapabilityPage
      endpoint="search"
      h1={['Search the web,', 'read every result.']}
      subhead="One call returns ranked results with their content attached. SearXNG or your own SERP key."
      mock={{
        chrome: 'terminal',
        label: '$ helix search',
        code: `$ curl -X POST localhost:7400/v1/search \\
    -d '{"query":"transactional email APIs","limit":5}'

{ "success": true, "data": { "web": [ 5 results ] } }`,
      }}
      features={[
        { icon: Search, title: 'Search and read in one call', body: 'No separate scrape step. Every result comes back with its page content already attached.' },
        { icon: Server, title: 'Bring your own backend', body: 'A self-hostable SearXNG instance works with zero external keys. Serper and SerpAPI plug in the same way for hosted search.' },
        { icon: ListChecks, title: 'Partial success, not hard failure', body: 'If two of five result pages fail to scrape, the three that succeeded come back with a warnings array, not an error.' },
        { icon: Filter, title: 'Time and region filters', body: 'Narrow by language, country and a time window without a second request.' },
        { icon: Gauge, title: 'Bounded concurrency', body: 'Result pages are scraped in parallel up to a cap, so one search call cannot monopolize the fetch pool.' },
        { icon: Globe, title: 'Same read options as Scrape', body: '`scrapeOptions` accepts the same formats and settings as a direct Scrape call.' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
