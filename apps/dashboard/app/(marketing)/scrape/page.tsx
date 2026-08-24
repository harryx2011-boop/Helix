import type { Metadata } from 'next';
import { FileText, Globe2, ScanText, Code2, ShieldCheck, Layers } from 'lucide-react';
import { CapabilityPage } from '@/components/marketing/pages/capability-page';

export const metadata: Metadata = {
  title: 'Web Scraping API',
  description: 'Turn any URL into clean markdown, JSON or a screenshot. Web pages and documents share one envelope.',
};

const REQUEST = `POST /v1/scrape
{
  "url": "https://example.com/pricing",
  "formats": ["markdown", "json"],
  "extract": {
    "schema": {
      "type": "object",
      "properties": {
        "plans": { "type": "array" }
      }
    }
  }
}`;

const RESPONSE = `{
  "success": true,
  "data": {
    "markdown": "# Pricing\\n...",
    "json": { "plans": [...] },
    "metadata": {
      "title": "Pricing",
      "sourceUrl": "https://example.com/pricing",
      "statusCode": 200,
      "tier": "plain"
    }
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
        { icon: FileText, title: 'One envelope, every source', body: 'Web pages and PDFs, DOCX, PPTX and XLSX documents come back in the same shape. No separate parsing call.' },
        { icon: Globe2, title: 'Cheapest tier first', body: 'Plain fetch, then TLS identity, then a lightweight browser, then Chromium. Helix escalates on evidence, never on a framework guess.' },
        { icon: ScanText, title: 'Schema-based extraction', body: 'Pass a JSON schema or a prompt and get structured fields back, resolved by your own configured LLM provider.' },
        { icon: Code2, title: 'Act before you read', body: 'Click, type, scroll and wait, then extract. Actions force the Chromium tier automatically.' },
        { icon: ShieldCheck, title: 'A block is a typed failure', body: 'A challenge page returning 200 comes back as a FetchFailure with the signals that fired, never as markdown.' },
        { icon: Layers, title: 'Cache-aware', body: 'Recent reads of the same URL can be served from a short-lived cache instead of refetching.' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
