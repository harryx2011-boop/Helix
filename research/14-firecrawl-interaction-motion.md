# firecrawl.dev — Interaction & Motion Capture

Captured with Playwright (`D:\Helix\research\firecrawl-capture\interact.mjs`) against `https://firecrawl.dev/` and `https://firecrawl.dev/playground`. Viewport 1440×1000 unless noted. All raw artifacts in `D:\Helix\research\firecrawl-capture\out\interact-*`.

---

## 1. Hover states

Element style captured via `getComputedStyle` before `element.hover()` and 400ms after. Only changed properties listed.

### Primary CTA — "Start for free" button (`.button-primary`)
Screenshot: `interact-hover-primary-cta.png`

- No `transform`/scale/translate change on hover — it does **not** lift via transform.
- `boxShadow` changes shape/spread only:
  - Before: `... 0px 2px 4px 0px, ... 0px 1px 1px 0px, ...` (two soft drop layers + an inset top glow)
  - After: `... 0px 4px 8px 0px, ...` (the 2px/4px drop-shadow layer doubles to 4px/8px)
  - Full before/after strings are in `interact-homepage-results.json` → `hover.primary-cta`.
  - Net effect: a growing soft shadow (spread 2px→4px, blur 4px→8px) reads as a subtle "rising" cue with zero geometric movement.
- `backgroundColor`, `color`, `borderColor`, `opacity` unchanged.
- Base color: `color(display-p3 0.9816 0.3634 0.0984)` ≈ `#fa5c19` (brand orange).

### Secondary CTA — "Setup for agents" button (`.button-secondary`)
- `backgroundColor`: `color(display-p3 0 0 0 / 0.039216)` → `color(display-p3 0 0 0 / 0.058824)` — a flat black-alpha wash darkening from **3.9% → 5.9% opacity**. No shadow, no transform.

### Nav link — "Products"
- Zero computed-style delta at all on hover (no background/shadow/color change). Any affordance is limited to `cursor: pointer` and the dropdown-chevron reveal on click, not a hover style.

### Feature card ("Smarter AI chats" tile, one of the horizontally-scrolling "developer features" cards)
Screenshot: `interact-hover-card.png`

- Card is a `<button>` (`w-full text-left cursor-pointer`), not a div — 300×131px.
- `backgroundColor`: `rgba(0,0,0,0)` → `color(display-p3 0 0 0 / 0.031373)` — a **3.1% black tint** appears on hover.
- Structural pattern: each card contains a `Learn more` link with classes `opacity-0 pointer-events-none` by default and `hover:opacity-100`-style reveal (Tailwind group-hover), i.e. **the CTA link is invisible until the card is hovered**, then fades in.
- Transition on the reveal link: `transition-opacity duration-150` (150ms, default ease).

**General hover language:** no scale/translate transforms anywhere sampled; all hover feedback is background-tint or shadow-spread based, transitions in the 100–400ms range.

---

## 2. Scroll-triggered animation

Method: recorded `opacity`/`transform` (self + up to 40 descendants) for 7 major sections at scroll-top, then scrolled each section to ~200px below viewport top and re-measured after 600ms.

**Result: 0/7 sections showed any opacity or transform change.** Confirmed on two independent runs.

| Section (heading) | DOM top (px) | opacity | transform | transition |
|---|---|---|---|---|
| Power AI agents with clean web data (hero) | 64 | 1 (constant) | none | `all 0s ease` |
| Start searching today | 1666 | 1 (constant) | none | `all 0s ease` |
| Fast, reliable, token-efficient... | 4016 | 1 (constant) | none | `all 0s ease` |
| We handle the hard stuff | 6068 | 1 (constant) | none | `all 0s ease` |
| Transform web data into AI-powered solutions | 9059 | 1 (constant) | none | `all 0s ease` |
| People love building with Firecrawl | 10558 | 1 (constant) | none | `all 0s ease` |
| Frequently asked questions | 12262 | 1 (constant) | none | `all 0s ease` |

**Conclusion: firecrawl.dev does not use scroll-reveal / fade-up-on-scroll animation for its section content.** Content is rendered at full opacity, no transform offset, and `transition: all 0s ease` (i.e. transitions are explicitly disabled at rest — this value only becomes non-zero on interactive states like hover, not scroll position).

- `IntersectionObserver` exists natively (not polyfilled/overridden) — `IntersectionObserver.toString()` contains `[native code]` — but nothing observed used it to gate opacity/transform on these top-level sections. It may still be used for lazy-loading images/lazy-mounting the code-preview widgets, just not for scroll-triggered CSS reveal.
- No animation-library fingerprints found: `window.gsap`, `window.AOS`, `window.Lenis`, `window.FramerMotion` all absent; no `framer-motion`/`data-framer` attributes in the DOM; no `.animate-in`/`.fade-in`/`.reveal` utility classes present in meaningful numbers.
- One `data-state="idle"` attribute found sitewide — belongs to a single stateful interactive widget (the animated JSON/code preview panel), not a scroll system.

**Practical implication for a homage:** skip scroll-reveal entirely; match Firecrawl by keeping page sections static and putting all motion budget into the small number of always-running micro-animations (below) and interaction states (hover/press).

