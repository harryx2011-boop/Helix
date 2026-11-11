# Firecrawl site UI study (home, pricing, playground)

Date: 2026-11-11. Purpose: layout patterns with real measurements, so Helix can plan a UI revamp that borrows structure and keeps its own identity.

Scope and rules followed: patterns only (structure, spacing, type scale, component anatomy). No colors, logo, flame mark, illustrations or copy are proposed for reuse; color values are recorded only for contrast and proportion notes. No fonts, logos or illustrations were downloaded. Docs, llms.txt, Alexandria page and blog are out of scope (another agent).

Evidence folder: `D:\scratch\helix-revamp\firecrawl-site\` (scripts `capture.mjs`, `sections.mjs`, `pricing-detail.mjs`, `mobile-bench.mjs`; raw measurement JSON `home-1440.json`, `sections-desktop.json`, `pricing-detail.json`, etc.; 61 PNGs). 10 page loads in total, signed out, headless Chromium (Playwright 1.62.1 from `D:\Helix\node_modules`, Chromium r1248). No sign-up, no form submits.

Honesty notes: every number marked "m" below came from `getComputedStyle` / `getBoundingClientRect` in the scripts; "est." means read off a screenshot. Hover colors of nav links and buttons did not change in computed style on the elements I targeted, so hover states are mostly NOT measured (see Motion).

---

## 1. Global frame (all three pages)

| Item | Value |
|---|---|
| Frame | One centered column: `--container-width: 1112px` (m), `1144px` with padding. At 1440 it spans x 164 to 1276 with 1px vertical hairlines on both edges (`border-x`). Outside the column a fainter 100px cell grid with dot centers is visible on the hero only. |
| Hairline | 1px solid `#EDEDED` (m, token `--border-faint`; 476 border uses on the home page, all of them this one color). Other tokens: `--border-muted #E8E8E8`, `--border-loud #E6E6E6`. A second hairline, black at 5% alpha, appears on small inner cards. |
| Page background | `#F9F9F9` (m, p3 0.976). Surface `#FFFFFF`. Ink `#262626`. |
| Accent | `#FA5D19` ("heat-100"), plus a tint ramp at 4/8/12/16/20/24/40/48/90 percent alpha. Used for: one word in each headline, links, primary buttons, chips, selected states. Five other accent tokens exist (amethyst, bluetron, crimson, forest, honey) but barely appear. |
| Muted text | Ink at alpha steps: 72%, 64%, 56%, 48%, 40%, 32% (all measured in use). 64% is the standard secondary text. |
| Announcement bar | y 12 to 52, inset 12px from top, x 176 to 1264 (width 1088), 40px tall, full accent fill, white 14px text with underlined links. Page chrome begins at y 64. |
| Header | Sticky. 100px tall on load (y 64 to 164, hairlines top and bottom), 72px once stuck (m at 390 and seen at 1440: bar bottom at y 72). Contents: logo left (x 220), center nav `Products, Resources, Pricing, Docs, Blog, Playground` at 16px, then a GitHub-star counter and a `Sign up` button right. Nav items are 32px tall hit areas, gaps about 8px. |
| Section divider | A mono label band: `[ 01 / 07 ] · MAIN FEATURES`, 12px GeistMono uppercase, the current number in accent, the rest at about 16 to 32% alpha, inside a half-width bordered cell (x 164 to 720). Band block is 245px tall including empty cells above and below. Seven of them on home (7 x 245 = 1,715 px of 18,248). Pricing has four (`[ 02 / 04 ] · COMPARE PLANS`...). |
| Section header | Centered stack: eyebrow chip, H2, grey sub. Eyebrow is `// icon Label \\` (12px/450, flanking slash marks at 16% alpha, a 1px underline hairline below). Measured on the benchmark section: eyebrow at +159px, H2 at +195, sub at +327, first cards at +509 (header block about 509px tall). |
| Crossing marks | Small four-point marks sit at frame corners and at hairline intersections (seen at x 164 and 1276 on every divider). Not measured, size est. 8px. |
| Footer | Hairline-framed cells: brand cell (left half) with logo, one-line tagline and an ASCII plume; right half: two 138px cells (`Backed by`, certification badge) over a 2x3 social link grid (each link row 51px tall); then a 4-column link grid (cell width 278px, header row 75px, link rows 51px, 14px text); a bottom legal row with 4 cells, status dot and two empty pill-outline cells as decoration. |

