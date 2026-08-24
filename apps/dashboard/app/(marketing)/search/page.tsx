import type { Metadata } from 'next';
import { Search, ListChecks, Server, Gauge, Filter, Globe } from 'lucide-react';
import { CapabilityPage } from '@/components/marketing/pages/capability-page';

export const metadata: Metadata = {
  title: 'Web Search API',
  description: 'One call returns ranked results with their content attached. SearXNG or your own SERP key.',
};

/* Request and response mirror the examples on POST /search in openapi.yaml. */
const REQUEST = `POST /v1/search
{
  "query": "transactional email APIs",
  "limit": 5,
  "lang": "en",
  "country": "us",
  "tbs": "qdr:m",
  "scrapeOptions": { "formats": ["markdown"], "onlyMainContent": true }
}`;

const RESPONSE = `{
  "success": true,
  "data": {
    "web": [
      {
        "url": "https://example.com/best-email-apis",
        "title": "13 Best Transactional Email APIs",
        "description": "A comparison of...",
        "position": 1,
        "markdown": "# 13 Best...\\n...",
        "metadata": { "statusCode": 200, "tier": "plain" }
      }
    ]
  },
  "warnings": [],
  "metadata": { "backend": "searxng", "fromCache": false }
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
    -H 'Authorization: Bearer helix-...' \\
    -d '{"query":"transactional email APIs","limit":5,"scrapeOptions":{"formats":["markdown"]}}'

{
  "success": true,
  "data": { "web": [ { "url": "...", "title": "...", "description": "...", "markdown": "..." }, ... ] },
  "warnings": [],
  "metadata": { "backend": "searxng", "fromCache": false }
}`,
      }}
      features={[
        { icon: Search, title: 'Search and read in one call', body: 'Set scrapeOptions and every result comes back with its page content attached. Leave it out for url, title and description only.' },
        { icon: Server, title: 'Bring your own backend', body: 'A self-hosted SearXNG instance needs no key. Serper and SerpAPI plug in with yours. HELIX_SEARCH_PROVIDER=auto picks whichever is configured.' },
        { icon: ListChecks, title: 'Partial success, not hard failure', body: 'A result page that cannot be read keeps its row with a typed failure and adds a line to warnings. The search still returns success: true.' },
        { icon: Filter, title: 'Language, country and time filters', body: 'lang, country and a tbs window (past day, week, month or year) narrow the search without a second request.' },
        { icon: Gauge, title: 'Bounded concurrency', body: 'Result pages are read in parallel up to an operator-set cap, so one search call cannot monopolize the fetch pool.' },
        { icon: Globe, title: 'Same read options as Scrape', body: 'scrapeOptions takes the formats, tier, extractor, selectors and timeout a direct Scrape call takes.' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
