Status: BUILDING (2026-11-18)

# Helix stealth ladder, Rust tls core, Firecrawl Local response

Harry, 2026-11-18: "find my helix repo and analyze - pull open items, doc items, and backlog items and dedicate this session to doing all - spin up a agent 37 vm", with a 16-question interview weighted to stealth browsing. Trigger: Firecrawl Local (firecrawl/firecrawl `apps/local`, v0.1.1, released 2026-11-18, AGPL-3.0, Rust).

This plan supersedes, for Helix only:
- the 2026-11-12 decision "Helix moves to SearXNG plus CX-Obscura only" (`context.md`, top entry): Obscura is removed and its useful engine parts move into the `tls` and Chromium rungs (answer 1);
- ADR 0001's "helix-scrape replaces the Rust fetch" for the `tls` tier: the Rust core returns (answer 13); helix-scrape keeps browser rendering;
- Phases 0-2 of `2026-11-11-helix-v3-revamp.md`, folded in below. Its Phases 3-6 stay as written, amended by answer 14.

Evidence: `docs/research/2026-11-16-stealth-browsing.md` (36 repos, detection layers, test set), `docs/audits/2026-11-11-*.md`.

## Harry's 16 answers (2026-11-18)

| # | Topic | Answer |
|---|---|---|
| 1 | Engine | "remove obscura - merge engine and capabilities into our tls and chromium" |
| 2 | Chromium rung | Headed real Google Chrome, window off-screen, persistent profile per host, no injected identity (patchright's own advice) |
| 3 | Top fingerprint rung | Camoufox, as `camoufox server` in its own process, automatic when installed |
| 4 | Node pool | `rebrowser-playwright` (npm alias), `addBinding` mode; page-world overrides removed one at a time unless a detector page proves one is needed |
| 5 | Clearance cookies | Postgres `host_sessions` (migration 016): cookies, exact UA and winning tier per host, keyed by host + proxy + tier + profile |
| 6 | Real-browser rung | A dedicated Chrome profile (own `--user-data-dir`, no main accounts) attached through `remoteCdpUrl` |
| 7 | IP | Home IP with the existing per-host pacing. The VM is for tests and builds, not walled-site scraping |
| 8 | Robots | Stealth rungs (browser, camoufox, real) run only on URLs robots.txt allows, on every route including single `/scrape` |
| 9 | When | `auto` climbs into the stealth rungs on block evidence and remembers the host |
| 10 | Challenges | Auto-click a Turnstile-style checkbox once on a stealth rung, 20 s budget, then fail `challenge` with the time spent; the pass cookie is stored (answer 5) |
| 11 | Identity | Capture tool records real Chrome and Edge on this PC; used for `tls` headers and the Node pool. Headed Chrome and Camoufox inject nothing |
| 12 | Proof | Full test set (research doc section 5) from the home IP, real sites repeated on the Agent37 VM; dated JSON in `research/benchmarks/`; a change counts only if pages move fail to pass with no new failure in the 32-URL bench |
| 13 | Fast path | Rust `tls` core: restore `apps/fetch` from git (`9a2542b^`), fold in Obscura's transport, tracker blocking and raw streaming (Apache-2.0, credited) |
| 14 | From Firecrawl Local | Head-to-head benchmark; lazy services (start browser, extract and Camoufox on demand, stop when idle); `helix init` for Claude Code, Cursor, Codex, Gemini CLI and Windsurf. Not chosen: a Firecrawl v2 API layer |
| 15 | VM | Open a terminal to paste the Agent37 key (done 2026-11-18). Instance `helix`: template `agent37-ubuntu`, type `vm` (Docker and a desktop), 4 vCPU / 8 GB, auto-sleep 15 min |
| 16 | Push | Commit per step on `main`, push at each finished batch (the site redeploys). CI fixed first |

Fixed limits whatever the answers: no paid human CAPTCHA-solving service, no image CAPTCHA attempts, no log-in to accounts Harry does not own, no automated account creation. Firecrawl code is AGPL-3.0: studied, never copied.

## The ladder after this plan

| Rung | Runs in | Identity | Notes |
|---|---|---|---|
| `plain` | Rust `helix-fetch` | none | explicit only |
| `tls` | Rust `helix-fetch` (7401 dev) | Chrome JA4 + HTTP/2, captured headers | reuses `host_sessions` cookies and UA |
| `browser` | helix-scrape `/render` (7403 dev) | real Chrome, headed off-screen, profile per host | robots-gated; 20 s challenge budget |
| `camoufox` | `camoufox server`, pool remote connection | Camoufox's own (C++) | robots-gated; automatic when installed |
| `real` | dedicated Chrome profile over CDP | the profile's own | robots-gated; last resort |
| Node pool | `rebrowser-playwright` | captured profile | screenshots, PDF, actions, interact |

## Phases (one commit per step, test first, push per batch)

### Batch A: make it live
1. FetchClient splits the fetch and render addresses: `HELIX_RENDER_URL` (config `renderUrl`, default = `fetchUrl`). Today one address serves both, so `/render` lands on the Rust exe and 404s.
2. `apps/fetch` restored from `9a2542b^` and building; `helix-ensure.js` starts Rust on 7401 and helix-scrape on 7403 and gives the API both addresses.
3. An upstream 404 reports `not_found` with the upstream status, not `service_unavailable`.
4. A render past its deadline frees its slot.
5. Pin scrapling 0.5.1; record the venv's real Python version.
6. CI green.

### Batch B: stealth rungs
7. Robots gate for stealth rungs on every route.
8. `browser` rung headed Chrome: `channel="chrome"`, off-screen window, persistent profile per host, identity injection off.
9. Challenge click with a 20 s budget; `challenge` failure carries `challengeMs`.
10. Ladder registry: rungs `camoufox` and `real` added as registry entries (no new `if` chain); `auto` climbs on block evidence; tier memory remembers stealth rungs.
11. Camoufox rung (process supervisor, pool remote connection, boot probe).
12. Real-browser rung (dedicated profile launcher, `remoteCdpUrl`).
13. Node pool on `rebrowser-playwright`; overrides pruned against bot-detector.rebrowser.net.

### Batch C: sessions and identity
14. Migration 016 `host_sessions`; `/render` cookies stored; `tls` replays them with the exact UA.
15. `packages/profiles/tools/capture.mjs`; captured Chrome and Edge profiles from this PC.

### Batch D: Rust core speed and Obscura parts
16. One connection per host and profile, kept alive; short public-only DNS cache.
17. Obscura parts: tracker blocking, sub-resource listing, raw binary streaming (credited in `NOTICE`).

### Batch E: proof and benchmark
18. Stealth proof runner over the research doc's section 5 set; dated JSON.
19. Head-to-head with `firecrawl-local` (separate binary) and the 32-URL bench; VM repeat for real sites.

### Batch F: Firecrawl Local take-aways
20. Lazy services: browser, extract and Camoufox start on first need and stop when idle.
21. `helix init` and `helix doctor`.

### Batch G: small items and docs
22. `TODO.md` small items: crawl `proxy` option, `notModified` on the wire, 304 link expansion, the two test monitors, `HELIX_STATIC_DIR` in the hook, dead `top-nav.tsx`.
23. Docs: `context.md` rotated under 24 KB, `DESIGN.md`/`FRONTEND.md` marked superseded, port 3410 in `ports.md`, CLAUDE.md VM section moved to Agent37, release 3.0.0 with changelog.

### Needs Harry (carried from the v3 plan)
- Amber ADR sign-off (v3 Phase 5).
- One of three design directions before any UI build (v3 Phase 6), shown on an artifact page.
- `.env.example` lines 41 and `HELIX_LIGHTPANDA_*` (a deny rule blocks edits to `.env.*`).

## Progress

| Step | State | Evidence |
|---|---|---|
| Interview | done 2026-11-18 | 16 answers above |
| Agent37 key window | opened 2026-11-18 | waiting on Harry's paste |