## 2. Type and spacing (measured)

Families: `suisse` (sans, with fallback stack), `GeistMono` (labels, code, numbers), `Roboto Mono` (the ASCII art, set at 8.274px at desktop, 5.5px at 390). Weights used: 400, 450 (very common, a variable font), 500.

| Role | Desktop 1440 | Mobile 390 |
|---|---|---|
| Hero H1 | 60px / 64px, 500, letter-spacing -0.3px | 36 / 40, -0.36px |
| Section H2 (big) | 52 / 56, 500, -0.52px | 30 / 34, -0.3px |
| Section H2 (secondary) | 40 / 44, 500, -0.4px | 30 / 34 |
| Pricing H1 | 52 / 56 | 30 / 34 |
| Playground H1 | 32 / 36 | 30 / 34 |
| Pricing H2 | 24 / 32, 500 | 24 / 32 |
| Bold-lead card sentence | 20 / 28, 400 (lead words ink, rest 64% alpha) | est. 18 to 20 |
| Body | 16 / 24, 400 | 15 to 18 |
| UI text / links | 14 / 20, 400 or 450 | 15 to 16 |
| Card eyebrow label | 13, 450, 64% alpha | 13 |
| Small / table | 13, 400 | 12 to 13 |
| Mono label / chip | 12, 400, GeistMono (uppercase for dividers) | 12 |
| Menu chip | 11, 450 | |
| Mini caps (playground groups) | 10, 500, uppercase | 10 |

Spacing scale in use (m): 4, 6, 8, 12, 16, 20, 24, 28, 32, 40, 44, 48, 60, 64, 72. Mostly a 4px base. Card insides are generous and asymmetric: 60 top / 72 right / 48 or 60 bottom / 64 left.

Radii (m, count on home): `999px` (235, pills, chips, meters), `8px` (36, buttons, tabs), `10px` (20, primary buttons), `6px` (11), `16px` (10, floating illustration cards), `20px` (8, search card), `4px` (badges). Frame cells themselves have 0 radius.

Buttons (m): primary `36px` tall, radius 10, padding 8 / 12, 14px/450, accent fill, white text, inner glow shadow `0 -6px` accent at 20%. Secondary: same size, black 4% fill, ink text, no border. Header `Sign up`: 32px tall, radius 8, 6px padding, black 4% fill. Hero `Connect Firecrawl` split button: 40px tall, radius 10. Playground submit: 32px tall, radius 8. Segmented tab (small): 28px tall, radius 6 to 8, selected fill black 6%, 13px/450. At 390 the buttons become full width (320 to 322 x 40).

Containers (m): content max widths 736 (hero text), 704, 650 (H2 box), 820, 708 (playground), 1112 (frame). At 390 the framed column is 370 wide at x 10 (10px outer margin), inner content at x 34 (24px inset). `docW` equals 390: no horizontal overflow on any of the three pages.

## 3. Quoted measured style JSON (home page, 1440)

