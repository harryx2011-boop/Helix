# Firecrawl Visual Design System — Extraction for Helix Homage

Source: `D:\Helix\research\firecrawl-capture\out\` — computed CSS token frequency (`*-tokens.json`), section/copy structure (`*-structure.json`), and screenshots (`*-full.png`, `*-viewport.png`, `*-mobile.png`) captured across firecrawl.dev.

Pages captured (11 at time of writing): `home`, `pricing`, `playground`, `cap-scrape`, `cap-crawl`, `cap-interact`, `cap-search`, `cap-parse`, `cap-monitor`, `alternatives`, `changelog`. All pages share **one identical `cssVars` root** — the design system is a single global token set with no per-page divergence. Product capability pages (`cap-*`) share one template (hero → visual demo panel → code sample → CTA).

---

## 1. Color

### Core palette (hex, from `cssVars` + rendered color/bg frequency)

| Role | Token / value | Hex | Notes |
|---|---|---|---|
| Page background | `--background-base` | `#F9F9F9` | Off-white, not pure white. Used behind alternating sections. |
| Page background (lighter variant) | `--background-lighter` | `#FBFBFB` | Marginally lighter alt-section fill. |
| Surface / card background | `--surface`, `--surface-raised` | `#FFFFFF` | Pure white — cards, nav, panels sit above the off-white page bg. |
| Primary text | `--accent-black` (rendered as `color(display-p3 0.149 0.149 0.149)`) | `#262626` | This is the *only* "black" used for text — true `#000` appears rarely (icons/strokes), body copy is always `#262626`. |
| Secondary/muted text | `--accent-black` at 56–72% alpha | `#262626` @ 56–72% (~`#26262691`–`#262626B8`) | Sub-headlines, descriptions. Frequency data shows 32%, 40%, 48%, 56%, 64%, 72%, 88% alpha steps of the same black — a full opacity ramp, not separate grays. |
| Border (faint) | `--border-faint` | `#EDEDED` | Section dividers, container hairlines. |
| Border (muted) | `--border-muted` | `#E8E8E8` | |
| Border (loud) | `--border-loud` | `#E6E6E6` | Card/input borders — this is the one actually rendered most often (`rgb(229,231,235)`≈`#E5E7EB` Tailwind-gray-200 also appears as a base browser default, effectively overridden). |
| Illustration strokes | `--illustrations-faint/muted/default` | `#EDEDED` / `#E6E6E6` / `#DBDBDB` | The dotted world-map / node-graph background texture. |

### Brand accent — orange ("heat")

The entire brand identity runs on **one orange hue**, exposed as an alpha ramp named `--heat-*`:

| Token | Value | Alpha |
|---|---|---|
| `--heat-100` | `#FA5D19` | 100% — **this is the primary brand orange.** |
| `--heat-90` | `#FA5D19E6` | 90% |
| `--heat-48` | `#FA5D197A` | 48% |
| `--heat-40` | `#FA5D1966` | 40% |
| `--heat-24` | `#FA5D193D` | 24% |
| `--heat-20` | `#FA5D1933` | 20% |
| `--heat-16` | `#FA5D1929` | 16% |
| `--heat-12` | `#FA5D191F` | 12% |
| `--heat-8` | `#FA5D1914` | 8% |
| `--heat-4` | `#FA5D190A` | 4% |

Rendered fills confirm `#FA5D19` (`color(display-p3 0.98 0.365 0.098)`) as the dominant accent across every page — logo flame, primary CTA buttons, gradient underlines on H1 keywords, active nav/tab states, the top announcement banner. A close variant `#E82400`/`#AE2500` (deep red-orange, `rgba(174,37,0,…)`) appears **only inside button shadows/insets** — it's the pressed/depth shade of the same orange, not a second brand color.

**Do not treat this as "any orange."** The exact hex is `#FA5D19`. A slightly redder tone (`color(display-p3 0.98 0.113 0.098)` ≈ `#F91C19`) appears exclusively in inset shadow tops on the primary button (adds a subtle red-hot glow at the top inner edge) — a shadow trick, not a fill color.

