import type { Metadata } from 'next';
import { FileText, Globe2, Code2, ShieldCheck } from 'lucide-react';
import { CapabilityPage } from '@/components/marketing/pages/capability-page';

export const metadata: Metadata = {
  title: 'Web Scraping API',
  description: 'Turn any URL into clean markdown, JSON or a screenshot. Web pages and documents share one envelope.',
};

/** openapi.yaml `/scrape` → examples.structured, verbatim. */
const REQUEST = `POST /v1/scrape
{
  "url": "https://example.com/pricing",
  "formats": ["markdown", "json"],
  "jsonOptions": {
    "schema": {
      "type": "object",
      "properties": {
        "plans": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "monthlyPrice": { "type": "number" }
            }
          }
        }
      }
    },
    "prompt": "Extract every pricing plan on the page.",
    "provider": "anthropic",
    "model": "claude-sonnet-4-5"
  }
}`;

/** openapi.yaml `ScrapeResponse`: Document + warnings + ExtractionUsage. */
const RESPONSE = `{
  "success": true,
  "data": {
    "markdown": "# Pricing\\n...",
    "json": {
      "plans": [
        { "name": "Standard", "monthlyPrice": 29 },
        { "name": "Pro", "monthlyPrice": 79 }
      ]
    },
    "metadata": {
      "title": "Pricing",
      "sourceUrl": "https://example.com/pricing",
      "finalUrl": "https://example.com/pricing",
      "statusCode": 200,
      "tier": "plain",
      "tiersAttempted": ["plain"],
      "contentHash": "3f1a…",
      "fromCache": false
    }
  },
  "warnings": [],
  "usage": {
    "model": "claude-sonnet-4-5",
    "tokens": { "input": 1180, "output": 64 },
    "blocksKept": 6,
    "blocksTotal": 14,
    "providerCost": { "amount": null, "currency": "USD" }
  }
}`;

export default function ScrapePage() {
  return (
    <CapabilityPage
      endpoint="scrape"
      h1={['Any page,', 'one clean document.']}
      subhead="Markdown, JSON, screenshot or links from any URL. Web pages and documents share one envelope."
      mock={{
        chrome: 'browser',
        label: 'https://example.com/pricing',
        code: `# Pricing

_Simple, transparent pricing_

## Standard
$29/month, billed annually.

## Pro
$79/month. Includes priority support.`,
      }}
      features={[
        { icon: FileText, eyebrow: 'One call, many shapes', lead: 'Eight formats, one call.', body: 'Markdown, HTML, links, a screenshot and schema JSON, each under its own key.', evidence: '"formats": ["markdown", "json", "screenshot"]' },
        { icon: Globe2, eyebrow: 'Cheapest path first', lead: 'Escalates on evidence.', body: 'Plain fetch, then TLS identity, then a light browser, then Chromium.', evidence: '"tier": "plain", "tiersAttempted": ["plain"]' },
        { icon: Code2, eyebrow: 'Act, then read', lead: 'Actions run before extraction.', body: 'Click, type, scroll and wait, then the page is scraped.', evidence: '{ "type": "click", "selector": "#accept" }' },
        { icon: ShieldCheck, eyebrow: 'Honest about blocks', lead: 'A block is a typed failure.', body: 'A challenge page returning 200 never comes back as markdown.', evidence: '"error": "FetchFailure", "signals": [...]' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