```json
{
  "viewport": {"w": 1440, "h": 900, "docH": 18248, "docW": 1440},
  "body": {"fontFamily": "suisse, \"suisse Fallback\", system-ui, ...", "fontSize": "16px", "fontWeight": "400", "lineHeight": "24px",
           "color": "color(display-p3 0.14902 0.14902 0.14902)", "backgroundColor": "color(display-p3 0.976471 0.976471 0.976471)"},
  "h1": {"fontSize": "60px", "fontWeight": "500", "lineHeight": "64px", "letterSpacing": "-0.3px", "w": 1080, "h": 128},
  "h2": {"fontSize": "52px", "fontWeight": "500", "lineHeight": "56px", "letterSpacing": "-0.52px"},
  "p":  {"fontSize": "16px", "fontWeight": "400", "lineHeight": "24px"},
  "header": {"position": "sticky", "h": 100, "borderBottom": "hairline drawn by wrapper cells, element border 0"},
  "families": ["suisse (632 text nodes)", "GeistMono (391)", "Roboto Mono (127, ASCII art at 8.274px)"],
  "fontHistogram_top": ["14px/400/GeistMono 326", "13px/400/suisse 150", "8.274px/400/Roboto Mono 127", "16px/400/suisse 119", "14px/400/suisse 98", "14px/450/suisse 78", "16px/450/suisse 55", "12px/450/suisse 43", "20px/450/suisse 13", "40px/500/suisse 12", "52px/500/suisse 9", "60px/500/suisse 2"],
  "borders": [["1px solid p3(0.9294)  = #EDEDED", 476], ["1px solid black 5% alpha", 18], ["1px solid accent", 4]],
  "radii": [["999px", 235], ["8px", 36], ["10px", 20], ["6px", 11], ["16px", 10], ["50%", 9], ["20px", 8]],
  "rootVars": {"--container-width": "1112px", "--container-gutter": "16px", "--heat-100": "#fa5d19ff",
               "--accent-black": "#262626ff", "--border-faint": "#edededff", "--border-muted": "#e8e8e8ff", "--border-loud": "#e6e6e6ff"},
  "motion": {"transitions_top": ["all 0.2s ease x154", "color/bg/border 0.2s ease x124", "color/bg/border 0.15s ease x35", "all 0.4s ease x27"],
             "keyframes": ["spin 1s linear infinite x2", "spin(-reverse) 32s / 30s / 10s linear infinite", "pulse 0.5s", "illuminate 7s cubic-bezier infinite", "ai-chats-realtime-indicator 3s ease infinite"],
             "canvases": 33, "pre": 10}
}
```

Contrast notes (computed from the measured colors on `#F9F9F9`): ink 14.4:1; secondary text at 72% alpha 5.9:1, 64% 4.6:1, 56% 3.6:1, 48% 2.9:1, 40% 2.3:1, 32% 1.95:1; accent text 3.0:1; white on accent fill 3.2:1.

Proportion note: the page is about 90% neutral (`#F9F9F9` ground, white cards, ink text), accent used as the only chroma. The full-bleed accent band (Alexandria section) is the single large chroma area.

---

## 4. Section order

### Home (1440: 18,248px tall; 390: 22,111px)

1. Announcement bar (y 0 to 64): one-line promo, accent fill.
2. Header (100px, sticky).
3. Hero (y 64 to 1197, 1,133px): pill badge ("2 Months Free - Annually" with a dark arrow dot), H1 two lines (second line accent), 16 to 18px sub with an inline highlighted chip, CTA pair (primary plus a split "connect" dropdown button with 3 overlapping round logos), then an input card (552 x 113, radius 20, white, 44px soft shadow) with a Search / Scrape / Map / Crawl segmented control and a submit arrow button. Backdrop: 100px cell grid with dot centers, mono corner tags (`[ 200 OK ]`, `[ SCRAPE ]`, `[ .JSON ]`, `[ .MD ]`), an ASCII plume. Below the fold edge, an empty browser-window outline illustration.
4. Logo strip (128px): left cell "Trusted by 150,000+ companies" (242 wide), then logo cells about 203 wide in one hairline row; the hovered/active cell gets a dark underline and a small corner arrow.
5. `[01/07] MAIN FEATURES` divider.
6. "Start searching today" (2,207px): eyebrow `Developer First`, H2 52/56 with one accent word, sub; three endpoint cards (Search, Scrape, Interact with a NEW badge; 370 wide, about 254 tall; centered dotted icon, title, 2 line description, "Learn more" link; the active card is lifted: white fill, radius about 20, soft shadow); a language tab bar (Python, Node.js, cURL, CLI, `Copy code` right); a two-pane block with line-numbered code left and `[ .JSON ]` output right, both with window-dot headers; H2 40/44 "Easily connect with your AI agents" and two bordered code cards (tabbed prompt / MCP / CLI card and a curl card), each followed by an accent text link.
7. `[02/07] CORE` divider.
8. "Fast, reliable, token-efficient" (1,865px): the benchmark section, detailed in pattern P5. Four framed cells in a 2x2 grid.
9. `[03/07] FEATURES` divider.
10. "We handle the hard stuff" (2,748px): eyebrow with a toggle icon, H2, then a 2-column grid of framed cells (548 wide), each with eyebrow label, bold-lead sentence and an animated mini-illustration under it (document parse, smart wait, a user -> Firecrawl -> index diagram, etc.), plus a vertical tab list ("Deep research, Smarter AI chats, AI agent tools, Onboarding, Lead enrichment") on the use-case section.
11. `[04/07] USE CASES` divider, then "Transform web data into AI-powered solutions" (1,256px): H2, sub, a centered primary button, then a master/detail block: left vertical list of use cases (active one tinted with 4 to 8% accent and a 2px accent left border), right a live-looking result panel (search field, "Found 2,747 results", rows with counts) and a customer-quote strip with a logo tile.
12. `[05/07] ALEXANDRIA` divider and a full-bleed accent product band (560px, 96 padding top/bottom, ASCII texture on the accent ground, white H2 and a white button), plus a 158px stat strip (description list: indexed sources, providers...). Pattern only; the page itself is out of scope.
13. `[06/07] TESTIMONIALS` divider and "People love building with Firecrawl" (887px): eyebrow and H2 sit off-center left; below, two rows of quote cells (about 360 wide, avatar + name + handle header row, quote body), rows offset against each other and clipped by the frame (a marquee; direction not observed).
14. CTA band (416px): eyebrow, H2 "Ready to build?" (about 40px), 2 line sub, primary + secondary buttons, a muted "Are you an AI agent? See setup options" link; flanked by two ASCII figures inside 100px cell grids with mono corner tags (`[ SEARCH ]`, `[ SCRAPE ]`, `[ INTERACT ]`, `[ CRAWL ]`).
15. `[07/07] FAQ` divider, FAQ (2,929px): two columns, section title left (sticky-looking), accordion rows right (x 720 to 1276), 65px tall single-line rows, 89px for two-line, 14 to 16px text, chevron right, hairline between rows; group sub-headings ("How It Works") sit in a left cell.
16. Footer (1,897px).