### Secondary/system accents (used sparingly — status or illustration only, not primary CTAs)

| Token | Hex | Where seen |
|---|---|---|
| `--accent-amethyst` | `#9061FF` | Small accents in "We handle the hard stuff" illustrations, badges |
| `--accent-bluetron` | `#2A6DFB` | Rare — link/info accents |
| `--accent-crimson` | `#EB3424` | Rare — error/alert states |
| `--accent-forest` | `#42C366` | Rare — success states |
| `--accent-honey` | `#ECB730` | Rare — warning states |

These five sit alongside `--heat-*` as a formal 5-color "extended palette" but appear at negligible frequency on marketing pages — orange dominates over 95% of colored pixels. Treat them as available system accents (e.g., a status dot), not homepage decoration.

### Black/white alpha ramps (for overlays, dividers, scrims)

`--black-alpha-1` through `--black-alpha-88` (1%→88% of `#262626`) and `--white-alpha-56/72` are defined as a formal opacity scale — this is how borders, hover states, and scrims are built rather than one-off rgba literals.

### Gradients (verbatim)

- Hero/section top fade-in: `linear-gradient(rgb(255, 255, 255), rgba(0, 0, 0, 0))`
- Section bottom fade-out (inverse): `linear-gradient(rgba(0, 0, 0, 0), rgb(255, 255, 255))`
- Subtle top highlight on dark UI elements: `linear-gradient(rgba(0, 0, 0, 0.07), rgba(0, 0, 0, 0))`
- Off-white panel wash: `linear-gradient(to top, color(display-p3 0.976 0.976 0.976), rgba(0, 0, 0, 0))`
- Glass/light overlay on demo panels: `linear-gradient(rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.4) 100%)`

No hero mesh-gradient or multi-stop rainbow gradient exists anywhere in the captured data — gradients are used only as **fade masks at section edges and glass overlays**, never as decorative color washes.

### Light/dark mode

**No dark mode detected.** All 11 captured pages render the same light surface (`#FFFFFF` cards on `#F9F9F9` page bg). No `prefers-color-scheme` tokens or dark-variant custom properties exist in `cssVars`. Firecrawl is light-mode only on marketing pages.

---

## 2. Typography

### Font families

| Role | Stack | Notes |
|---|---|---|
| Display / body (everything) | `suisse, "suisse Fallback", ui-sans-serif, system-ui, sans-serif, ...` | Suisse Int'l (a grotesque/neo-grotesque, similar family to Söhne/Inter) is used for **all** headings and body text — no separate display face. Dominates >85% of text nodes on every page. |
| Monospace (code, terminal, data) | `GeistMono, ui-monospace, SFMono-Regular, "Roboto Mono", Menlo, Monaco, ...` | Used for: code panels, JSON output, the `[ .JSON ]` / `[ 200 OK ]` bracket-labels scattered in hero backgrounds, credit/pricing numerals in some contexts, terminal UI. Second most frequent font family site-wide. |
| Fallback artifact | `"Times New Roman"` | Appears at moderate frequency — this is a serif fallback rendering for un-loaded custom icon fonts or specific glyphs, not an intentional serif typeface. Ignore for rebuild. |

### Type scale (px, ranked by frequency, mapped to role)

Aggregating `fontSize` across all captured pages:

| Size | Relative frequency | Likely role |
|---|---|---|
| 16px | Dominant (>60% of all text) | Base body text |
| 14px | High | Secondary body / card copy / nav links |
| 13px | Moderate | Small labels, meta text |
| 12px | Moderate | Captions, badges, table cells |
| 11px | Low-moderate | Micro-labels (e.g. "DISCOVER / EXTRACT / CRAWL" playground tabs) |
| 10px | Low | Smallest micro-copy, code line numbers |
| 20px | Low | Sub-heading / card title (h3-ish) |
| 24px | Low-moderate | Section eyebrow-adjacent or medium heading (H3 in FAQ groups, tab labels) |
| 40px | Moderate on hero-bearing pages | **Capability-page H1** (e.g. "Clean markdown", "One URL.") — see cap-* pages |
| 52px | Present on home | **Home H1** ("Power AI agents with") |
| 60px | Present, low count | Largest hero line variant (likely responsive breakpoint of the 52px H1, or the second H1 line at full desktop width) |

