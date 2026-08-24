# Helix — Design System & Character-Animation Motif

**Status:** specified, pre-implementation · **Date:** 23 August 2026

This is the canonical token source. The repo had no Tailwind config, no global stylesheet and no dashboard app when this was written, so nothing here is extracted from existing code — these values are the proposal to build against.

Companion documents: [FRONTEND.md](FRONTEND.md) for what is being built, [ARCHITECTURE.md](ARCHITECTURE.md) for the mechanics being visualised.

---

## 1. The job

A self-hoster runs `docker compose up`, opens `localhost:7400`, and needs three things: proof the instance works, an understanding of **why a request cost what it cost**, and enough operational visibility to leave it running.

That middle one is the opening. No competitor surfaces the fetch ladder as an inspectable object — Firecrawl's playground returns JSON and a URL, never the escalation reasoning. For a BYOK product where the user pays their own provider, "why did this take 2.4s instead of 5ms" is the question that actually matters.

So the animation motif exists to **explain the ladder**, not to decorate a loading state.

---

## 1a. The mark

`apps/dashboard/public/logo.svg` — three isometric plates descending from violet
(`#8B5CF6`) through deep violet (`#5B21B6`) to a blue-cast near-black (`#0B1220`),
with the wordmark in that same near-black.

Two things follow from it. The palette is **white, black and purple**, with the
purple owned deliberately rather than arrived at by default. And the plates'
descent — bright to dark — is reused as the tier scale, so the fetch ladder is
drawn in the logo's own values rather than a separate colour language invented
beside it.

## 2. Character set

Monospace box-drawing and block elements. No braille spinners — `⠋⠙⠹⠸` is the npm-CLI cliché and reads as an imported library rather than a mechanic worth watching.

| Class | Characters | Used for |
|---|---|---|
| Box-drawing, light | `─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼` | ladder rails, tree branches, frames |
| Box-drawing, heavy | `━ ┃ ┏ ┓ ┗ ┛ ┣` | the active tier only |
| Block elements | `░ ▒ ▓ █` | progress fill, ratio bars |
| Geometric | `● ○ ◆ ◇ ▸ ▹` | node markers |
| ASCII | `> . x [ ] = ~` | arrows, log lines |

Every one of these appears in `tree`, `htop` or `curl -v`. That is the register.

---

## 3. Frame sequences

Literal frames — paste into a fixed-width font to check alignment. Characters swap in place; nothing reflows.

### A — Fetch-ladder escalation

The signature animation. Real tiers, real reasons, real latencies.

```
Frame 0 (t=0ms)
┌─ plain ──────┬─ tls ─────────┬─ lightpanda ──┬─ chromium ────┐
│ ▸ trying...  │  ·            │  ·            │  ·            │
└──────────────┴───────────────┴───────────────┴───────────────┘

Frame 1 (t=80ms)
┌─ plain ──────┬─ tls ─────────┬─ lightpanda ──┬─ chromium ────┐
│ ● 403 5ms    │  ▸ trying...  │  ·            │  ·            │
└──────────────┴───────────────┴───────────────┴───────────────┘
  blocked (cloudflare-mitigated) → escalating

Frame 2 (t=180ms)
┌─ plain ──────┬─ tls ─────────┬─ lightpanda ──┬─ chromium ────┐
│ ● 403 5ms    │  ● 403 51ms   │  ▸ trying...  │  ·            │
└──────────────┴───────────────┴───────────────┴───────────────┘
  blocked (challenge-platform) → escalating

Frame 3 (t=260ms)
┌─ plain ──────┬─ tls ─────────┬─ lightpanda ──┬─ chromium ────┐
│ ● 403 5ms    │  ● 403 51ms   │  ○ 200 24ms   │  —            │
└──────────────┴───────────────┴───────────────┴───────────────┘
  content present → done, chromium skipped

Frame 4 (settled — no motion)
┌─ plain ──────┬─ tls ─────────┬─ lightpanda ──┬─ chromium ────┐
│ ● 403  5ms   │  ● 403  51ms  │  ● 200  24ms  │  ○ skipped    │
└──────────────┴───────────────┴───────────────┴───────────────┘
  resolved at lightpanda · 80ms total · 2 escalations
```

Legend renders as a visible one-line key, never left implicit:
`●` attempted · `○` skipped · `▸` in flight · `·` not yet reached

Colour is additive only. Every state above is legible in monochrome.