### Pricing (1440: 10,687px; 390: 15,448px)

1. Bar + header.
2. Hero (y 163 to about 430): H1 "Flexible pricing" 52/56 with accent second word, sub, a muted "Are you an AI agent? See pricing" link; ASCII dot field behind.
3. Credit slider module (y 430 to 672, 242px tall, padding 24 / 48 / 20): big number `100,000` at 40/44 with a "credits/month" caption, a 1016px wide, 8px tall track with accent fill and a round thumb (about 24px, soft accent halo), ticks at 1k / 5k / 100k / 500k / 1M / Custom each with the plan name under it (Free, Hobby, Standard, Growth, Scale), a one-line accent summary ("Standard: $83/month") and a grey billing note.
4. Currency row (about 48px): two empty pill-outline cells flank a `US USD` select pill (decorative stripes).
5. Plan grid, 4 columns (y 728, 625px tall, each cell 278.8 wide, 1px borders, no gaps): name (h3 16/450) and `Recommended` chip on the highlighted plan; 2 line description; credits line with a coin icon; price block (about 40px figure + "/month"); a `Billed yearly` toggle with an accent "Save $198" chip; a button; then feature rows (54 to 73px tall) with a round check icon and dotted-underline tooltips on the numbers. The highlighted plan has a 4% accent tint and the only accent button; others use grey buttons.
6. Scale / Enterprise row: a 3-column row, left cell explains the plan (24px heading, body, accent contact link), middle and right cells repeat the plan-card anatomy; Enterprise shows "Custom" at about 40px and no toggle.
7. Pay-as-you-go block: coin icon + 24/32 heading, body, accent link with an arrow.
8. "Pricing at a glance" (588px): a definition list, term column at x 228 (about 208 wide), definitions from x 436, 16/24, the plan prices repeated as plain text, a dated footnote at the bottom.
9. API Credits (764px): a table of per-endpoint costs.
10. `[02/04] COMPARE PLANS` divider and Compare Plans (2,244px): five grouped tables (Limits and Performance, Team and Access, Support, Billing and Usage, Security and Compliance), six plan columns.
11. `[03/04] TESTIMONIALS`, `[04/04] FAQ`, footer, same as home.

### Playground (1440: 2,800px; 390: 3,690px)

Signed-out visitors get the full playground UI. No redirect to sign-in happened at either width. I did not type or submit anything, so whether a run requires sign-in is unknown.