**Best-estimate hero scale**: Home H1 ≈ 52–60px (two-line hero, second line in orange). Capability page (`cap-*`) H1 ≈ 40px rendered but visually reads much larger in screenshots (e.g., "Clean markdown / from any URL." on cap-scrape, "One URL. / Every page." on cap-crawl) — likely a `clamp()` or responsive class pushing effective size higher at capture viewport (1440px); treat 52–64px as the safe hero range for Tailwind `text-5xl`–`text-6xl`.

Pricing H1 ("Flexible pricing") measured at 40px in tokens but visually matches the same ~48-56px hero treatment in the screenshot — again likely responsive scaling not fully captured by the frequency table (which counts computed style across breakpoint variants).

**Practical Tailwind mapping**:
- Hero H1: `text-5xl` to `text-6xl` (48–60px), weight 400–450, tight tracking
- Section H2: ~32–40px (`text-3xl`/`text-4xl`), same weight family
- Card H3: 20–24px (`text-xl`/`text-2xl`)
- Body: 16px (`text-base`)
- Secondary/caption: 14px (`text-sm`)
- Micro-label: 11–12px (`text-xs`), often uppercase with wide tracking (e.g. "// Developer First //" eyebrows, "DISCOVER" tab group labels)

### Font weights

Only **three weights** are used site-wide:

| Weight | Frequency | Role |
|---|---|---|
| 400 (regular) | Overwhelming majority | Body copy, most headings |
| 450 (medium-ish) | Second most common | Slightly emphasized body, nav links, button labels |
| 500 (medium) | Least common, but present everywhere | Strong emphasis, active states, some H3s |
| 600 | Appears exactly once across all captures | Negligible — effectively unused |

This is a deliberately restrained weight system — **no bold (700) anywhere in the data.** Headings get their visual weight from *size*, not boldness. This is an important, easy-to-miss characteristic: Firecrawl headlines look strong because they're huge, not because they're heavy.

### Letter-spacing (tracking)

| Value | Frequency | Where |
|---|---|---|
| `0.14px` | Highest — this is actually the default/body tracking (near-zero, slightly positive) | Body text |
| `-0.52px` | Second-most-common negative value | Largest hero headings (tightest tracking on biggest type — confirms negative tracking scales with size) |
| `-0.4px` | Common | Large headings (H2 scale) |
| `-0.3px` | Present | Mid headings |
| `-0.24px` | Present | Card H3 / medium headings |
| `-0.1px` | Present | Slightly tightened body-adjacent text |
| `0.24px` / `0.26px` | Rare, positive | Likely uppercase micro-labels (eyebrows), which typically get *positive* tracking, not negative |
| `0.8px` / `1.1px` | Rare, positive, larger | Uppercase tab labels ("DISCOVER", "EXTRACT", "CRAWL") — wide tracking for small caps text |

Pattern: **negative tracking scales inversely with size** — biggest hero text gets ~‑0.52px, mid headings ~‑0.24 to ‑0.4px, body stays near-zero (+0.14px), and small uppercase labels flip positive (+0.8 to +1.1px). This is a textbook, well-executed type system — replicate the inverse relationship, not just one tracking value.

### Line-heights

| Value | Role |
|---|---|
| 24px | Body @ 16px font-size → 1.5 ratio |
| 20px | Body @ 14px font-size → ~1.43 ratio |
| 22px / 17px | Secondary body variants |
| 16px | Caption @ 12-13px |
| 10px / 14px | Micro-label tight leading |
| 28px, 32px | Small heading leading |
| 40px, 44px, 56px, 64px | Hero/H2 leading — roughly matches font-size × 1.05–1.1 (tight, headline-style leading, not 1.5) |