---

## 3. Hero motion (idle animation, no user input)

Three viewport screenshots taken 900ms apart at scroll position 0: PNG byte sizes were 102646 / 110025 / 97185 (also 96176/112624/99266 and 101605/100011/107836 across repeat runs) — **frames differ every time**, confirming continuous motion in the hero with zero user input.

### `animation-name` inventory (computed, page-wide)
4 unique `@keyframes` names in active use, 9 elements animating at capture time:

```css
@keyframes spin {
  100% { transform: rotate(360deg); }
}
/* used by: small spinning SVG icon(s) — duration 1s, linear, infinite, one instance offset -0.5s delay for a counter-phase pair */

@keyframes spin-reverse {
  0% { transform: rotate(360deg); }
}
/* used by: hero background "orbit ring" divs — duration 32s, linear, infinite */

@keyframes pulse {
  50% { opacity: 0.5; }
}
/* generic pulse, likely a loading/skeleton state */

@keyframes ai-chats-realtime-indicator {
  0% { opacity: 0.5; transform: scale(0.5); }
  60% { opacity: 0; }
  75%, 100% { opacity: 0; filter: blur(4px); transform: scale(4); }
}
/* a "ping"/radar-style expanding-and-fading dot, used on the "Smarter AI chats" feature card indicator */
```

- **Slow orbit rings**: `spin` / `spin-reverse` at **32s per rotation**, `linear` easing, `infinite` — this is the big, barely-perceptible background rotation seen behind the hero product-preview panel (classes `overlay animate-spin [animation-duration:32s]`).
- **Fast spinner**: `spin` at **1s**, linear, infinite — a small loading-style icon, likely inside the live code/JSON preview widget, with a second instance running `-0.5s` out of phase (paired counter-rotating or offset spinners).
- **Radar ping**: `ai-chats-realtime-indicator` — a scale(0.5→4)/opacity(0.5→0)/blur(0→4px) expanding ring effect signaling "live" data, likely looping.
- No `<canvas>` used for animation (34 `<canvas>` elements exist on the page but are static — likely used for text/noise-texture rendering, not motion). No `<video>`. 9 SVG `<animate>`/`<animateTransform>` elements present (feeds the `spin` keyframe pairing above). No Lottie player.

Full dump: `interact-hero-keyframes.json`.

---

## 4. Interactive widgets

### Homepage demo
- Homepage has exactly **1 free-text input** (not a full runnable demo widget) plus category buttons (Scrape / Interact / Deep research / Onboarding) that route to feature explainer copy, not a live execution surface.
- Filled with `https://example.com`, clicked the nearest submit button — no auth modal appeared, URL stayed on `https://www.firecrawl.dev/` (no navigation, no visible result state changed in the 1.5s window observed). Screenshots: `interact-homepage-demo-initial.png`, `-filled.png`, `-after-submit.png`.

### `/playground` — tabbed interface
Screenshot: `interact-playground-initial.png`

Tab structure (plain `<button>` elements grouped under three category labels, not `role="tab"`):

| Category label | Tabs |
|---|---|
| DISCOVER | **Search** |
| EXTRACT | **Scrape**, **Parse**, **Map** |
| CRAWL | **Crawl** |

Each tab swaps the input panel below (single URL/query field + a `Source:` count stepper + format dropdown + `Get code` / `Start <verb>ing` buttons). Screenshots per tab: `interact-playground-tab-Search.png`, `-Scrape.png`, `-Parse.png`, `-Map.png`, `-Crawl.png`.

**Anonymous execution — gated, not blocked by a login wall.** Two distinct behaviors observed, neither of which is a "please sign in" modal:

1. **Inline input validation** before any request fires: typing a bare domain (`firecrawl.dev`) into the Search tab produces an inline warning row — *"firecrawl.dev is a URL, not a query. Scrape returns the page content, Map lists every URL on the site."* — with two quick-switch chip buttons, **Scrape it** / **Map it**, plus a dismiss `×`. Screenshot: `interact-playground-run-settled.png`.
2. **reCAPTCHA gate on submit**: clicking "Start scraping/searching/crawling" triggers an invisible reCAPTCHA check. In automated/headless browsing this surfaces as a visible inline red error banner: **"Invalid or expired ReCAPTCHA token."** — rendered as a small floating card below the input panel with a warning-triangle icon. No sign-up/sign-in modal, no account requirement text anywhere in the flow; the gate is bot-verification, not authentication. Screenshot: `interact-playground-scrape-settled.png`.

This means a real human visitor (non-bot) can likely run a request anonymously (reCAPTCHA would resolve silently for them); the gate exists specifically to block automated/scripted use, not to force account creation.

---

## 5. Code sample presentation

One language-tabbed code block found on the homepage (embedded in the API-usage section). Tabs observed: **Python**, **cURL** (locator matched 2 of a likely larger tab set — the DOM only exposed these two as clickable `[role=tab]`/button matches within the scroll window tested).

