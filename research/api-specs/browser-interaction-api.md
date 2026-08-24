# Helix — Browser Interaction API Spec

## 1. Goal
Let an agent operate a page, not just read it: click buttons, fill and submit forms, navigate multi-step flows, scroll, wait, and extract data along the way. This is the most stateful API in Helix — full headless browser session, potentially minutes long. Open source, self-hosted; no metered billing, resource use is bounded by operator-configured limits instead. Full v1 scope: click/type/scroll/multi-step flows, matching Firecrawl's Interact.

## 2. Architecture
- **TypeScript API gateway**: session lifecycle management (create/extend/close), auth (local API keys), streaming action results back to the client.
- **Rust session workers**: each holds one live headless browser instance (via CDP) for the duration of a session. This is the core of this API — a persistent, stateful browser context that survives across multiple action calls, unlike Scrape's one-shot fetch.
- **Python service**: used for the AI-prompt-driven action mode (e.g. `"prompt": "find the checkout button and click it"` → Python calls the configured LLM provider with the page's accessibility tree/screenshot to resolve the prompt into a concrete action + selector). Uses the same instance-wide BYOK config as the other APIs.
- Session isolation: one browser context (cookies/localStorage/session) per `sessionId`, not shared across requests.
- Flow: Gateway (TS) → `POST /v1/interact` creates or resumes a session → Rust worker executes the action list against its live browser → Python resolves any prompt-based actions into selectors before Rust executes them → result (output, live view URL) streamed back.

## 3. BYOK — AI Provider Configuration
Same instance-wide BYOK setup as the other Helix APIs. Required only for prompt-based `extract`/action-resolution steps — pure selector-based actions (click/type/scroll/press/wait) need no LLM call at all.

## 4. Endpoints

### `POST /v1/interact` — run actions (creates a session if none provided)
**Request**
```json
{
  "url": "https://example.com/shop",
  "sessionId": null,
  "actions": [
    { "type": "click", "selector": "#accept-cookies" },
    { "type": "wait", "milliseconds": 500 },
    { "type": "type", "selector": "#search", "text": "wireless keyboard" },
    { "type": "press", "key": "Enter" },
    { "type": "scroll", "direction": "down", "amount": 800 },
    { "type": "screenshot" },
    { "type": "extract", "prompt": "Get the price of the first result" }
  ],
  "keepSessionOpen": false
}
```

**Response**
```json
{
  "success": true,
  "sessionId": "sess_xyz789",
  "output": "Keyboard available at $49.99",
  "screenshot": "/screens/xyz789.png",
  "liveViewUrl": "http://localhost:3000/liveview/sess_xyz789",
  "interactiveLiveViewUrl": "http://localhost:3000/liveview/sess_xyz789?interactive=true",
  "sessionOpen": false
}
```

### `POST /v1/interact/session` — explicitly open a reusable session
### `DELETE /v1/interact/session/{sessionId}` — close a session

## 5. Schemas
- `Action` union type, `type` discriminates the shape:
  - `navigate` — `{ type, url }`
  - `click` — `{ type, selector }`
  - `type` — `{ type, selector, text }`
  - `press` — `{ type, key }`
  - `scroll` — `{ type, direction, amount }`
  - `wait` — `{ type, milliseconds }`
  - `screenshot` — `{ type }`
  - `extract` — `{ type, prompt, schema?, provider? }` (AI-resolved)
- `InteractRequest`: `url` (required if no `sessionId`), `sessionId` (optional, resumes existing session), `actions[]`, `keepSessionOpen` (bool).
- `InteractResponse`: `success`, `sessionId`, `output` (result of last `extract`, if any), `screenshot` (if requested), `liveViewUrl`, `interactiveLiveViewUrl`, `sessionOpen`, `error`.

## 6. Infra notes
- This is the most resource-intensive API — one live browser tab per session ties up real memory/CPU on a Rust worker for the whole session lifetime. Needs its own autoscaling/pool sizing config, separate from the stateless Scrape workers.
- `liveViewUrl` (read-only) and `interactiveLiveViewUrl` (human can take over) both need a browser-streaming layer (e.g. CDP screencast piped over WebSocket to a lightweight viewer) — served locally by the self-hosted instance.
- Hard session timeout (e.g. 15 min max) regardless of activity, to bound worst-case resource usage on the operator's own hardware.
- Idle sessions (no action for N minutes, e.g. 5) auto-close to free resources.
- Since there's no per-minute billing to naturally cap usage, expose operator-configurable concurrency limits (max simultaneous open sessions) as a first-class config option to prevent resource exhaustion.
- Prompt-based `extract` actions need the page's current DOM/accessibility tree passed to the LLM — keep this payload trimmed (similar boilerplate-stripping as Scrape) to control token cost against the operator's own API key.

## 7. Open questions
- [ ] Session concurrency limits — sane self-hosted defaults given no billing signal to bound usage?
- [ ] Do prompt-resolved actions (e.g. `"click the checkout button"` with no selector) belong in v1, or start selector-only and add AI-resolved actions in v1.1?
- [ ] Captcha handling — out of scope, or a pluggable third-party solver integration point (BYOK-style, operator supplies their own solver key)?