Practical rule: **body text leading ≈ 1.4–1.5×, headings leading ≈ 1.05–1.1×** (near font-size, very tight — typical of large confident display type).

---

## 3. Spacing & Layout

### Container

- `--container-width: 1112px` — the actual content max-width.
- `--container-width-padding: 1144px` — container + horizontal padding included (1112 + 16px×2), i.e. content sits in a 1112px column with 16px gutters minimum, centered in the viewport.
- Header uses `container lg:px-56 px-16` padding classes — 16px padding on mobile/tablet, 56px(=224px? — Tailwind arbitrary, likely `px-56` = 224px in this config, but more plausibly a custom spacing scale where `56`→14rem is unlikely; treat as "generous desktop gutter, tight mobile gutter") — safest interpretation: mobile gutter 16px, desktop gutter scales up around the fixed 1112px column.
- Section wrapper class seen repeatedly: `container -mt-1` with `maxWidth: min(100% - 32px, 1112px)` — confirms **1112px is the hard content cap**, with 32px total (16px each side) as the minimum viewport gutter below that breakpoint.

**Tailwind config value: `container: { center: true, screens: { DEFAULT: '1112px' } }`, with `px-4` (16px) default gutter.**

### Vertical rhythm

From `structure.json` section `top`/`height` deltas on the home page (px, at 1440 viewport):
- Header height: ~64px (sticky, `top: 0`, next section starts `top: 64`)
- Hero section: `height: 1129` (very tall — includes the floating search/demo panel overlapping into the next section)
- Each major content section (`Start searching today`, `Easily connect`, `Fast reliable`, `We handle the hard stuff`, `Transform web data`, `Testimonials`, `FAQ`) is wrapped in `class="container -mt-1"` — sections **overlap by 1px** (deliberate hairline border collapse, not a spacing value) and otherwise their heights are content-driven (1256px–2748px depending on content density), not fixed-height bands.
- No uniform "py-24 section padding" pattern is visible in the class names captured — instead spacing comes from internal component padding + the `-mt-1` collapse. For a Tailwind rebuild, a safe **section vertical padding of `py-20` to `py-32` (80–128px)** matches the visual gaps in the screenshots between hero/section breaks.

### Grids

- **Capability/feature cards (home "Start searching today")**: 3-column grid (Search / Scrape / Interact cards side by side at desktop width).
- **"We handle the hard stuff"**: appears to run a 2-column grid of larger feature panels (Media parsing + Smart wait side by side), then further rows.
- **Use-cases grid**: 3-column card grid (Deep research / Smarter AI chats / AI agent tools, +2 more).
- **Pricing plan cards**: 4-column grid (Free / Hobby / Standard-recommended / Growth), with a 5th+6th (Scale/Enterprise) in a separate 2-column row below.
- **Alternatives comparison cards**: 3-column grid (`Firecrawl vs. Tavily / Exa / Apify` row, `vs Bright Data / ScrapingBee / Steel` row) — confirmed directly in the `alternatives-viewport.png` screenshot.
- **Testimonials**: horizontal auto-scrolling row (4 visible + repeated set), not a fixed grid.
- **FAQ**: 2-column layout — left column category label ("General", "Free & Nerdy", "API Related", "Billing"), right column accordion list.
- Card gaps read as **~16–24px** in the screenshots (tight, tokenized gutters, consistent with the 1112px/12-col-ish grid math).

---

## 4. Shape & Depth

### Border-radius — full frequency list (aggregated across pages)

