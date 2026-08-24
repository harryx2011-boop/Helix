import type { Metadata } from 'next';
import { FileText, Globe2, ScanText, Code2, ShieldCheck, Smartphone } from 'lucide-react';
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
        { icon: FileText, title: 'Eight formats, one call', body: 'Markdown, sanitised HTML, raw HTML, text, links, a screenshot, schema-shaped JSON and citation-ready chunks. Ask for several; each comes back under its own key.' },
        { icon: Globe2, title: 'Cheapest tier first', body: 'Plain fetch, then TLS identity, then a lightweight browser, then Chromium. Helix escalates on evidence, never on a framework guess.' },
        { icon: ScanText, title: 'JSON with your own model', body: 'Send a JSON Schema in jsonOptions and pick the provider and model per request. Keys stay on your instance; the response reports the tokens spent.' },
        { icon: Code2, title: 'Act before you read', body: 'Click, type, scroll, wait and run JavaScript, then extract. Actions force the Chromium tier automatically.' },
        { icon: Smartphone, title: 'Mobile and proxied', body: 'mobile: true renders the phone layout in a 390-wide viewport. proxy takes auto, stealth, none or your own proxy for that one request.' },
        { icon: ShieldCheck, title: 'A block is a typed failure', body: 'A challenge page returning 200 comes back as a FetchFailure with the signals that fired, never as markdown.' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