1. Bar + header.
2. Title block (202px): H1 "Playground" 32/36, one-line sub, flanked by two ASCII figures in grid cells.
3. Mode bar (118px): mini-caps group labels `DISCOVER`, `EXTRACT`, `CRAWL` (10px/500 uppercase, 11% opacity feel, est.) over a single segmented control with 5 modes (Search, Scrape, Parse, Map, Crawl), icon + label, selected = white pill.
4. Query card (about 646 wide, 219 tall, radius 20, white, soft shadow): query input with placeholder, a source-chip row (Web selected, News, Images | Developer, Research with a `Free` tag, Alexandria), an action row: two 32px icon buttons (settings, schema), `Get code` ghost button, primary `Start searching` (126 x 32, radius 8).
5. A 160px empty frame area where results will render, then the shared footer. The page is short: tool, then footer.

---

## 5. Pattern catalogue

### P1. Framed grid with crossing marks
- Anatomy: a 1112px column bounded by 1px `#EDEDED` hairlines left and right; every section is separated by full-width hairlines; every card is just a bordered cell inside the frame (0 radius, no gap, no shadow). Where hairlines cross, a small four-point mark is drawn. Outside the column, on the hero and CTA, a fainter 100px cell grid with dot centers and mono tags extends the idea.
- Measurements (m): border 1px `#EDEDED`; cells 548 wide in the 2-up grid (the 1112 column minus the center hairline), 278.8 wide in the 4-up plan grid, 360 in the 3-column menu.
- States: static. At 390 the frame narrows to 370 (x 10) with the same hairlines and the cells stack.
- Why it works: the grid is the decoration. It gives the page a "spec sheet" feel, makes alignment visible, and lets text-only cells look intentional with no card chrome.

### P2. Three-column mega-menu
- Anatomy (m, Products): a full-bleed panel (1440 x 642, bg `#F9F9F9`, no shadow, no border of its own) starting at y 165, directly under the header. Inside, three 360px columns (x 164, 540, 916; 16px gap) each with a 61px header row (label 14/400 at 64% alpha, padding 20 / 44, hairline below) and 1px side hairlines. Column 1 "Endpoints": 6 rows. Row anatomy: 20 x 20 dotted pixel icon (a `canvas`) at x +45, title 14/450 ink, description 14/400 at 64% (20px line height), optional chip row of 11/450 labels with an arrow glyph (about 14px tall), row height 103 with chips, 77 without. Column 2: "Data sources" (1 row + a NEW badge: 11/450 accent text on 8% accent fill, radius 4, padding 2 / 6) and "Surfaces" (5 rows). Column 3 "Featured": a solid accent card (white text, a small white chip with the section name, bold title, corner arrow) and a customer-story card (chip: accent text 12/450 on 8% accent, radius 6, padding 4 / 8; large logo mark; 24px-ish headline with one accent word; a footer row with an arrow, title, one-line sub).
- Resources menu: two 360px link columns (7 and 6 rows, same row anatomy, no chips) plus an "Open Source" column with an app tile, a short sentence and a "See Github" row.
- States observed: opens on hover (no click needed in my test); the open top-level item gets a grey pill (about 96 x 32, radius 8, black 6% fill); the page below the panel is dimmed with a grey overlay that starts exactly at the panel bottom (y 807 for Products, 749 for Resources). Panel height follows the tallest column (642 vs about 584).
- Responsive (390): the menu becomes a full-height list; each top-level item is a 72px tall bordered rounded cell, Products and Resources have chevrons (accordion), then GitHub count and a full-width `Sign up` (about 36px tall, radius 8). The toggle button turns into a close icon in a grey rounded square (about 32 x 32).
- Why it works: the panel reuses the page frame, so it looks like part of the page rather than a floating popover; row anatomy is identical everywhere so scanning is fast; the featured column gives marketing a slot without disturbing the nav list.

### P3. Eyebrow chip (icon + small label)
- Anatomy: `// [icon] Label \\` centered, 12/450 sans, the slashes 16% alpha, an icon about 18px in accent, a 1px hairline under it. Card-level variant: icon about 16px (grey) + 13/450 label at 64% alpha, top-left of a cell, followed 36px lower by the bold-lead sentence.
- Why it works: it labels what a section is in two words before the headline, adds a point of color, and costs 20px of height.