| Radius | Approx. frequency rank | Role |
|---|---|---|
| `999px` | Highest everywhere | **Pills** — nav buttons, primary/secondary CTAs, badges, the announcement banner, toggle switches, tab selectors |
| `8px` | Second-highest | **Cards, inputs, code panels** — the default "boxy" surface radius |
| `10px` | Common | Slightly larger surfaces — modals, larger demo panels, dropdowns |
| `6px` | Present | Small UI chips/tags |
| `4px` | Present | Smallest — tight inline elements (small tags, table cells) |
| `2px` | Present on capability pages | Micro radius — likely a specific small inline badge |
| `12px`, `16px`, `20px` | Lower frequency, larger surfaces | Big feature-panel containers, illustration frames |
| `50%` | Rare | True circles (avatars, dots) |
| Compound values (`16px 16px 0px 0px`, `10px 10px 0px 0px`, `8px 8px 0px 0px` / `0px 0px 8px 8px`) | Rare, specific | Top-only or bottom-only rounding — used on stacked/tabbed panel components (e.g. the browser-chrome mockup with a flat bottom, code editor with rounded top only) |

**The system commits to 3 core radii**, matching the anti-vibe-coding guidance to cap at 2–3 values:
1. **`999px` (full pill)** — all buttons, badges, toggles, tab pills.
2. **`8px`** — the default card/input/panel radius (most common non-pill value).
3. **`10–12px`** — a slightly larger radius for bigger containers (major feature panels, modals) — read this as a "raised surface" radius one step up from the card default.

4px/6px/2px appear only on small inline chips and are not a 4th system tier — they're the pill radius family collapsing at very small sizes, or tag-specific micro-rounding.

### Box-shadows (verbatim, most significant)

Primary CTA button (orange) — layered depth + inner glow:
```
color(display-p3 0.9804 0.1127 0.098 / 0.2) 0px -6px 12px 0px inset,
color(display-p3 0.9804 0.3647 0.098 / 0.12) 0px 2px 4px 0px,
color(display-p3 0.9804 0.3647 0.098 / 0.12) 0px 1px 1px 0px,
color(display-p3 0.9804 0.3647 0.098 / 0.16) 0px 0.5px 0.5px 0px,
color(display-p3 0.9804 0.3647 0.098 / 0.2) 0px 0.25px 0.25px 0px
```
(A hot inner-top highlight in near-red `#f91c19`-ish, plus a soft stack of orange-tinted drop shadows at fractional px offsets — gives buttons a glassy/glossy "hot" look consistent with the "heat" naming.)

Primary CTA hover/press variant (deeper, redder):
```
rgba(174, 36, 0, 0.3) 0px 6px 12px -3px,
rgba(174, 37, 0, 0.12) 0px 3px 6px -1px,
rgba(174, 37, 0, 0.12) 0px 1px 2px 0px,
rgba(174, 37, 0, 0.24) 0px 0.5px 0.5px 0px
```

Card / panel elevation (neutral, soft, large blur, low opacity — typical "premium SaaS" shadow stack):
```
rgba(0, 0, 0, 0.02) 0px 40px 48px -20px,
rgba(0, 0, 0, 0.03) 0px 32px 32px -20px,
rgba(0, 0, 0, 0.03) 0px 16px 24px -12px,
rgba(0, 0, 0, 0.03) 0px 0px 0px 1px
```
(4-layer shadow: large soft ambient blur + tight 1px hairline "shadow-as-border" at the end — this 1px-solid-shadow-as-border trick recurs across nearly every card shadow definition site-wide, e.g. also seen as `rgba(0,0,0,0.04) 0px 24px 32px -12px, ... 0px 0px 0px 1px`.)

Focus/highlight ring (used around search/demo panel, "spotlight" effect):
```
rgb(249, 249, 249) 0px 0px 0px 6px   /* and 8px, 10px, 12px variants */
```
(A solid off-white ring matching the page background — creates a "cut-out" halo effect around floating panels rather than a colored focus ring.)

Small card hover shadow (used on capability/comparison cards, tighter and crisper):
```
rgba(0, 0, 0, 0.06) 0px 8px 16px -8px,
rgba(0, 0, 0, 0.03) 0px 2px 4px -2px
```

