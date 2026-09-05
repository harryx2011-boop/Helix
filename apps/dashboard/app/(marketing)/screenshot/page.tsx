import type { Metadata } from 'next';
import { Crop, Monitor, MoonStar, Timer } from 'lucide-react';
import { CapabilityPage } from '@/components/marketing/pages/capability-page';

export const metadata: Metadata = {
  title: 'Screenshot API',
  description:
    'Full page, viewport or one element. PNG, JPEG, WebP or PDF, at any device size, with the ads and banners gone.',
};

const REQUEST = `POST /v1/screenshot
{
  "url": "https://example.com",
  "fullPage": true,
  "format": "png",
  "viewport": { "width": 1440, "height": 900, "dpr": 2 },
  "blockAds": true,
  "darkMode": false,
  "waitFor": 500
}

# one element instead of the page
{ "url": "…", "selector": "#pricing-table", "omitBackground": true }

# the same page as a PDF
{ "url": "…", "pdf": true }`;

const RESPONSE = `{
  "success": true,
  "data": {
    "screenshot": "https://cdn.helix.sh/s/9f2c….png",
    "width": 1440,
    "height": 5120,
    "format": "png",
    "bytes": 412883,
    "metadata": {
      "statusCode": 200,
      "tier": "chromium",
      "devicePixelRatio": 2
    }
  }
}`;

export default function ScreenshotPage() {
  return (
    <CapabilityPage
      endpoint="screenshot"
      h1={['The page as it renders,', 'not as it responds.']}
      subhead="Full page, viewport or a single element — at any device size, with cookie banners and ads out of the frame."
      mock={{
        chrome: 'browser',
        label: 'example.com — 1440×5120',
        code: `┌──────────────────────────────┐
│  ▔▔▔▔▔▔▔▔        ▁▁  ▁▁  ▁▁  │
│                              │
│  ████████████                │
│  ██████████████████          │
│                              │
│  ┌────────┐ ┌────────┐       │
│  │        │ │        │       │
│  └────────┘ └────────┘       │
└──────────────────────────────┘
  png · 1440×5120 · 403 KB`,
      }}
      features={[
        {
          icon: Monitor,
          eyebrow: 'Any frame',
          lead: 'Full page, viewport or element.',
          body: 'Capture everything below the fold, just what fits, or the one component you actually needed.',
          evidence: 'captures by scope · sample instance',
          meters: [
            { label: 'full page', value: 64, accent: true },
            { label: 'viewport', value: 24 },
            { label: 'element', value: 12 },
          ],
        },
        {
          icon: Crop,
          eyebrow: 'Four outputs',
          lead: 'PNG, JPEG, WebP or PDF.',
          body: 'Pick the format and quality at request time; a full-page capture becomes a paginated PDF with one flag.',
          evidence: '"format": "webp" · "quality": 82',
        },
        {
          icon: MoonStar,
          eyebrow: 'Clean frame',
          lead: 'Banners and ads removed.',
          body: 'Ad and consent-dialog blocking, dark-mode emulation, and a transparent background when you want one.',
          evidence: '"blockAds": true · "darkMode": true',
        },
        {
          icon: Timer,
          eyebrow: 'Settled first',
          lead: 'Waits for the page to stop moving.',
          body: 'Hold for a delay, a selector or network idle, so animations and lazy images are done before the shutter.',
          evidence: '"waitFor": 500 · time to settle',
          meterSize: 'thin',
          meters: [
            { label: 'settled', value: 91, accent: true },
            { label: 'timed out', value: 9 },
          ],
        },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