### P4. Bold-lead sentence
- Anatomy (m): one 20/28 sentence; the first clause in ink (`#262626`), the remainder in ink at 64% alpha, same weight (400) so only color differs; 396px measure inside a 548px cell (padding 64 left, 72 right); then an accent link 16/450 with a chevron 28px below.
- Why it works: it carries a headline and a body sentence in one block, so a cell needs no separate title, and the contrast alone does the hierarchy.

### P5. Benchmark meter rows and latency table
- Cell A (meters, m): 548 x 674 cell; top part eyebrow (y +59), 20/28 sentence (y +95), link (y +251); below it three rows, each 548 x 115 (padding 32 / 64, hairline top and bottom). Row: a 40 x 40 round icon tile (name text 16/400 at x +56), then a meter at x +220: a 264 x 40 pill track (radius 999, 2px inner padding, 1px hairline) containing a 36px tall fill pill (width 250 for 96%, 205 for 79%, 195 for 75%, so fill = pct of the inner width) and a 48 x 24 mono badge (13/500 GeistMono, `96 %`). The winning row's fill is accent with an ASCII-character texture and a white badge; the others are black 12% grey fills with 56% alpha ink badges.
- Cell B (table, m): a 548 wide cell with the same eyebrow + sentence; below a 49px header row (padding 14 / 64, 13px at 48% alpha: URL, Crawl, Scrape at x +64, +292, +412) and 40px rows (1px bottom hairline). URL cells split two tones: host at 32% alpha, path in ink. Numbers are ink with a `ms` suffix at 32% alpha. Rows scroll/update automatically (values differ between loads, e.g. 749 vs 765), with fade masks at top and bottom, and a 96px round white disc holding the brand mark and an ASCII plume sits over the bottom.
- Cell C (token efficiency, m): 548 x 281, padding 60 / 72 / 60 / 64; a header row with a URL and an accent mono token counter (`12,110 tokens`, 13/500 GeistMono), then 5 rows (55px, hairline between), each a mono tag (12px GeistMono, `<nav>`, `<h1>`, `<ads>`, `<p>`, `<footer>`) and an 8px tall pill bar (302, 160, 340, 269, 244 wide; accent fill for kept tags, grey for dropped ones).
- Cell D (open source): a repo-style header (avatar tile, `org/repo`, `Public` pill, star count in a pill with 5% black fill) over a list of PR rows (77px, two lines) that fade out toward the bottom, with an avatar stack disc (`+90`) overlapping the next cell.
- Responsive (390): cells stack one per row; meter rows shrink to 90px tall, the track narrows (about 175 wide est.); the table keeps three columns and scrolls rows vertically.
- Why it works: the proof is the layout. The same four-cell frame holds a chart, a table, a diff-like list and a repo card, so numbers and evidence replace adjectives. Pills with a shared 40px height make the meters read as one control family.

### P6. Chip links (menu and cards)
- Anatomy (m): 11/450 label, about 14px tall, no fill, text at 64% alpha, followed by a small diagonal arrow; they sit on one row under the description in a menu item (gap about 14px, e.g. `Web ↗`, `Developer Index ↗`). Filled variants: `New` badge (accent text, 8% accent fill, radius 4) and `Recommended` (12/450, 12% accent fill, radius 4, padding 2 / 6, 98 x 20).
- Why it works: gives deep links without adding rows.

### P7. Feature-cell with live miniature
- Anatomy: eyebrow + bold-lead sentence on top (about 150px), then a 70 to 230px tall mini UI (a browser window outline with dots and an address bar, a status pill such as "Parsing." or "Waits for key elements..." in 13px mono, a document with a `DOCX` tag) rendered in white or 72% white fills, radius 8 to 16, shadow `0 40px 48px -20px` at 2% black. Cell padding 60 / 72 / 48 / 64.
- Why it works: each claim is shown, not just stated, and all miniatures share one outline language.