**Pattern to replicate**: every elevated surface shadow ends in a `0px 0px 0px 1px` (or 0.5px) hairline layer at low opacity — shadows double as borders. Combine 3–4 shadow layers (large soft blur → tighter blur → hairline) rather than one CSS `box-shadow` value.

### Borders

- Default card/input border: `1px solid #EAEAEA`-ish (`color(display-p3 0.929 0.929 0.929)` = `#EDEDED`/`#ECECEC`).
- Most borders render as `0px solid rgb(229,231,235)` — meaning **border-width is 0 by default** and borders are applied selectively per-component (the "0px solid" entries are just the browser default border-color sitting unused). Where borders are actually drawn, it's `1px solid` at the faint gray (`#EDEDED`/`#E8E8E8`).
- Active/brand border: `1px solid #FA5D19` — used sparingly (recommended pricing plan card outline, active state).
- Dotted border `1px dotted rgba(0,0,0,0.32)` — appears on the playground/interact demo pages, likely indicating a "drop zone" or connector line in diagrams.

---

## 5. Motion

### Transition durations + easing, ranked by frequency

| Duration + easing | Frequency | Likely use |
|---|---|---|
| `0s ease` | Overwhelming majority | Default/inherited — not a real transition, just the CSS reset baseline on non-animating elements. Ignore. |
| `0.2s ease` | Highest **real** transition | Standard hover/interaction transition — buttons, links, tab switches. **This is the system default.** |
| `0.15s ease` | Common | Fast micro-interactions (icon swaps, small state toggles) |
| `0.4s ease` | Present | Medium content transitions (card reveal, panel swap) |
| `0.5s ease` | Present, notable on cap-search/cap-interact pages | Larger UI demo animations (the looping browser/terminal mockups) |
| `0.3s ease` | Present | Occasional secondary transitions |
| `0.05s ease` | Present, consistent low count everywhere | Near-instant micro-feedback (e.g. button press) |
| `0.2s, 0.1s, 0.1s ease, ease, ease` (multi-property, staggered) | Consistent recurring pattern | Compound transitions — e.g. background + transform + opacity each with slightly different duration on the same element (buttons/toggles) |
| `0.3s cubic-bezier(0, 0, 0.2, 1)` | Present on multiple pages | **The one explicit custom easing curve found** — matches Tailwind's built-in `ease-out` (`cubic-bezier(0, 0, 0.2, 1)`). |
| `0.5s cubic-bezier(0, 0, 0.2, 1)` | Present on cap-search | Same curve, longer duration — for larger demo-panel animations |

**Dominant easing curve: `cubic-bezier(0, 0, 0.2, 1)` — Tailwind's `ease-out`.** Where explicit `ease` (not `cubic-bezier`) is used, it's effectively the browser default (`cubic-bezier(0.25, 0.1, 0.25, 1)`), applied to simple hover states. For anything demo/animation-driven (the looping product mockups), the system deliberately switches to `ease-out` at 0.3–0.5s.

**Custom named transition** found in cssVars: `--text-swap-dur: .15s`, `--text-swap-ease: ease-in-out`, `--text-swap-translate-y: 4px`, `--text-swap-blur: 2px` — this documents a specific **text-swap animation** (rotating headline words, e.g. "Search Scrape Map Crawl" cycling in the hero) that moves text up 4px with a 2px blur over 0.15s ease-in-out. Worth replicating exactly for a hero word-rotator.

**Recommended Tailwind motion tokens**:
- Default transition: `duration-200 ease-out` (button/link hover)
- Fast: `duration-150`
- Demo/reveal: `duration-300` to `duration-500`, `ease-out` (`cubic-bezier(0,0,0.2,1)`)
- Text-swap effect: 150ms ease-in-out, translateY(4px) + blur(2px) fade

---

## 6. Visual texture (from screenshots — not captured in tokens)

