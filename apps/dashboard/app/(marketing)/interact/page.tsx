import type { Metadata } from 'next';
import { MousePointerClick, Eye, KeyRound, Timer, ScanSearch, Video } from 'lucide-react';
import { CapabilityPage } from '@/components/marketing/pages/capability-page';

export const metadata: Metadata = {
  title: 'Browser Interaction API',
  description: 'A stateful browser session your agent can drive: click, type, scroll, wait, extract, and watch it happen in a live view.',
};

const REQUEST = `POST /v1/interact
{
  "url": "https://example.com/shop",
  "actions": [
    { "type": "click", "selector": "#accept-cookies" },
    { "type": "type", "selector": "#search", "text": "wireless keyboard" },
    { "type": "press", "key": "Enter" },
    { "type": "extract", "prompt": "Get the price of the first result" }
  ]
}`;

const RESPONSE = `{
  "success": true,
  "sessionId": "sess_xyz789",
  "output": "Keyboard available at $49.99",
  "liveViewUrl": "http://localhost:3400/liveview/sess_xyz789",
  "sessionOpen": false
}`;

export default function InteractPage() {
  return (
    <CapabilityPage
      endpoint="interact"
      h1={['A browser', 'your agent can drive.']}
      subhead="Stateful sessions. Click, type, scroll, wait, extract, and watch it happen in a live view."
      mock={{
        chrome: 'browser',
        label: 'session sess_xyz789',
        code: `● click     #accept-cookies
● type      #search  "wireless keyboard"
● press     Enter
▸ extract   "price of the first result"

→ Keyboard available at $49.99`,
      }}
      features={[
        { icon: MousePointerClick, title: 'A real action set', body: 'Click, type, press, scroll, wait, screenshot and run JavaScript, in sequence, against one live page.' },
        { icon: Timer, title: 'Sessions persist', body: 'One browser context per session, cookies and storage intact across calls, until you close it or it times out.' },
        { icon: Eye, title: 'Watch it happen', body: 'A read-only live view streams the session. An interactive view lets a human take over mid-run.' },
        { icon: ScanSearch, title: 'Prompt-resolved extraction', body: 'An `extract` action can hand the page to your configured LLM and return the answer as the run output.' },
        { icon: KeyRound, title: 'Bounded by design', body: 'A hard session timeout and an idle auto-close keep resource use predictable with no per-minute billing to do it for you.' },
        { icon: Video, title: 'Screenshot at any step', body: 'Capture the page mid-flow, not just at the end, for a visual record of what the session did.' },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