### P8. Pricing table (plan grid plus slider)
- Anatomy (m): see section 4 pricing items 3 to 6. Slider: track 1016 x 8; big number 40/44; plan cells 278.8 x 625 with hairlines only; price 40px; toggle about 40 x 20 with accent fill; buttons 36px tall radius 10; highlighted column tinted 4% accent plus a chip; feature rows 54px (single line) or 73px (two lines).
- Detail table (m): `th` 46px tall, padding 12 / 16, 12px at 56% alpha, background `#FBFBFB`; `td` 45px tall, 14px at 72% alpha, hairline between rows; first column 220px wide with a right hairline and dotted-underline term labels (tooltips); unavailable cells show a grey en dash; Enterprise-only features show an accent check disc (about 14px).
- Responsive (390): plan cells stack full width (370 x about 600), the slider shrinks to about 320 wide with the same six tick labels (smaller text), the plan name rises to 18/26.
- Why it works: the slider lets visitors find their tier in one gesture; hairline cells keep a dense comparison readable; one tinted column is the only emphasis.

### P9. CTA band
- Anatomy: a 416px tall frame row split into three: left and right ASCII figures in 100px cell grids (with mono corner tags), center cell with eyebrow, H2 (about 40px), 2 line sub, primary + secondary 36px buttons, and a quiet text link. The primary has the inner-glow shadow.
- Why it works: the same centered stack as every section header, so it needs no new component.

### P10. Playground mode bar and query card
- Anatomy (m): group labels 10/500 uppercase above a 5 option segmented control; each option icon (dotted 20px canvas) + 14/450 label, selected = white raised pill with a light shadow, others transparent, thin dividers between options. Query card radius 20, 14px text, source chips 28px tall (radius 8, selected black 6% fill, 13/450), 32px primary button.
- Responsive (390): the segmented control collapses into a single `Search` dropdown button (about 40px tall) at the top of the card; the Web chip row is clipped at the card edge (see weak point 6) and the primary and `Get code` buttons go full width (about 32px tall, stacked).
- Why it works: grouping the modes by intent (discover, extract, crawl) teaches the product while you use it.

### P11. Accordion (FAQ)
- Anatomy: rows 65px (single line) or 89px (two lines), 14 to 16px/450 question, right chevron, hairline between; group heading in the left cell.
- Motion (m, scrollHeight): after a click the page grew +53px by 80ms and +185px by 680ms, so open settles in well under 700ms (likely the 0.4s `all` transition in the CSS histogram).

### P12. Footer
- Described in section 1: cells, not columns, so the footer keeps the frame.

---

## 6. Motion, in plain words

Measured from CSS (`getComputedStyle`, all elements): about 154 elements use `all 0.2s ease`, 124 use color / background / border transitions at 0.2s, 35 at 0.15s, 27 use `all 0.4s ease`, a few use opacity 0.2s or 0.5s, primary buttons transition scale and shadow at 0.1 to 0.2s, and 6 elements use a very short 0.05s (nav links). No spring or custom cubic-bezier on UI controls; ease only.

Keyframes: spinners at 1s linear infinite; ring/orbit rotations in the diagram at 10s, 30s and 32s linear infinite (one reversed); a 0.5s pulse; a 3s "realtime indicator"; a 7s `illuminate` cycle with a cubic-bezier curve (probably the glow on the hero art, not confirmed).

Observed in screenshots or interaction:
- Menus open on hover, and the grey overlay appears below the panel; duration not measured (a screenshot was taken after 900ms).
- FAQ accordion: described in P11, under 700ms.
- Benchmark table: rows scroll/update on their own, with fade masks; the numbers differ between two loads (e.g. 749 / 765 ms).
- Marquee-style testimonial rows clipped by the frame (two rows offset against each other).
- Spinner and status pills in the hero and miniatures ("Parsing.", "Waits for key elements...").
- Meter fill animation, counters counting up, and whether the ASCII art animates: NOT observed (I took stills, not frame sequences). The ASCII art is real text (127 text runs of Roboto Mono at 8.274px on home) plus 33 `canvas` icons; the texture inside the winning meter looked like the same characters, est. from screenshot.

Hover color changes on nav links and buttons did not appear in computed style on the elements my selectors reached (the matched elements were inner text spans), so I make no claim about them.

---

## 7. Weak or generic on their site (do not copy)