### Hero background texture
Every hero (home, pricing, all `cap-*` pages) sits on a **faint grid of vertical/horizontal hairlines** dividing the viewport into large rectangular cells (visible at the very top of every screenshot, extending the header's container border down the page). Inside these cells, scattered **small dot-matrix / pixel-cluster illustrations** appear (tiny grids of squares, like a low-res QR-code fragment or ASCII noise), rendered in very light gray (`#DBDBDB`-`#EDEDED`) — decorative, technical/data-themed texture rather than a gradient mesh or glow. Small 4-pointed sparkle/diamond glyphs (✦) in the brand orange appear at specific hairline intersections in the hero (visible on home) — a sparse, precise accent rather than scattered decoration.

There is **no blurred glow, no gradient mesh, no noise/grain overlay**. The "texture" is entirely linear (hairline grid) + small precise pixel-art illustrations + monospace bracket-labels (`[ 200 OK ]`, `[ .JSON ]`, `[ SCRAPE ]`) floating in the corners of the hero — reinforcing the "raw data / API" theme typographically rather than visually.

### Cards
Cards use a **combination of border + shadow**, not one or the other: a faint 1px border (`#EDEDED`) plus a soft multi-layer shadow (see Section 4) that includes a hairline `0 0 0 1px` layer functioning as a second, sharper border. Cards are white (`#FFFFFF`) sitting on the off-white page background (`#F9F9F9`), which alone creates visible separation before any shadow is applied. Rounded corners are the `8px` default. Pricing's "Recommended" card additionally gets an `#FA5D19` accent border/highlight and a light peach background tint (`#FDF0EC`) to stand out from its siblings.

### Buttons
- **Primary**: solid orange (`#FA5D19`) fill, white text, full pill radius (`999px`), the layered "hot glow" inset+drop shadow described in Section 4, medium horizontal padding, comfortable height (~40–44px based on screenshot proportions). Text weight ~450–500.
- **Secondary**: light gray fill (`#EDEDED`-ish / `color(display-p3 0.929 0.929 0.929)`), dark text, same pill radius, no colored shadow — flat, quiet counterpart to the primary button.
- Buttons consistently pair primary+secondary side by side (e.g., "Start for free" + "Setup for agents"; "Try Scrape now" + "Read the docs") — every hero CTA is a two-button row, not a single button.
- No icon-in-button pattern dominates except directional arrows (→) appended to link-style CTAs ("Read the announcement →").

### Code sample presentation
Code panels use a **browser-chrome / editor-chrome mockup wrapper**: a white rounded panel (`8-10px` radius) with a top toolbar strip containing 3 small circular dots (traffic-light window controls, rendered in gray not red/yellow/green) and sometimes a URL/breadcrumb bar (e.g. `docs.firecrawl.dev`, `luxestore.com/search?...`). Below that, monospace (GeistMono) code with **orange-tinted syntax highlighting** — keywords/strings in the brand orange rather than a conventional multi-color syntax theme, keeping code visually on-brand rather than looking like a generic VS Code screenshot. Line numbers in muted gray on the left. Tab bar above some code panels shows multiple source tabs (favicon + label, e.g. "W NASA - Wikipedia", "Pricing · Stripe", "Y Hacker News") with the active tab underlined in orange.

The `cap-crawl` page shows a **split-panel** code demo: left side a file-tree (directory listing with orange highlight on the active file `scrape`), right side the corresponding markdown/code output — a two-pane "source → result" layout used to visually demonstrate the API's transformation.

### Section contrast / density
No section uses a dark background — the entire site is light-mode, and section-to-section contrast comes only from the two off-white tones (`#F9F9F9` main vs `#FFFFFF` card surfaces) plus generous whitespace, not color blocking. Density is **airy**: large hero type, generous padding around cards, single-column centered copy blocks before grids begin. The FAQ section is the densest (small type, tight accordion rows, two-column layout) — a deliberate shift from "airy marketing" to "compact reference" register.

### Navigation
Sticky header, `#F9F9F9`-tinted background matching page bg (not pure white — blends rather than "floats" over content), with a thin bottom hairline border and small corner-bracket SVG flourishes at the container edges (decorative orange-stroke brackets at the container's bottom corners, matching the hero's technical/bracket motif). An orange full-width announcement banner sits above the header (pill-radius rounded corners visible even on a full-bleed bar, white underlined link inside).

### Mobile
Mobile layout (390px capture) stacks all grids to single-column, keeps the same card/button/radius system, hero type scales down proportionally but keeps the two-line orange-highlighted headline pattern. No mobile-specific visual language change — same tokens, same shadows, same pill buttons throughout.

---

## Tailwind config starter (derived, not verbatim from source)

```js
// tailwind.config.js — derived token approximation for Helix homage
module.exports = {
  theme: {
    extend: {
      colors: {
        background: '#F9F9F9',
        'background-lighter': '#FBFBFB',
        surface: '#FFFFFF',
        ink: '#262626',              // primary text — use with opacity utilities for secondary/muted
        border: {
          faint: '#EDEDED',
          muted: '#E8E8E8',
          loud: '#E6E6E6',
        },
        brand: {
          DEFAULT: '#FA5D19',        // --heat-100
          90: '#FA5D19E6',
          48: '#FA5D197A',
          24: '#FA5D193D',
          12: '#FA5D191F',
          8: '#FA5D1914',
          4: '#FA5D190A',
        },
        accent: {
          amethyst: '#9061FF',
          bluetron: '#2A6DFB',
          crimson: '#EB3424',
          forest: '#42C366',
          honey: '#ECB730',
        },
      },
      fontFamily: {
        sans: ['Suisse Int\'l', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontWeight: { normal: '400', medium: '450', semibold: '500' }, // no 600/700 in source system
      letterSpacing: {
        tightest: '-0.52px',  // hero H1
        tighter: '-0.4px',    // H2
        tight: '-0.24px',     // H3/card titles
        snug: '-0.1px',       // large body
        normal: '0.14px',     // body default
        wide: '0.8px',        // uppercase micro-labels
      },
      borderRadius: {
        DEFAULT: '8px',   // cards, inputs, panels
        lg: '12px',        // large surfaces/modals
        pill: '999px',     // buttons, badges, tabs
      },
      maxWidth: { container: '1112px' },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0, 0, 0.2, 1)', // ease-out — dominant curve
      },
      transitionDuration: { DEFAULT: '200ms', fast: '150ms', slow: '400ms' },
      boxShadow: {
        card: '0 40px 48px -20px rgba(0,0,0,0.02), 0 32px 32px -20px rgba(0,0,0,0.03), 0 16px 24px -12px rgba(0,0,0,0.03), 0 0 0 1px rgba(0,0,0,0.03)',
        'card-sm': '0 8px 16px -8px rgba(0,0,0,0.06), 0 2px 4px -2px rgba(0,0,0,0.03)',
        'btn-primary': 'inset 0 -6px 12px 0 rgba(249,28,25,0.2), 0 2px 4px rgba(250,93,25,0.12), 0 1px 1px rgba(250,93,25,0.12), 0 0.5px 0.5px rgba(250,93,25,0.16), 0 0.25px 0.25px rgba(250,93,25,0.2)',
      },
    },
  },
};
```

## Where inferred rather than measured

- Exact hero H1 desktop px (52–60px range) — the tokens table shows discrete computed values but doesn't tie them to specific breakpoints/elements; screenshot proportions were used to disambiguate.
- Desktop header horizontal padding value (`px-56` Tailwind class name, unclear rem mapping in this custom config).
- Button height/padding in px — read visually from screenshots, not present in the numeric token data.
- Which specific radius (`10px` vs `12px`) belongs to which exact component class — frequency data doesn't label components, inferred from screenshot cross-reference.
- Suisse Int'l is a licensed commercial font; Tailwind config above names it directly but a real rebuild needs a close free substitute (e.g. "General Sans", "Inter Tight", or "Geist Sans" for the sans stack) unless the font is licensed.
