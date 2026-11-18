# 0006. Stealth ladder on Rust tls and real Chrome; Obscura removed

Status: Accepted (Harry, 2026-11-18)

## Context

- 2026-11-12: Helix was to move to SearXNG plus CX-Obscura only, dropping the `tls` and Chromium fallbacks.
- 2026-11-16 stealth study (`docs/research/2026-11-16-stealth-browsing.md`): Helix's `tls` tier already sends Chrome's JA4 and HTTP/2 settings (measured on tls.peet.ws); Obscura's stealth build changes only that layer and moved 0 of 9 blocked pages; sites block on headless mode, automation traces, fingerprint mismatches and IP reputation.
- 2026-11-11 timing audit: Rust `/fetch` warm p50 55 ms against 144 ms for Python helix-scrape; most of the gap is connection reuse.
- 2026-11-18: Firecrawl Local (AGPL-3.0, Rust, single binary) shipped; its plain fetch uses rustls (no browser handshake) and it sends blocked pages to Firecrawl Cloud.

## Decision

Harry's answers 1-16 in `docs/plans/2026-11-18-stealth-ladder.md`. In short:

1. Obscura is removed from Helix's plans; useful parts of its engine (Apache-2.0: transport, tracker blocking, raw streaming) are folded into the `tls` and Chromium rungs with credit.
2. The `tls` tier returns to Rust (`apps/fetch`, restored from `9a2542b^`). helix-scrape keeps browser rendering. The API reaches them at two addresses (`HELIX_FETCH_URL`, `HELIX_RENDER_URL`).
3. Ladder: `plain`, `tls`, `browser` (headed real Google Chrome, off-screen, persistent profile per host, no injected identity), `camoufox` (separate process), `real` (a dedicated Chrome profile over CDP). The Node pool moves to `rebrowser-playwright`.
4. Stealth rungs run only on robots-allowed URLs, climb automatically on block evidence, click a challenge checkbox at most once within 20 s, and run from the home IP.

## Consequences

- Two fetch implementations exist again for a while: the Rust service for `plain`/`tls`, and helix-scrape's `/fetch` (kept as a fallback until the Rust core matches its contract suite and the benchmark).
- CI needs the Rust job back; the desktop stage needs the Rust exe again.
- Headed Chrome uses the PC's CPU; renders go through the PC queue and the 75% cap.
- Supersedes the CX-Obscura part of the 2026-11-12 decision for Helix and the `tls` part of ADR 0001.