1. Accent contrast. Orange text on the off-white ground is 3.0:1 and white on the orange fill is 3.2:1 at 14px/450, both below the 4.5:1 AA floor for small text. Links, chips and primary buttons all use it.
2. The muted text ramp goes too far. Units (`ms`), URL hosts, mono labels and the divider numbers sit at 32 to 48% alpha, 1.95 to 2.9:1.
3. One recipe repeated six times (eyebrow chip, 52px headline with an orange word, grey sub). Every section opens the same way, so nothing leads. The `[0X/07]` divider bands add 245px each, 1,715px of mostly empty cells (about 9.4% of the page) and 22,111px at 390.
4. Dead space in frame cells: large blank hairline cells between sections read as loading gaps, not design (see `home-1440-vp2.png`, `home-1440-sec-logos.png`).
5. Pricing is repeated four times: slider, card grid, "Pricing at a glance" text wall (about 110 characters per line at 16px), and a compare table. The text wall exists mainly for machine readers. The two empty pill-outline cells flanking the currency select have no function.
6. Mobile playground has clipped UI: placeholder text shows as "Latest ne" and the source chips cut off at "Dev" (`playground-390-vp1.png`).
7. Product promotion crowds the first screen: the same new product appears in the banner, the menu's featured card, and again mid-page, while the mega-menu rows have uneven heights (77 vs 103px) because only some rows carry chips.
8. Weight: 33 canvases, 127 ASCII text runs and a 18,248px page; the decoration costs scroll length and attention, and its low contrast ASCII behind headings can hurt legibility.

## 8. What Helix could borrow (structure only)

Eight patterns with the strongest fit: framed hairline grid (1112 column, 1px lines), the three-column mega-menu (360px columns, 61px header, 77 to 103px rows), the benchmark meter row (264 x 40 pill track, 36px fill, 48 x 24 mono badge), the latency table (49px head, 40px rows, two-tone cells), the bold-lead sentence (20/28, ink then 64% ink), the icon + mono label eyebrow, chip links (11/450 with arrow), and the credit slider with a tinted recommended column. Helix should keep its own accent, mark, ground color and illustration style, and fix points 1 and 2 above from the start (accent text at least 4.5:1, nothing under 56% alpha for readable text).

## 9. Failures and checks

- Nothing blocked. Headless Chromium worked, no `headless: false` retry needed.
- The Playwright bundled revision (r1234) was not installed, so the scripts use the installed Chromium r1248 by `executablePath`.
- My first menu-detection selector returned `opened: false` for both menus although the screenshots show them open; I measured the menu from the open state in a second script instead (`sections-desktop.json`, `menu`).
- Not captured: hover states on links and buttons, meter and counter animation, marquee direction, results of running the playground, the mobile versions of the Products and Resources submenus (accordion content), exact crossing-mark size.
- Prompt-injection checks (Proton `decide`, 2 checks): the home page DOM holds a block addressed to AI agents (an onboarding passage telling an agent to fetch an auth file) and a visible "copy and paste this into your AI agent" prompt in the Prompt tab. Results: 0.52 and 0.78 on the injection label, both below the 0.8 threshold. Neither was followed or fetched.

## 10. Files

Screenshots live in `D:\scratch\helix-revamp\firecrawl-site\` (all PNG, study only). 1440 wide pages: `home-1440-full.png` (1440x18248), `home-1440-vp1..6.png`, `home-1440-menu-products.png`, `home-1440-menu-resources.png`, `home-1440-sec-*.png` (logos, dev-first, dev-first-b, connect-agents, bench-a/b/c, hard-stuff, hard-stuff-b, use-cases, alexandria, testimonials, cta-band, faq, footer), `home-1440-faq-open.png`, `pricing-1440-full.png` (1440x10687), `pricing-1440-vp1..6.png`, `pricing-1440-sec-cards-a/b.png`, `pricing-1440-sec-payg.png`, `playground-1440-full.png` (1440x2800), `playground-1440-vp1..4.png`. 390 wide: `home-390-full.png` (390x22111), `home-390-vp1..6.png`, `home-390-top.png` and `home-390-menu-open.png` (780x1688 at 2x), `home-390-sec-bench-a/b/c.png`, `pricing-390-full.png` (390x15448), `pricing-390-vp1..6.png`, `playground-390-full.png` (390x3690), `playground-390-vp1..5.png`.