### B — Crawl frontier expanding

BFS discovery per host, from the real frontier mechanic.

```
Frame 0
● example.com/

Frame 1
● example.com/
├─▸ /pricing
├─▸ /docs
├─▸ /blog
└─▸ /about

Frame 2
● example.com/
├─● /pricing
├─▸ /docs
│  ├─▸ /docs/quickstart
│  └─▸ /docs/api
├─● /blog
│  └─▸ /blog/launch
└─○ /about        (queued, host at concurrency limit)

Frame 3 (settled)
● example.com/                     6/6
├─● /pricing                       ●
├─● /docs                          ●
│  ├─● /docs/quickstart            ●
│  └─● /docs/api                   ●
├─● /blog                          ●
│  └─● /blog/launch                ●
└─● /about                         ●
```

The `○` throttled state is shown honestly. When adaptive politeness is holding a host back, the UI says so rather than implying uniform progress.

### C — Extraction

Between fetch resolving and content rendering. Typically under 150ms, so two or three frames at most.

```
Frame 0
raw html  [██████████████████████████] 14.2kb
markdown  [                          ]

Frame 1
raw html  [██████████████████████████] 14.2kb
markdown  [████████████░░░░░░░░░░░░░░] extracting…

Frame 2
raw html  [██████████████████████████] 14.2kb
markdown  [██████████████████████████] 2.1kb  (trafilatura)
```

A real ratio, not fake progress. If extraction beats one animation tick, skip to frame 2.

### D — Idle / connecting

The only place a cycling glyph is permitted, and only where there is a genuine unknown wait with no discrete steps.

```
◇  connecting to localhost:7400
◆  connecting to localhost:7400
```

Cycles at 2 Hz. **Stops immediately on a known failure** — it never spins past an error, which is the dishonest-progress-bar problem this product exists to avoid elsewhere.

---

## 4. Where motion is allowed

| Surface | Motion | What |
|---|---|---|
| Playground, in flight | Yes | Sequence A, then C |
| Playground, settled | **No** | Frame 4, static |
| Jobs, crawl running | Throttled | Sequence B, staggered rows |
| Jobs, settled or failed | **No** | Static tree |
| Dashboard boot | Yes, one instance | Sequence D |
| Keys | **Never** | A credentials screen. Nothing moves. |
| Health | **No** | Values swap on poll; no animated counters |
| Nav and chrome | **Never** | Peripheral motion is intolerable on a screen stared at for an hour |
| Empty states | **No** | Nothing to depict |
| Error states | **No** | An error is settled; render it as one |

**The rule:** character animation is permitted only while a real, discrete operation is in progress, and stops the instant it resolves either way. Never ambient texture. Every animated frame must trace to an actual state transition in `escalation.ts` or `block-detection.ts` — not to "it needs to feel alive."

---

## 5. Tokens

### Colour

Derived from the logo (`apps/dashboard/public/logo.svg`) — a three-plate isometric stack in violet, deep violet, and a blue-cast near-black:

| Source | Hex | Role |
|---|---|---|
| Plate 1 | `#8B5CF6` | violet 500 — the accent |
| Plate 2 | `#5B21B6` | violet 800 — the deep tone |
| Plate 3 / wordmark | `#0B1220` | near-black, blue-cast — the ground |

White, black and purple, with the purple owned rather than defaulted into. The near-black is deliberately not neutral: `#0B1220` carries a blue cast that keeps the violet from looking stranded on a grey field.

