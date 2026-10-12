import type { Metadata } from 'next';
import { Braces, Crosshair, Layers, ShieldCheck } from 'lucide-react';
import { CapabilityPage } from '@/components/marketing/pages/capability-page';

export const metadata: Metadata = {
  title: 'Structured Extraction API',
  description:
    'Describe the shape you want and get typed rows back, every field traced to the span it came from.',
};

const REQUEST = `POST /v1/extract
{
  "urls": ["https://example.com/pricing"],
  "prompt": "every plan name and its monthly price"
}

# or hand it a schema you already have
{
  "urls": ["https://example.com/pricing"],
  "schema": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "plan": { "type": "string" },
        "monthlyPrice": { "type": "number" }
      },
      "required": ["plan", "monthlyPrice"]
    }
  }
}`;

const RESPONSE = `{
  "success": true,
  "data": [
    {
      "plan": "Pro",
      "monthlyPrice": 79,
      "_source": {
        "url": "https://example.com/pricing",
        "span": [1204, 1261]
      }
    }
  ],
  "dropped": [
    { "field": "seatLimit", "reason": "no grounding span in source" }
  ]
}`;

export default function ExtractPage() {
  return (
    <CapabilityPage
      endpoint="extract"
      h1={['Describe the shape.', 'Get typed rows back.']}
      subhead="A prompt or a JSON Schema in, structured data out — with a source span on every field, and anything ungrounded dropped rather than guessed."
      mock={{
        chrome: 'terminal',
        label: 'extract',
        code: `plan          monthlyPrice   source
────────────────────────────────────────
Starter               0    [812, 869]
Pro                  79    [1204, 1261]
Enterprise         null    dropped ─ no span

2 rows · 1 field dropped`,
      }}
      features={[
        {
          icon: Crosshair,
          lead: 'Every field cites a span.',
          body: 'Each value carries the byte range it was read from, so a wrong answer is checkable rather than plausible.',
          evidence: '"_source": { "span": [1204, 1261] }',
        },
        {
          icon: ShieldCheck,
          lead: 'Ungrounded fields are dropped.',
          body: 'A field the source does not support is returned in `dropped` with a reason, never invented to fill the schema.',
          evidence: 'fields by outcome · sample instance',
          meters: [
            { label: 'grounded', value: 88, accent: true },
            { label: 'dropped', value: 12 },
          ],
        },
        {
          icon: Braces,
          lead: 'Bring either one.',
          body: 'Hand it a JSON Schema, or describe the data in a sentence and let /v1/agent/schema design one you can keep.',
          evidence: 'POST /v1/agent/schema',
        },
        {
          icon: Layers,
          lead: 'Rows across a URL set.',
          body: 'Pass a list of URLs and the same schema applies to all of them, returning one table instead of many documents.',
          evidence: 'urls[] · 1 schema · n rows',
          meterSize: 'thin',
          meters: [
            { label: 'urls', value: 24, accent: true },
            { label: 'rows', value: 71 },
          ],
        },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