- Tab switch mechanics: clicking a tab swaps the visible `<pre>` content; transition observed within ~350ms poll window, no fade/crossfade artifacts captured (may be an instant swap).
- Highlighter: **`react-syntax-highlighter`** (confirmed via the `react-syntax-highlighter-line-number` class on line-number gutters), Prism-based token classes (`token punctuation`, `token property`, `token string`, etc).

### Token → color mapping (computed `color`, both Python and cURL samples identical mapping)

| Token class | Color | Sample text |
|---|---|---|
| `token string` | `color(display-p3 0.980392 0.364706 0.098039)` ≈ **`#fa5c19`** (brand orange) | `"https://example.com"` |
| `token property` | `color(display-p3 0.14902 0.14902 0.14902)` ≈ **`#262626`** (near-black) | `url` |
| `token punctuation` | `rgb(194, 194, 194)` ≈ **`#c2c2c2`** (light gray) | `[`, `{`, etc |
| plain text / no token class | `color(display-p3 0.14902 0.14902 0.14902)` ≈ **`#262626`** | body text |
| line-number gutter | `color(display-p3 0 0 0 / 0.121569)` ≈ **12.2% black** | `1`, `2`, ... |

Only 4 distinct token colors observed in the sampled snippet (string/property/punctuation/plain) — a deliberately minimal palette (orange accent + near-black + one gray), not a full multi-hue syntax theme. Screenshots: `interact-codeblock-tab-0-Python.png`, `interact-codeblock-tab-1-cURL.png`.

---

## 6. Responsive breakpoints

Tested widths: 1920, 1440, 1024, 768, 390.

| Viewport width | Main container width | Container `max-width` rule | Nav | Hamburger visible |
|---|---|---|---|---|
| 1920px | 1112px | `min(100% - 32px, 1112px)` | Full inline links (6 visible) | No |
| 1440px | 1112px | `min(100% - 32px, 1112px)` | Full inline links (6 visible) | No |
| 1024px | 992px | `min(100% - 32px, 1112px)` | Full inline links (6 visible) | No |
| 768px | 356px | `min(100% - 32px, 356px)` | 0 inline links | **Yes** |
| 390px | 356px | `min(100% - 32px, 356px)` | 0 inline links | **Yes** |

**Container width formula:** `min(100% - 32px, 1112px)` — i.e. a hard content cap of **1112px**, with 16px of margin on each side below that, confirmed by the 1024px row (`1024 - 32 = 992`, matches exactly).

**Nav collapse breakpoint:** somewhere between 1024px and 768px, the header nav switches from 6 inline text links to a hamburger icon — consistent with Tailwind's default `lg` breakpoint (1024px) using a custom `lg-max:` variant convention seen elsewhere in the markup (e.g. `lg-max:hidden`, `lg-max:w-max`), meaning nav links are hidden and the hamburger shown for any viewport **narrower than 1024px**.

**"Capability"/feature grid** (the `developer-features-tabs` 3-card row — Scrape/Interact/Deep research/Onboarding-style tiles):
- 1920/1440/1024px: `display: grid; grid-template-columns: repeat(3, ~370px)` → **3 columns**, confirmed via computed `gridTemplateColumns` (e.g. `370.656px 370.672px 370.656px` at 1440px).
- 768px/390px: same container's class list is `flex lg:grid grid-cols-3 lg-max:w-max` — below the `lg` breakpoint it becomes `display: flex` (a **horizontally-scrollable row**, not a 2-column stacked grid). This is a "grid becomes horizontal-scroll flex row" pattern, not a responsive column-count reduction.
- The 1024→768 breakpoint is the same one where the 3-col feature grid flips to flex-scroll AND the nav collapses to hamburger — both driven by the same `lg` (1024px) cutoff.

Screenshots: `interact-responsive-1920.png`, `-1440.png`, `-1024.png`, `-768.png`, `-390.png`.

---

## Failures / caveats

- Direct stylesheet introspection (`document.styleSheets[].cssRules`) mostly returned empty/inaccessible — CSS is likely served from a CDN origin without CORS headers, so Tailwind's raw `@media` breakpoint values could not be read directly from source; the 1024px/768px cutoff above is inferred empirically from rendered layout, not read from a media-query string.
- `networkidle` navigation intermittently timed out (~45–60s) on 2 of 10 total page loads across runs, likely due to the site's persistent long-poll/analytics connections; retried successfully with `waitUntil: 'load'` fallback — no data lost.
- The homepage-demo "submit" click landed on a generic nearby button match rather than a guaranteed single canonical "run" control (homepage does not have one clearly-scoped demo widget the way `/playground` does) — treat that result as low-confidence; the `/playground` findings are the reliable source for anonymous-execution behavior.
- Card-hover's nested "Learn more" link handle became stale after the parent card's hover style shifted layout slightly, so its own before/after delta wasn't captured (only the card container's background-tint delta was) — not a blocker, the reveal mechanism (`opacity-0` → `hover:opacity-100`, group-hover pattern) was confirmed structurally from class names instead.
- Pricing page (`/pricing`) was not separately captured — no unique hover/motion pattern was identified there worth a dedicated pass beyond what's already covered by the shared header/CTA components on the homepage; skipped to keep scope to genuinely new findings.