```css
:root {
  /* Surface — built up from the logo's near-black */
  --color-bg:            #0b1220;
  --color-bg-raised:     #121a2b;
  --color-bg-overlay:    #182136;
  --color-border:        #232d44;
  --color-border-strong: #33405c;

  --color-fg:            #f2f4f8;
  --color-fg-muted:      #98a2b8;
  --color-fg-faint:      #5f6b85;

  /* Accent — straight from the mark */
  --color-accent:        #8b5cf6;   /* the mark's violet — fills, borders, glyphs */
  --color-accent-text:   #9d7bf7;   /* one step lighter, for accent-coloured TEXT */
  --color-accent-hover:  #9d75f8;
  --color-accent-deep:   #5b21b6;
  --color-accent-muted:  #2c1d52;
  --color-accent-fg:     #ffffff;

  --color-success:        #4ade80;
  --color-success-muted:  #14351f;
  --color-danger:         #f87171;
  --color-danger-muted:   #3d1a1a;
  --color-warning:        #fbbf24;
  --color-warning-muted:  #3b2c0c;

  /* Tier accents — the logo's own descent, bright violet to near-black.
     Distinction is by VALUE, not hue: one brand colour getting darker as the
     tier gets more expensive. Four competing hues would fight the mark. */
  --color-tier-plain:      #ddd6fe;  /* violet 200 — lightest, cheapest */
  --color-tier-tls:        #c4b5fd;  /* violet 300 */
  --color-tier-lightpanda: #a78bfa;  /* violet 400 */
  --color-tier-chromium:   #9061f9;  /* violet 500-ish — deepest that stays legible */
}

[data-theme="light"] {
  --color-bg:            #ffffff;
  --color-bg-raised:     #fafafd;
  --color-bg-overlay:    #f3f4f9;
  --color-border:        #e2e5ee;
  --color-border-strong: #c8cddb;

  --color-fg:            #0b1220;   /* the logo's own near-black */
  --color-fg-muted:      #55607a;
  --color-fg-faint:      #8b94a8;

  --color-accent:        #7c3aed;   /* violet 600 — one step down for AA on white */
  --color-accent-hover:  #6d28d9;
  --color-accent-deep:   #5b21b6;
  --color-accent-muted:  #ede9fe;
  --color-accent-fg:     #ffffff;

  --color-success:        #15803d;
  --color-success-muted:  #dcfce7;
  --color-danger:         #b91c1c;
  --color-danger-muted:   #fee2e2;
  --color-warning:        #a16207;
  --color-warning-muted:  #fef3c7;

  --color-tier-plain:      #9061f9;
  --color-tier-tls:        #8b5cf6;
  --color-tier-lightpanda: #7c3aed;
  --color-tier-chromium:   #5b21b6;
}
```

**Why value rather than hue for the tiers.** The mark already descends bright violet → deep violet → near-black. Reusing that descent means the ladder reads as one family getting heavier as it gets more expensive, which is the meaning being conveyed. Four separate hues would compete with the logo and imply the tiers are different *kinds* of thing rather than different *costs* of the same thing.

### Measured contrast

Computed, not estimated. Every figure below is against that theme's `--color-bg`.

| Token | Dark | Light |
|---|---|---|
| `fg` | 17.0:1 AAA | 18.7:1 AAA |
| `fg-muted` | 7.3:1 AAA | 6.3:1 AA |
| `fg-faint` | 3.5:1 UI only | 3.0:1 UI only |
| `accent` | 4.4:1 UI only | 5.7:1 AA |
| `accent-text` | 5.9:1 AA | — |
| `success` | 10.7:1 AAA | 5.0:1 AA |
| `danger` | 6.8:1 AA | 6.5:1 AA |
| `warning` | 11.2:1 AAA | 4.9:1 AA |
| `tier-plain` | 13.0:1 | 4.0:1 |
| `tier-tls` | 10.1:1 | 4.2:1 |
| `tier-lightpanda` | 6.9:1 | 5.7:1 |
| `tier-chromium` | 4.7:1 | 9.0:1 |

Three consequences worth stating rather than leaving implicit:

**The mark's violet is not a text colour on dark.** `#8B5CF6` measures 4.4:1 on `#0b1220`, below the 4.5:1 body-text bar. It stays the accent for fills, borders and glyphs; `--color-accent-text` at 5.9:1 is what accent-coloured *words* use. On white the accent steps to violet 600, because the mark's own violet manages only 4.2:1 there.

**The tier scale inverts between themes.** On dark it runs light → less light (violet 200 down to a mid violet); on white it runs mid → dark (violet 500 down to violet 800). Both preserve the meaning — heavier colour means more expensive tier — but "heavier" is lighter on a dark ground and darker on a light one. Keeping the same hex values in both themes would have made the deepest rung invisible on dark and the lightest invisible on white, which is exactly what the first draft of this palette did.

**`fg-faint` is UI and large text only.** At 3.5:1 and 3.0:1 it is for `·` placeholders, disabled states and dividers. Never body copy.

`--color-border-strong` is decorative. Anything needing the 3:1 UI bar — focus rings, error borders — uses `--color-accent`.

### Typography

```css
--font-mono: "Berkeley Mono", "JetBrains Mono", "IBM Plex Mono", ui-monospace,
             "Cascadia Code", "SF Mono", Menlo, Consolas, monospace;
--font-sans: "Inter", -apple-system, "Segoe UI", ui-sans-serif, sans-serif;
```

