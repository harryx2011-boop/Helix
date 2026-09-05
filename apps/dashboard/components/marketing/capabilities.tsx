'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Braces } from 'lucide-react';
import { ENDPOINTS } from '@/lib/catalog';
import { FrameBand } from './section-frame';
import { AsciiNoise } from './ascii-fields';
import { CodePanel } from './code-panel';
import { AnimatedCode } from './animated-code';
import { Segmented } from './segmented';
import { EndpointCards, type EndpointCardItem } from './endpoint-cards';
import type { Endpoint } from '@/lib/endpoints';

const TABS = ENDPOINTS.filter((e) => e.product);
const TAB_ITEMS = TABS.map((t) => ({ id: t.id, label: t.name, icon: t.icon, group: t.group }));

/** The headline four. The rest reach through the track below and the Capabilities menu. */
const CARDS: readonly EndpointCardItem[] = [
  { id: 'search', blurb: 'Search the web and read every result in the same call.' },
  { id: 'scrape', blurb: 'One URL in, clean markdown, JSON or a screenshot out.' },
  { id: 'interact', blurb: 'A browser session your agent drives: click, type, scroll, extract.' },
  { id: 'monitor', blurb: 'Re-read on a schedule, get a diff when something changes.', fresh: true },
];

/** Verbatim request/response pairs, one per tab — matched to each capability page's openapi-sourced examples. */
const REQUEST: Record<Endpoint, string> = {
  document: `POST /v1/document
{
  "op": "parse",
  "url": "https://example.com/files/invoice.pdf",
  "formats": ["markdown", "json"],
  "ocr": "auto"
}`,
  extract: `POST /v1/extract
{
  "urls": ["https://example.com/pricing"],
  "prompt": "every plan name and its monthly price"
}`,
  screenshot: `POST /v1/screenshot
{
  "url": "https://example.com",
  "fullPage": true,
  "format": "png",
  "viewport": { "width": 1440, "height": 900 }
}`,
  scrape: `POST /v1/scrape
{
  "url": "https://example.com/pricing",
  "formats": ["markdown", "json"],
  "jsonOptions": {
    "prompt": "Extract every pricing plan on the page."
  }
}`,
  parse: `POST /v1/parse
{
  "url": "https://example.com/files/invoice.pdf",
  "formats": ["markdown", "json"],
  "ocr": "auto",
  "jsonOptions": { "prompt": "the invoice total" }
}`,
  search: `POST /v1/search
{
  "query": "transactional email APIs",
  "limit": 5,
  "scrapeOptions": { "formats": ["markdown"] }
}`,
  map: `POST /v1/map
{
  "url": "https://example.com"
}`,
  crawl: `POST /v1/crawl
{
  "url": "https://example.com",
  "limit": 100,
  "maxDepth": 3,
  "estimate": true
}`,
  interact: `POST /v1/interact
{
  "url": "https://example.com/shop",
  "actions": [
    { "type": "click", "selector": "#accept-cookies" },
    { "type": "type", "selector": "#search", "text": "wireless keyboard" },
    { "type": "extract", "prompt": "Get the price of the first result" }
  ]
}`,
  monitor: `POST /v1/monitor
{
  "url": "https://example.com/pricing",
  "schedule": "0 * * * *",
  "sensitivity": "significant"
}`,
  metadata: `POST /v1/metadata
{
  "url": "https://example.com/files/report.pdf"
}`,
  convert: `POST /v1/convert
{
  "url": "https://example.com/files/report.pdf",
  "to": "png",
  "page": 1
}`,
};

