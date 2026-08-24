import type { Metadata } from 'next';
import { MousePointerClick, Eye, KeyRound, Timer, ScanSearch, ListX } from 'lucide-react';
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
        { icon: MousePointerClick, title: 'A real action set', body: 'Navigate, click, type, press, scroll, wait, screenshot and run JavaScript, in sequence, against one live page. Every action names its target; nothing is guessed.' },
        { icon: Timer, title: 'Sessions persist', body: 'Set keepSessionOpen and get a session ID back. The next call continues on the same page with cookies, storage and focus intact, until you close it or a timeout does.' },
        { icon: Eye, title: 'Watch it happen', body: 'Every open session has a read-only live view fed by the browser’s own screencast. Open the link in a tab and watch the actions land.' },
        { icon: ScanSearch, title: 'Extract with your model', body: 'An extract action sends the page’s stripped content to the provider you configured and returns the answer as the run output, as a string or against your JSON Schema.' },
        { icon: KeyRound, title: 'Bounded by design', body: 'A cap on open sessions, an idle timeout and a hard timeout are operator settings. With no per-minute billing, the limits are what keep a stuck agent from holding a browser forever.' },
        { icon: ListX, title: 'Failures name the step', body: 'A selector that never appeared, a bot challenge on navigation or an unreachable model comes back as a typed failure with the index of the action that failed.' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
