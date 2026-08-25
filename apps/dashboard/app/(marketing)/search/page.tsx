import type { Metadata } from 'next';
import { Search, ListChecks, Server, Filter } from 'lucide-react';
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
        { icon: Search, eyebrow: 'Search and read', lead: 'Results arrive with content.', body: 'Set scrapeOptions and every result carries its page markdown.', evidence: '"scrapeOptions": { "formats": ["markdown"] }' },
        { icon: Server, eyebrow: 'Bring your own backend', lead: 'No key required.', body: 'A self-hosted SearXNG instance works out of the box; Serper and SerpAPI plug in with yours.', evidence: 'HELIX_SEARCH_PROVIDER=auto' },
        { icon: ListChecks, eyebrow: 'Partial success', lead: 'One bad result won’t fail the call.', body: 'An unreadable page keeps its row with a typed failure in warnings.', evidence: '"success": true, "warnings": [...]' },
        { icon: Filter, eyebrow: 'Narrow without a second call', lead: 'Language, country and time filters.', body: 'lang, country and a tbs window scope the search up front.', evidence: '"tbs": "qdr:m"' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
