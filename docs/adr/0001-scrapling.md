# 0001. Merge Scrapling into Helix as a new `helix-scrape` service

Status: accepted (Harry, 2026-10-30). Phase 0 spike complete; build starts at Phase 1.
Branch: `v3-scrapling`. Target: v3.0.0.

## Context

Helix 2.3.2 fetches through a ladder (plain, tls, lightpanda, chromium, camoufox). Its own audit
(`research/research_notes/Helix anti bot scraping 2026/helix_pipeline_audit.md`) found:
the browser tier has no stealth (`navigator.webdriver` true, `HeadlessChrome` user agent, no
`window.chrome`, 0 plugins), `plain` is a bot signature, and cookies and clearance are discarded.
Scrapling (github.com/D4Vinci/Scrapling, BSD-3) offers a curl_cffi fetcher, a patched stealth
Chromium with a Cloudflare solver, adaptive selectors, spiders and network capture.

## Decision

1. New Python service `helix-scrape` beside `helix-extract`. Scrapling is a pinned pip dependency
   and is required, not optional.
2. The Rust `apps/fetch` service is retired.
3. Browser rung: Scrapling's stealth Chromium replaces the chromium rung. The patched browser is
   always used. The Cloudflare solver runs only when a request sets `solveCloudflare: true`.
4. Screenshots, actions and interact sessions stay on Helix's Playwright pool.
5. Lightpanda and camoufox are dropped.
6. The API owns per-host sessions (cookies, winning tier) in Postgres; `helix-scrape` is stateless.
7. Crawling is a merge: Helix's engine stays, Scrapling's templates, link rules and proxy
   rotation are added.
8. New options on existing calls; no new public endpoints.

## Phase 0 findings (pinned: scrapling 0.5, curl_cffi 0.17.0, patchright 1.64.3, Python 3.12)

| Check | Result |
|---|---|
| `DynamicFetcher` | **Absent in 0.5.** `scrapling.fetchers` exports `Fetcher`, `AsyncFetcher`, `FetcherSession`, `StealthyFetcher`, `StealthySession`, `AsyncStealthySession`. No non-stealth browser. Decision 3 follows from this. |
| Adaptive selectors, stateless | Works. `StorageSystemMixin` (`save`, `retrieve`) is pluggable; `Selector(..., adaptive=True, storage=<lru_cache-wrapped class>, storage_args=...)`. The storage class must carry `__wrapped__` (use `functools.lru_cache`). A signature saved in one request and seeded into a fresh one relocated the element after a rename of ids and classes at the default threshold. A larger redesign (tag and class change) scored 36% and needed `percentage=25`. |
| Pin a resolved IP | Works through curl_cffi `curl_options={CurlOpt.RESOLVE: ["host:443:ip"]}` on `Session(...)` (not listed in the signature, but accepted). Real IP: 200. Bogus pinned IP: timeout, so the pin is enforced. |
| Request capture | `StealthySession(record_requests=True)` then `session.network.search(limit=None)` returned 2 recorded requests for example.com. |
| Reuse Helix's Chromium | `executable_path` pointed at `ms-playwright/chromium-1248/chrome-win64/chrome.exe` worked. No 450 MB download. |
| Stealth markers (same Chromium) | Helix audit today: `webdriver` true, `HeadlessChrome/151`, `window.chrome` undefined, 0 plugins. `StealthySession`: `webdriver` false, `Chrome/156` UA, `window.chrome` object, 5 plugins. |
| Cloudflare solver | nopecha demo: without `solve_cloudflare` 403 "Just a moment..." in 2.4 s; with it 200 and 18 links in 121.9 s. The solve is slow, so it needs a timeout and stays opt-in. |
| PyInstaller | One-folder freeze, 152 MB, runs. Needs `--collect-all` for `scrapling`, `patchright`, `browserforge`, `apify_fingerprint_datapoints`, `curl_cffi`, `tld`. Without `apify_fingerprint_datapoints` it fails at run time (missing `input-network-definition.zip`). A frozen build drove the reused Chromium: 200. |

## Consequences and deviations from the plan

- **`/fetch` uses curl_cffi directly**, not Scrapling's `Fetcher`. The Rust contract needs manual
  redirect hops, a pinned IP per hop, the `set-cookie` lines and lowercase header names. Scrapling's
  `Fetcher` is a thin wrapper over curl_cffi and exposes none of that. Scrapling is used for the
  browser (`/render`), the parser, adaptive selectors, capture and templates.
- Chromium comes from the Chromium Helix already stages (`executable_path`), so the installer does
  not grow by 450 MB. The `scrapling install` download is not used.
- The browser rung always runs the patched browser. This changes the default fingerprint of
  Helix's browser fetches (Harry's call, 2026-10-30).
- `body` from the browser returned 2,373 bytes for example.com against 577 over HTTP; Phase 2 must
  compare `page.body` with the rendered HTML before extraction.
- `lru_cache` storage plus a per-request key is a workaround for a library rule; pin the version
  and cover it with a test so an upgrade that changes it fails loudly.

## Risks left

- The solver's 2 minute worst case needs a hard request deadline and a clear `challenge` failure.
- Chromium 1248 is what `ms-playwright` has today; staging must pin the build Helix ships.
- Scrapling 0.5 is young; the pin is exact and upgrades are deliberate.
