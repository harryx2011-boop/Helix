import type { Metadata } from 'next';
import { MousePointerClick, Eye, Timer, ScanSearch } from 'lucide-react';
import { CapabilityPage } from '@/components/marketing/pages/capability-page';

export const metadata: Metadata = {
  title: 'Browser Interaction API',
  description: 'A stateful browser session your agent can drive: click, type, scroll, wait, extract, and watch it happen in a live view.',
};

// openapi.yaml → /interact → requestBody.examples.oneShot, and InteractResponse.
const REQUEST = `POST /v1/interact
{
  "url": "https://example.com/shop",
  "actions": [
    { "type": "click", "selector": "#accept-cookies" },
    { "type": "type", "selector": "#search", "text": "wireless keyboard" },
    { "type": "press", "key": "Enter" },
    { "type": "wait", "selector": ".results" },
    { "type": "screenshot" },
    { "type": "extract", "prompt": "Get the price of the first result" }
  ]
}`;

const RESPONSE = `{
  "success": true,
  "sessionId": "sess_9f2c1a7b3e4d5c60",
  "sessionOpen": false,
  "url": "https://example.com/shop?q=wireless+keyboard",
  "output": "Keyboard available at $49.99",
  "data": { "answer": "Keyboard available at $49.99" },
  "screenshot": "data:image/png;base64,...",
  "javascriptReturns": [],
  "actionsRun": 6,
  "usage": { "tokens": { "input": 1180, "output": 14 }, "model": "your-model" },
  "timingMs": 4210
}`;

export default function InteractPage() {
  return (
    <CapabilityPage
      endpoint="interact"
      h1={['A browser', 'your agent can drive.']}
      subhead="Stateful sessions. Click, type, scroll, wait, extract, and watch it happen in a live view."
      mock={{
        chrome: 'browser',
        label: 'session sess_9f2c1a7b3e4d5c60',
        code: `● click     #accept-cookies
● type      #search  "wireless keyboard"
● press     Enter
● wait      .results
● screenshot
▸ extract   "price of the first result"

→ Keyboard available at $49.99`,
      }}
      features={[
        { icon: MousePointerClick, eyebrow: 'Interact with pages', lead: 'A real action set.', body: 'Navigate, click, type, press, scroll, wait and screenshot, in sequence.', evidence: '{ "type": "press", "key": "Enter" }' },
        { icon: Timer, eyebrow: 'Sessions persist', lead: 'The page stays open between calls.', body: 'Cookies, storage and focus carry over until you close it.', evidence: '"sessionId": "sess_9f2c1a7b3e4d5c60"' },
        { icon: Eye, eyebrow: 'Knows the moment', lead: 'Watch it happen.', body: 'A read-only live view streams the session’s own screencast.', evidence: '"sessionOpen": true' },
        { icon: ScanSearch, eyebrow: 'Extract with your model', lead: 'One action reads the page.', body: 'Returns a string or fills your JSON Schema.', evidence: '{ "type": "extract", "prompt": "..." }' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
