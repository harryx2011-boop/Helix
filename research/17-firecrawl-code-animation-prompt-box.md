# Firecrawl — Code Animation, Prompt Box & Dashboard, for Helix Homage

Sources: `research/14-firecrawl-interaction-motion.md`, `research/11-firecrawl-visual-system.md` §6, `research/firecrawl-capture/out/*` (screenshots + `interact-*.json`), `WEBSITE.md` §7.1–7.4 (user's own `/app` screenshots), and a fresh live Playwright pass this session (`decode-anim.mjs`, artifacts in `out/decode-*.json` and `out/decode-frame-*.png`) that sampled the homepage's animated JSON panel every 200ms for 3.4s and dumped every `@keyframes` rule on the page.

---

## 1. CODE ANIMATION MECHANICS

### What actually animates (confirmed live)

The homepage has **two visually similar but mechanically different code/JSON blocks**, and only one of them animates:

- **Static blocks (no animation, ever):** the `# pip install firecrawl-py` Python sample, the `npx -y firecrawl-cli@latest init --all --browser` CLI line, the `curl -s .../SKILL.md` line, and the "Start searching today" results JSON (`{"url":"https://firecrawl.dev", "title":"Firecrawl", "markdown":"Turn websites into..."}`). Sampled every 200ms for 3.4s — byte-identical every frame. These are ordinary Prism-highlighted `<pre>` blocks (`prismjs` class, `language-python`/`language-cli`/`language-curl`/`language-json`).
- **The one animated block:** a JSON search-result preview (`[{ "url": "...", "markdown": "...", "json": {"title":"...", "docs":"..."}, "screenshot": "...png" }]`) that sits in the hero's live-demo widget. This is the "idle" state of the `data-state="idle"` element identified in research doc 14.

### The technique: continuous scramble-cipher, not typewriter or line-reveal

Sampling its `textContent` every 200ms for 3.4 seconds shows **only the string values scramble**; JSON structure (keys, quotes, braces, commas, the literal key names `url`/`markdown`/`json`/`title`/`docs`/`screenshot`) never changes:

```
t=0     "url": "httpZ-?A*x-mpl-a9o?"        "markdown": "? 0?at*-! *0=?0e9-*."
t=200   "url": "https://9Z--a9?.coZ"        "markdown": "Z ?AZ--A* 0t-?-ed..?"
t=1200  "url": "https://example.coa"        "markdown": "# 9ZZti-9 -Z-A-*d!!."
t=1600  "url": "https://example.com"        "markdown": "0 Ge?9zAg Star-a*A?*"   ← brief full resolve
t=2000  "url": "https://example.com"        "markdown": "* G0a-ing !tar-e9-0-"   ← url stays resolved, markdown re-scrambles
```

Findings from the full 20-sample series:
- **The `url` value resolves to `https://example.com` around t≈1.2–1.6s and then holds** — once a segment lands on the correct string it stops scrambling (a settle, not a loop-forever cipher for every field).
- **The `markdown`, `json.title`, and `screenshot` values keep scrambling indefinitely** in the captured window — they never fully resolved to real text in 3.4s, consistent with them being placeholder/decorative "data is flowing" noise rather than content meant to be read.
- **Scramble charset is small and consistent**: characters drawn from roughly `Z A 0 9 ? ! * - = . G a i s t 0` — a mix of uppercase letters, digits, and a handful of punctuation/symbol glyphs — not full random ASCII. This reads as a fixed "noise alphabet" (a small fixed array the component cycles through per character), the classic "hacker decode" effect (à la Framer's `TextScramble` / CodePen "matrix reveal").
- **String length stays roughly constant per field** across scrambles (e.g. `markdown` value hovers ~18–20 chars) — the component is scrambling within a fixed-width placeholder, not typing character-by-character to a growing length.
- **No typewriter cursor was found in this widget.** The `cursor-blink` keyframe (`@keyframes cursor-blink { 0%,100% {opacity:0} 50% {opacity:1} }`) exists on the page but is not attached to this JSON panel in the sampled DOM — it belongs to a separate `span.animate-pulse` block-cursor element noted in research doc 14 §3 (`ml-1 w-7 inline-block h-16 bg-accent-black animate-pulse [animation-duration:500ms]`), which is a different, simpler component (likely a chat/typing indicator elsewhere on the page, not the code panel).
- **No fade/opacity/stagger on lines.** The whole block's `opacity`/`transform` never changes; only inner text nodes mutate. This is a JS-driven `textContent`/character-array rewrite on an interval, not a CSS `@keyframes` animation and not a React state-driven typewriter.
- **Cadence:** re-render observed at the ~200ms sampling granularity (every sample differs), consistent with roughly a **60–150ms per-tick scramble interval** (i.e., faster than the 200ms poll — the true interval could not be resolved below the poll rate, but no two consecutive 200ms samples were ever identical, so the tick is ≤200ms, likely close to a single `requestAnimationFrame`-throttled interval like 50–80ms).
- **Loops / plays once:** the effect runs continuously while the widget is idle (`data-state="idle"`) — it does not play once and stop. It is explicitly an **idle-state ambient animation**, implying it pauses or changes when the user interacts with the input above it (not directly observed, but consistent with the `data-state` attribute existing at all — Firecrawl only bothers with a state machine here because there's a second, non-idle state).

### Sitewide keyframe inventory (from live `document.styleSheets` dump)

```css
@keyframes cursor-blink   { 0%,100% { opacity: 0; } 50% { opacity: 1; } }
@keyframes fade-in-up     { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
@keyframes spin           { 100% { transform: rotate(360deg); } }        /* 1s linear infinite — small loaders */
@keyframes spin-reverse   { 0% { transform: rotate(360deg); } }          /* 32s / 10s linear infinite — hero orbit rings */
@keyframes pulse          { 50% { opacity: 0.5; } }                      /* 0.5s cubic-bezier(.4,0,.6,1) infinite — a text-cursor block, skeletons */
@keyframes ping           { /* standard Tailwind ping, present but not sampled in detail */ }
@keyframes bounce         { /* standard Tailwind bounce, present but not observed in active use */ }
@keyframes snowfall       { /* present in stylesheet, not observed active on any captured page — likely a seasonal/unused leftover */ }
@keyframes ai-chats-realtime-indicator {
  0% { opacity: 0.5; transform: scale(0.5); }
  60% { opacity: 0; }
  75%, 100% { opacity: 0; filter: blur(4px); transform: scale(4); }
}   /* 3s ease infinite — radar/ping ring on the "Smarter AI chats" feature card */
@keyframes ai-chats-chat-shine       { /* present, not decoded — likely a highlight sweep on a chat-bubble mock */ }
@keyframes hero-scraping-highlight-before { /* present, not decoded — likely the scrape-highlight sweep on a hero mock */ }
@keyframes swipe-out-{left,right,up,down} { /* card-dismiss transforms, likely testimonial carousel or toast */ }
@keyframes sonner-fade-in/out/spin   { /* the Sonner toast library's own keyframes — third-party, not bespoke */ }
```

`fade-in-up` (10px rise, opacity 0→1) is the one general-purpose reveal keyframe on the site and is the closest sitewide analog to a "content appearing" animation — but per research doc 14 §2, it is **not wired to scroll** anywhere; it likely fires on mount/tab-switch only (e.g. playground tab content, toast notifications).

### Syntax colour mapping (confirmed, both live pass and prior capture agree)

| Token | Color | Hex approx |
|---|---|---|
| `token string` (values) | `color(display-p3 0.98 0.365 0.098)` | `#fa5c19` — brand orange |
| `token property` (keys) / plain text | `color(display-p3 0.149 0.149 0.149)` | `#262626` — near-black |
| `token punctuation` (`{ } [ ] : ,`) | `rgb(194,194,194)` | `#c2c2c2` — light gray |
| line-number gutter | `black @ 12.2%` | — |

Only 4 colors total. No keyword/function/variable-specific hues — deliberately minimal, on-brand (orange is the only "accent" color in code).

### Implementation spec: `AnimatedCode` React component

```tsx
type AnimatedCodeProps = {
  lines: string[];                 // pre-tokenized lines (or raw text split on \n)
  mode: 'type' | 'reveal' | 'stream' | 'scramble';
  charMs?: number;                 // per-character delay for 'type'/'scramble' (default 40)
  lineMs?: number;                 // per-line delay for 'reveal' (default 90)
  loop?: boolean;                  // default false — Firecrawl's own static samples never loop
  playOnView?: boolean;            // IntersectionObserver-gated start (default true)
  scrambleFields?: string[];       // 'scramble' mode only: which JSON value keys animate (others stay static, matching Firecrawl's url/markdown split)
  settleAfterMs?: number;          // 'scramble' mode: time before a field locks to its real value (Firecrawl ≈ 1200-1600ms for the first field)
};
```

**Modes, mapped to what was actually observed:**
- **`scramble`** — the one mode Firecrawl actually uses live. Maintain the real target string per field; render a same-length string of randomly chosen glyphs from a fixed noise alphabet (`Z A 0 9 ? ! * - = . a i s t G`); on a tick interval (60–80ms), each character independently has a chance to lock to its true value (weighted so lock probability rises over time), producing the organic "some chars resolve before others" look seen in the capture. Optionally hold some fields locked (`url`) and leave others (`markdown`, `title`) perpetually re-scrambling for ambient motion — this matches Firecrawl's behavior exactly and reads as "live data streaming in," not as an error state.
- **`type`** — classic typewriter (character reveal left-to-right, growing string) with a trailing block cursor using the site's own `cursor-blink` keyframe (`opacity 0→1→0`, 50% duty, ~1s cycle — the observed `pulse`-based cursor ran at 500ms full cycle, so default to 500–1000ms). Not observed on Firecrawl's code panels directly (their code samples are static), but this is the standard fallback pattern and the `cursor-blink` keyframe exists in their CSS for exactly this purpose elsewhere.
- **`reveal`** — line-by-line reveal using `fade-in-up` (opacity 0→1, translateY 10px→0), staggered `lineMs` per line. This is Firecrawl's own general reveal primitive, repurposed for code.
- **`stream`** — append whole lines/tokens at `lineMs` intervals with no per-character animation (fastest, cheapest); good for streaming API-response simulations.

**Reduced-motion behaviour (mandatory, matches Helix's DESIGN.md §6):** when `prefers-reduced-motion: reduce`, every mode renders its fully-settled final frame immediately — no scramble, no typewriter, no stagger. `playOnView` still gates *visibility* mounting but never animates. This is stricter than what Firecrawl itself does (they have no reduced-motion handling detected — see §4 below) and is a deliberate Helix improvement, already decided in `WEBSITE.md` §3.1.

**Recommended default for the Helix hero panel** (per `WEBSITE.md` §4.2, the request/response code block under the URL input): use `reveal` for the one-shot "show me the generated request" moment (plays once when a language tab is selected or the URL changes, no loop — matches Firecrawl's static-content default), and reserve `scramble` only for a genuinely decorative idle widget if Helix wants one (not currently planned — the hero panel composes, it doesn't fetch, per `WEBSITE.md` §4.2's explicit note "Nothing in the hero implies a live request").

---

## 2. PROMPT BOX ANATOMY

### Hero input widget (marketing site, light theme) — measured

From the live screenshot + `interact-homepage-results.json` + `interact-hero-keyframes.json`:

- **Container:** white panel, floating over the hero's off-white/grid background, positioned overlapping the next section by ~80px (confirmed in `WEBSITE.md` §4.2 and visible in screenshots — the panel's bottom edge sits below the hero section boundary). Radius reads as the system's `10-12px` "large surface" tier (not the `8px` card default — this is a bigger, more prominent surface). Shadow: the `--shadow-card` 4-layer stack (`0 40px 48px -20px rgba(0,0,0,.02), 0 32px 32px -20px rgba(0,0,0,.03), 0 16px 24px -12px rgba(0,0,0,.03), 0 0 0 1px rgba(0,0,0,.03)`) — soft ambient blur + hairline border-as-shadow.
- **Halo/cutout ring:** a solid ring in the page background color (`rgb(249,249,249)` = `--background-base`) surrounds the panel at 6–12px radii steps, creating a "cut into the grid texture" effect rather than a colored focus ring. This is Helix's `--ring-cutout` token (already specified in `WEBSITE.md` §3.2 as `0 0 0 8px #F9F9F9`).
- **Structure, top to bottom, confirmed from the two viewport screenshots (`home-viewport.png`, live capture):**
  1. **Input row** (~64px tall visually): globe icon (16-18px, muted gray, left-aligned with ~16px padding) + free-text placeholder input, no border of its own (sits flush in the white panel) + **no visible submit affordance on this row** — submission happens via the arrow button in the row below.
  2. **Divider:** implicit — the two rows are visually separated by the tab-pill row's own padding/background, no explicit hairline seen.
  3. **Endpoint pill-tab row** (~48px tall): a segmented pill control with **Search / Scrape / Map / Crawl** as individual buttons inside one pill-shaped tab strip (each tab ~88×32 to ~71×32px per the measured `playground.tabs` data — `Search` widest at 88px, `Map` narrowest at 71px, all `height: 32`). The active tab (`Search`) gets a white background chip with icon; inactive tabs are plain text at `text-black-alpha-56`. Icons precede each label (small line icons, e.g. dot-grid for Search).
  4. **Trailing arrow button:** a solid orange circle/rounded-square (`999px`-adjacent, effectively a pill given its small size), white arrow-right icon, right-aligned in the same row as the endpoint tabs — this is the actual submit control, not attached to the input row above it.
- **Placeholder rotation — confirmed live.** Two viewport screenshots taken ~1s apart show the placeholder text change from `"Latest model from Kimi, Anthro[pic]"` to `"Latest news in AI"` — different query examples cycling through, not a static hint. This matches the `--text-swap-*` CSS custom properties documented in research doc 14 §5: `--text-swap-dur: .15s`, `--text-swap-ease: ease-in-out`, `--text-swap-translate-y: 4px`, `--text-swap-blur: 2px`. **Mechanism: each swap moves the outgoing text up 4px while blurring it 2px and fading it out over 150ms, then the incoming text does the reverse** (enters from 4px below, blurred, fades/sharpens in) — a compact, precise micro-transition, not a jarring cut. Full example placeholder strings observed: `"Latest news in AI"`, `"Latest model from Kimi, Anthropic"` (truncated in one capture) — realistic, varied example queries, several words each, rotating on an interval (interval length not directly measured but visually reads as several seconds per phrase, well above the 150ms transition itself).
- **No auth gate on typing/submitting** on the homepage widget (research doc 14 §4) — clicking submit did not open a modal or navigate; behavior is inert/decorative on the marketing homepage itself (the real gated flow is on `/playground`).

### Playground input panel (marketing `/playground`, still light theme)

- Grouped tab strip above the form: three category labels (`DISCOVER`, `EXTRACT`, `CRAWL`) each governing one or more sub-tabs (`Search` / `Scrape, Parse, Map` / `Crawl`) — group labels in the micro-label style (11px mono-adjacent, uppercase, wide tracking).
- Below the tabs: single URL/query field + a `Source:` count stepper + a format dropdown + two buttons (`Get code` secondary, `Start <verb>ing` primary orange pill).
- Inline validation appears as a warning row *below* the input (not a tooltip) when the query doesn't match the selected endpoint's expectations, with quick-switch chip buttons to resolve it (`Scrape it` / `Map it`) plus a dismiss `×` — a soft-correction UX pattern worth copying for Helix's own playground form validation.

### Dashboard prompt box (`/app`, dark theme — from the user's own screenshots, `WEBSITE.md` §7.1–7.4)

Per the user's description (not independently re-captured — no login access): a **dark near-black surface**, prompt box containing a **globe icon** (same icon family as the marketing hero input — consistent icon language across light/dark), a **"Source: 1" selector** (the same `Source:` stepper concept from `/playground`, carried into the dashboard), **document/book icons** (likely format or context-source pickers), a **"Get code"** action (same label as the playground's secondary button — this is a stable, reused component across marketing and app, not two different features), and an **orange primary button** for the actual run action. Above/around it: a **DISCOVER / EXTRACT / CRAWL tab strip** — the exact same three-group taxonomy as the marketing `/playground`, meaning the dashboard playground and the marketing playground are the same component reskinned for the dark app theme, not two separate builds.

### Mapping to Helix tokens (per `WEBSITE.md` §3, `DESIGN.md`)

| Firecrawl element | Helix token/value |
|---|---|
| Hero panel radius | `panel` (8px, per Helix's sharper radius decision — not Firecrawl's 10-12px) |
| Hero panel shadow | `--shadow-card` (already defined in `WEBSITE.md` §3.2, values carried over 1:1 with violet-neutral shadow, since this is a neutral elevation shadow not a brand-color one) |
| Halo/cutout ring | `--ring-cutout: 0 0 0 8px #F9F9F9` (already specified) |
| Endpoint pill tabs | Helix's `pill` radius (999px), active tab = white chip on `--m-surface`, inactive = `--m-ink` at reduced alpha, matching Firecrawl's `text-black-alpha-56` pattern via Helix's own alpha ramp |
| Trailing arrow button | Solid `violet-100` fill, white arrow icon, replaces Firecrawl's orange — this is the "arrow button" called out in `WEBSITE.md` §4.2 item 1 |
| Placeholder rotation | Reuse `--text-swap-dur: .15s`, `--text-swap-ease: ease-in-out`, `--text-swap-translate-y: 4px`, `--text-swap-blur: 2px` verbatim — these are generic motion values, not brand-colored, and can be copied exactly |
| Language tabs (cURL/Python/Node/MCP) | Same pill-segmented-control pattern as the endpoint tabs, per `WEBSITE.md` §4.2 item 2 |
| Dashboard prompt box (dark) | `apps/dashboard/app/globals.css` `.dark` tokens (already exists per `WEBSITE.md` §3.3) — globe icon, Source selector, doc icons, Get code + primary CTA row map directly onto Helix's existing Overview/Playground plan in §7.4 |

---

## 3. DASHBOARD DETAILS WORTH COPYING

All from `WEBSITE.md` §7.1–7.4 user description (not independently re-verified — no login):

- **Recent Runs card structure**: per-run cards showing Endpoint · Status · Started · Formats · (Helix addition:) Est. provider cost — already adopted verbatim into `WEBSITE.md` §7.4. Worth copying: the card-per-run pattern with click-through to a detail view, rather than a dense table, for the primary landing surface.
- **"Explore our endpoints" row**: a hairline-divided horizontal row of endpoint cells (icon + name + one-liner) — already adopted into `WEBSITE.md` §7.2 item 1 as "Explore your endpoints." Worth copying: putting this at the very top of the dashboard Overview so it doubles as both navigation and a capability reminder.
- **Usage chart texture**: an ASCII/dot-matrix-style chart, not a smooth SVG/Canvas chart library render. This is a deliberate on-brand choice (matches the hairline-grid, monospace, "raw data" visual language from the marketing site) and Helix has already speced an equivalent (`<CharChart>`, §7.3: `░▒▓█` glyphs by value quartile, violet baseline `─` rule, mono 12px axis labels). Worth copying: the *decision* to reject conventional chart libraries in favor of a typeface-native chart — it's distinctive and reduces bundle weight (no chart library dependency).
- **Section header style**: uppercase mono + hairline divider — already adopted as the sidebar group-heading pattern (`PLAYGROUND`, `SELF-HOST`, `ACCOUNT` in `WEBSITE.md` §7.1) and the marketing eyebrow labels (`[ 01 / 05 ] · CAPABILITIES`). Worth copying: use this same header style for *every* dashboard section, not just the sidebar — Firecrawl's dashboard sections (Recent Runs, Explore endpoints, Usage) likely all share this one heading treatment, giving visual consistency across a dense information surface.
- **Badge styles (NEW / COMING)**: small mono pills — Helix has already adopted `[NEW]` for sub-30-day endpoints (§7.1) and a `coming` violet pill for unshipped endpoints (§4.3, §5). Worth copying: keep badge copy terse (single word), never a sentence, and always paired with the mono/bracket visual language already established.
- **Sidebar states**: grouped nav with uppercase headings, collapsible to icon-only rail (Helix: 256px → 56px, §7.1) — a standard SaaS pattern but Firecrawl's specific execution (icon + label rows, hairline between selected/unselected endpoint groups) is already fully captured in `WEBSITE.md` §7.1 and needs no further research.

---

## 4. WHAT NOT TO COPY

- **The exact orange hex (`#FA5D19`) and its "hot glow" inset-shadow button treatment** (`inset 0 -6px 12px rgba(249,28,25,.2), ...`) — brand-specific. Helix already correctly substitutes violet (`WEBSITE.md` §3.2) with an analogous shadow recipe using violet values, not orange.
- **Their exact marketing copy** ("Power AI agents with clean web data," "Latest news in AI" placeholder examples, testimonial/use-case wording) — verbatim reuse would be copying, not homage. Helix's own copy is already drafted in `WEBSITE.md` §4.
- **The perpetual-scramble idle animation as decoration for its own sake.** It's a nice detail on Firecrawl's homepage, but Helix's hero panel is explicitly speced to *compose, not fetch* (`WEBSITE.md` §4.2) — implying real, static, correctly-formatted request/response code, not scrambled placeholder noise. Using `scramble` mode here would misrepresent the panel as "live" when it isn't. Reserve `scramble` mode, if used at all, for an explicitly decorative/idle widget, never for content the user is meant to read as real.
- **No reduced-motion handling detected on Firecrawl.** All animation/hover findings are from a site with no `prefers-reduced-motion` accommodation found anywhere in the captured CSS or DOM. Helix's own DESIGN.md §6 / `WEBSITE.md` §3.1 already correctly mandates settled-frame rendering under reduced motion — this is a deliberate improvement over the source, not a gap to fill by copying Firecrawl's (lack of) behavior.
- **`171.4K` GitHub star count, "2 Months Free - Annually" pricing banner, sign-up/account-gated flows** — none of these apply; Helix's claims guard (`WEBSITE.md` §11) already explicitly bans adoption numbers and requires no fabricated urgency.
- **The `snowfall` keyframe** found in their stylesheet — appears to be an unused/seasonal leftover (not observed active on any captured page). Not worth chasing or replicating.

---

## Confidence notes

- Code-animation mechanics (§1) are **directly observed** via a live 3.4s/20-sample Playwright capture this session — high confidence.
- Hero widget structure and placeholder rotation (§2, marketing) are **directly observed** (live screenshots + prior `interact-homepage-results.json` measurements) — high confidence.
- Dashboard details (§3) rely entirely on the user's own prior `/app` screenshots as described secondhand in `WEBSITE.md` §7.1–7.4 — **not independently re-verified this session** (no login credentials available); treat structural claims there as user-reported, not measured.