**The monospace stack is load-bearing.** Every frame above aligns only if box-drawing glyphs render at full cell width. Many fonts draw them narrower than alphanumerics, which silently breaks every diagram. Self-host Berkeley Mono or JetBrains Mono via `@font-face` rather than trusting OS fallback — on a machine without the primary font, the whole motif collapses into misaligned rubble.

`font-variant-ligatures: none` — ligatures corrupt the ASCII arrows.

Sans is for prose only. Every data-bearing surface is mono.

| Token | Size | Line-height | Weight | Use |
|---|---|---|---|---|
| `--text-xs` | 12px | 1.4 | 500 | captions, tier labels, timestamps |
| `--text-sm` | 13px | 1.5 | 400/500 | body, JSON, table cells |
| `--text-base` | 14px | 1.5 | 400 | default UI |
| `--text-lg` | 18px | 1.4 | 600 | panel headers |
| `--text-xl` | 24px | 1.3 | 600 | screen titles |
| `--text-2xl` | 32px | 1.2 | 700 | numerals in empty states |

### Spacing, radius, motion

4px base. Row rhythm `8px`, panel padding `16px`, section gaps `24px`. Dashboard density leans tight — this is a tool run by people who know it.

```css
--radius-sm:   4px;    /* inputs, buttons, badges, code */
--radius-md:   8px;    /* panels, modals */
--radius-full: 9999px; /* pills only */

--duration-instant: 100ms;
--duration-fast:    160ms;
--duration-base:    220ms;
--duration-slow:    320ms;
--easing-standard:  cubic-bezier(0.4, 0, 0.2, 1);
--easing-emphasis:  cubic-bezier(0.16, 1, 0.3, 1);
```

Two scalar radii, no third. Ladder frames have no CSS radius at all — the corners are literally `┌┐└┘`, which is the discipline: the frame is typographic, not a rounded div.

---

## 6. Motion rules

**8 fps (125ms/frame)** for ladder and frontier sequences. **2 Hz (500ms)** for the idle glyph.

These are deliberately slow. Every frame should be readable as a discrete state, not perceived as smooth motion. Faster character animation becomes wallpaper; slowing it down is what makes it informational.

- No sequence loops indefinitely. Each has a terminal frame.
- Past ~3s, an in-flight marker downgrades from 8 fps to 2 Hz — long waits should read as calm, not racing.
- **60ms stagger** between sibling rows. Never animate every visible row on the same tick.
- **One dimension per frame.** A glyph or a number, not both plus a colour shift.
- Hover lift 2–4px maximum, and never on the animation panels themselves — those are read, not clicked.

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .char-anim { animation: none !important; }
  .char-anim[data-state="pending"]::after { content: " (in progress)"; }
}
```

**Reduced motion removes the cycling, never the information.** Sequences A, B and C are state diagrams — every frame is legible as a still, so the settled frame renders immediately. Sequence D has no meaningful still, so it becomes static text with an `(in progress)` suffix carrying what the glyph swap would have.

Implemented as real CSS animations and state-driven re-renders, not GIFs, so the media query genuinely disables it.

---

## 7. Screens

### Playground

Split pane, request left (40%), result right (60%). Resizable, minimum 320px per pane, stacks under 768px.

Request: endpoint segmented control, URL input, then **Options collapsed by default** — the common case is one field and one button. Result: tabs for `Rendered` / `Raw JSON` / `Ladder`.

| State | Appearance |
|---|---|
| Empty | Centered `·`, "Run a request to see the fetch ladder and result here." No animation. |
| In flight | Sequence A plays live in the Ladder tab; other tabs say "waiting for tier resolution" rather than spinning separately |
| Success | Rendered content, raw JSON, settled ladder |
| Degraded | Amber banner carrying the literal `warnings[]` string; result still renders |
| Typed failure | Red panel: `reason` in mono uppercase, `detail` in prose, ladder frozen where it stopped, `detectedBy` as tags, and a **"Retry at next tier"** button when `escalationAvailable` |
| Deep-linked | Pre-filled, **auto-run off** — a shared link must not silently spend someone's provider budget |
| Stalled >3s | Marker downgrades to 2 Hz, muted line: "still waiting on plain tier — check your network or proxy config" |

### Jobs

Table: status glyph, endpoint, target, pages, started. Row opens a 480px right drawer so list context survives.

Running rows cycle `▸` staggered at 60ms. Completed is static. **Partial failure shows the gap explicitly** — "312/340 pages" with the missing 28 explained, never silently dropped. Cancelled shows where it stopped and links to the partial results that survive.

Loading uses `░` skeleton bars pulsing at `--duration-slow`, **not** the character motif. Skeletons mean "waiting for data to exist"; the motif means "watching a real process". Keeping those languages distinct matters.

### Keys

Flat table: name, prefix (`hlx_live_••••4f2a`), created, last used, rate limit, revoke.

**No animation anywhere on this screen.** A submitting button gets an opacity transition and inline text, nothing more.

A created key shows **once**, monospace, copy button, with a `--color-warning` border carrying "This is the only time the full key is shown." Closing without copying is allowed but cannot be accidental. Revoke is two-step.

A bootstrap key from the environment lists read-only, labelled as not revocable here.

### Health

Service cards first — the "is it up" answer above the fold. Operational detail below.

| State | Appearance |
|---|---|
| Healthy | `●` green, latency in mono, no motion |
| Degraded | `●` amber with the real reason: "rate-limit store unreachable — requests proceeding, not blocked". The fail-open behaviour made visible. |
| Down | `●` red, last-seen time, **manual "Recheck now"** — never an invisible auto-retry |
| Stale | Dashed faint border, "last updated 47s ago, refresh failed". Distinguishes known-bad from unknown. |

Values swap instantly on poll. No animated count-up — a number you check under pressure should never be obscured by a tween.

---

## 8. The ladder component

```
LadderDiagram
  tiersAttempted: Tier[]
  tierOutcomes: { tier, statusCode?, latencyMs, outcome, detectedBy? }[]
  finalTier: Tier
  totalLatencyMs: number
  state: "in-flight" | "settled"
