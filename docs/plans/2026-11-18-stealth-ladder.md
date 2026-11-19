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
| Agent37 VM | done 2026-11-18 | `helix` = `8miggdoak6`, `vm`, 4/8, runs as root; repo by GitHub clone + git bundle; `agent37-mcp` run now creates its folder first (S26, uncommitted in that repo) |
| A1 render address | done `cd3f98c` | client tests S1-S3, config S4 |
| A2 Rust tls core restored, hook starts 7403 | done `35e07af`, `~/.claude` `205d5a2` | cargo release build 6m16s; `/render` live on 7403: quotes.toscrape.com/js 10 quotes |
| A3 404 as not_found | not needed | the 404 was the missing `/render` route on the Rust exe (audit line 80); A1 and A2 removed it |
| A4 hung render frees slot | done `dab3ac6` | pytest S5 |
| A5 scrapling 0.5.1 | done `42a7964` | pytest 149, ADR 0001 amended |
| A6 CI green | local green, GitHub pending | first wave pushed `5e3d5b4` (cargo fmt `18a50a6`, Cargo.lock tracked `79b3f54`, extract ruff 0.17.4 pin and fixes `736bd17`, OpenAPI 3.1 nulls `c971012`, workflow fixes `efd1818`, scrape ruff pin `d9d84ba`, Playwright browsers in the api job `5e3d5b4`); GitHub run 44398726607 then showed 5 Linux-only failures, fixed and verified (Linux VM or Node 22): scrape mypy `522d846`, extract path test `c342304`, SDK Blob named "undefined" on Node 22 `0c8aa27`, WebKit WebRTC leak and timeout regex (see B9b), api Dockerfile copies `.npmrc` and `pnpm-lock.yaml` (the image had no `playwright`). Not pushed yet |
| B7 robots gate | done `c19f2f4` | S13-S16 |
| B8 headed Chrome | done `d7f9f05` | npmjs headless 403 to headed 200; rebrowser red rows 3 to 1 |
| B9 challenge budget and retry | done `d7f9f05`, `c19f2f4`, `cd422e1` | pytest S8-S9, vitest S17-S22. Live 2026-11-18: scrapingcourse.com/cloudflare-challenge got the retry (solver about 16 s, not solved); the API had dropped `challenge_ms`, now `challengeMs` on the failure (S20-S22). nopecha.com/demo/cloudflare now redirects to /demo (no challenge), so it is no longer a test page |
| B9b WebKit WebRTC lock | done, uncommitted at the time of writing | Linux WebKit sent 4 STUN packets around the private-address guard (CI and Agent37 VM); `webRtcLockScript` in `browser/engines.ts` removes the RTC classes in WebKit contexts; VM after the fix: webkit test passes; S23-S24 |
| Go live | done 2026-11-18 | Harry's go; all 5 services (7400, 7401, 7402, 7403, 7440) restarted from `C:\devprojects\Helix`; hook `REPO` now `C:\devprojects\Helix`. Live: npmjs.com/package/express headed 200 (full page); google.com/search `robots_denied`; challenge see B9 |
| Full API suite on the VM | 117 of 119 files pass | VM job `j5f3e42d049`: the 2 failing files (12 tests, firefox and webkit, not installed on the VM) pass on the PC after installing Playwright 1.62.1's builds (chromium-1234, firefox-1538, webkit-2336), which the PC also lacked |
| CI agent changes | verified and committed | 32 files checked (17 of 25 extract files AST-identical, the rest lint-only), committed in 6 commits, pushed |
| B10-B13, C-G | not started | step 15 capture: `tools/capture/` already exists (capture.mjs, identity.mjs, 17 tests); extend it, do not rebuild it |

## Next session (stopped 2026-11-18 at Harry's "stop here")

State (2026-11-18, second session): the repo lives at `C:\devprojects\Helix` (D: copy is stale). All 5 services run from C: with the new code. `main` is pushed to `5e3d5b4`; the Linux CI fixes after it are local commits, push pending. VM tool: `node C:/devprojects/agent37-mcp/src/cli.ts <status|run|logs> --cwd C:\devprojects\Helix --json` (the VM shell has `pnpm` but no `npx`).

Order:
1. Push `main` and read the GitHub run (`gh run list -L 1`); the compose job is the one not reproduced locally beyond the install step.
2. Tilion ideas (research `docs/research/2026-11-18-tilion.md`; Harry: "we take their ideas ... apply to helix"): pick which to plan, first candidates a typed `content_ok` result with `expect_text`/`expect_url`, and a network-inspect report.
3. B10 ladder registry (rungs `camoufox`, `real` as registry entries; add them to `STEALTH_TIERS`), B11 Camoufox, B12 real Chrome profile over CDP (scrapling 0.5.1 `AsyncRemoteSession`), B13 `rebrowser-playwright`, C14 `host_sessions` (Tilion's versioned profiles, merge saves and login probe are worth folding in), C15 capture (extend `tools/capture`), D, E (proof runner; ComputeSDK's open benchmark suites are a candidate set), F, G.
4. A Cloudflare test page that still challenges: scrapingcourse.com/cloudflare-challenge (the solver did not clear it from the home IP).