const RESPONSE: Record<Endpoint, string> = {
  document: `{
  "success": true,
  "data": {
    "op": "parse",
    "markdown": "# Invoice 0142\n...",
    "json": { "invoiceTotal": 4820.00 },
    "metadata": { "pageCount": 2, "ocrUsed": false }
  }
}`,
  extract: `{
  "success": true,
  "data": [
    {
      "plan": "Pro",
      "monthlyPrice": 79,
      "_source": { "url": "…/pricing", "span": [1204, 1261] }
    }
  ],
  "dropped": []
}`,
  screenshot: `{
  "success": true,
  "data": {
    "screenshot": "https://cdn.helix.sh/s/9f2c….png",
    "width": 1440,
    "height": 5120,
    "format": "png"
  }
}`,
  scrape: `{
  "success": true,
  "data": {
    "markdown": "# Pricing\\n...",
    "json": { "plans": [{ "name": "Pro", "monthlyPrice": 79 }] },
    "metadata": { "statusCode": 200, "tier": "plain" }
  },
  "warnings": []
}`,
  parse: `{
  "success": true,
  "data": {
    "markdown": "# Invoice 0142\\n...",
    "json": { "invoiceTotal": 4820.0 },
    "metadata": { "fileType": "pdf", "ocrUsed": false, "fromCache": false }
  }
}`,
  search: `{
  "success": true,
  "data": {
    "web": [
      { "url": "https://example.com/best-email-apis", "title": "13 Best Transactional Email APIs", "position": 1 }
    ]
  },
  "warnings": []
}`,
  map: `{
  "success": true,
  "data": {
    "urls": ["https://example.com/", "https://example.com/pricing"]
  }
}`,
  crawl: `202 Accepted
{
  "success": true,
  "id": "6f1c…",
  "jobId": "6f1c…",
  "url": "/v1/crawl/6f1c…"
}`,
  interact: `{
  "success": true,
  "sessionId": "sess_9f2c1a7b",
  "output": "Keyboard available at $49.99",
  "actionsRun": 3
}`,
  monitor: `{
  "success": true,
  "monitorId": "f2a1c6e0…",
  "status": "active",
  "nextCheckAt": "2026-08-24T13:00:00.000Z",
  "stats": { "checks": 0, "changes": 0 }
}`,
  metadata: `{
  "success": true,
  "data": {
    "findings": [
      {
        "group": "docinfo",
        "key": "Author",
        "value": "Jane Roe",
        "risk": "high",
        "category": "identity",
        "removable": true
      }
    ],
    "riskSummary": { "high": 1, "medium": 2, "low": 4 }
  }
}`,
  convert: `200 OK
Content-Type: image/png
Content-Disposition: attachment; filename="report.png"

<PNG bytes>`,
};

/** One tabbed request/response panel covering all six capabilities, each tab linking to its own page. */
export function Capabilities() {
  const [active, setActive] = React.useState<Endpoint>('scrape');
  const def = TABS.find((t) => t.id === active) ?? TABS[0]!;

  return (
    <section className="px-6 py-16 sm:px-10">
      <FrameBand step="01" total="07" label="CAPABILITIES" sub="Nine products" icon={Braces} />

      <div className="py-16">
        <div data-reveal className="relative mx-auto max-w-[640px] px-6 py-6 text-center">
          <AsciiNoise
            cols={120}
            rows={18}
            seed={41}
            className="absolute -inset-x-24 -inset-y-10 hidden overflow-hidden opacity-80 sm:block [mask-image:radial-gradient(ellipse_at_center,transparent_40%,black_68%,transparent_100%)]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
              Read, search, and act on the web.
            </h2>
            <p className="mx-auto mt-3 max-w-[480px] text-[16px] leading-relaxed text-m-ink/72">
              One envelope for every endpoint. Pick a capability below to see its wire format.
            </p>
          </div>
        </div>

        <EndpointCards items={CARDS} className="mt-10" />

        <div data-reveal className="mt-12 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 overflow-x-auto">
            <Segmented items={TAB_ITEMS} value={active} onChange={setActive} aria-label="Capability" />
          </div>
          <Link
            href={def.route}
            className="group flex w-fit shrink-0 items-center gap-1.5 pb-1 font-mono text-[13px] font-medium text-violet transition-colors duration-150 ease-out hover:text-violet-hover"
          >
            {def.name} docs
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>

        <div data-reveal className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <CodePanel chrome="terminal" label={def.path} copyText={REQUEST[active]}>
            <AnimatedCode key={`req-${active}`} code={REQUEST[active]} mode="reveal" lineMs={45} playOnView className="text-foreground" />
          </CodePanel>
          <CodePanel chrome="terminal" label="[ .JSON ]" lines={RESPONSE[active].split('\n').length}>
            <AnimatedCode key={`res-${active}`} code={RESPONSE[active]} mode="scramble" resolveMs={1800} playOnView className="text-foreground" />
          </CodePanel>
        </div>
      </div>
    </section>
  );
}