```

**Every tier column always renders, including skipped ones.** Showing that Chromium was available and not needed is the cost claim made visible rather than asserted in copy.

Per-tier latency is always shown, not just the total — 51ms for TLS against 5ms for plain is the actual trade each escalation makes.

The reason line uses the **exact** `detectedBy` strings from `block-detection.ts` — `cloudflare-mitigated`, not a paraphrase — so someone debugging why their own site blocked Helix can grep the signal name in the source.

The settled summary is three numbers and no adjectives: `resolved at lightpanda · 80ms total · 2 escalations`.

A blocked tier strikes through in the **reason line only**, never the tier name. The tier was not wrong; the attempt was blocked.

---

## 9. Responsive

| Breakpoint | Layout |
|---|---|
| < 640px | Single column. Ladder reflows to vertical rows — `plain ● 403 5ms` — same glyphs, no information lost. Job detail becomes a route push, not a drawer. |
| 640–1024px | Split pane locked 50/50, no drag. Jobs drops the Started column. Health goes 2-up. |
| ≥ 1024px | Full spec: draggable panes, 4-up health, right drawer. |

The ladder's breakpoint is a **container query on 480px of panel width**, not a media query — dragging the result pane narrow on a desktop should reflow it too.

---

## 10. Accessibility

**Keyboard.** Tab order follows visual order. Ladder tabs are arrow-key navigable per the ARIA tabs pattern. `Cmd/Ctrl+Enter` submits from anywhere in the request pane. Modals trap focus; `Escape` returns focus to the trigger.

**Focus.** `2px solid var(--color-accent)` at 2px offset on everything interactive. Never `outline: none` without a replacement.

**Names.** Status glyphs carry `aria-hidden="true"` with the meaning in an adjacent label — "resolved, blocked, status 403". The glyph is decorative to a screen reader; the words are the content.

**Live regions.** Ladder and job updates announce on **state transitions only**, never per frame. An 8 fps live region would be unusable. The announced text is the settled sentence — "blocked at plain, escalating to tls" — decoupled from frame rate entirely.

---

## 11. Rollout

| Phase | Contents |
|---|---|
| **P1** | Playground plus the settled ladder diagram. Ships the visual language with no streaming plumbing. Failure cards and reduced-motion from day one, not bolted on. |
| **P2** | Live in-flight ladder. Needs tier-resolution events streamed from the escalation loop. Adds sequences C and D. |
| **P3** | Jobs and the frontier tree. Can ship as a flat list with status glyphs before the tree lands. |
| **P4** | Keys and Health. Lowest design risk, no animation dependency — last only because Playground and Jobs carry the distinctive value. |
