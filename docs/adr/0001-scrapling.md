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

## Phase 2 decisions (2026-11-01)

- **No `DynamicFetcher`, so the plan's "plain browser by default, stealthy only when asked" is
  replaced by this:** the `browser` rung always runs `AsyncStealthySession` (the patched Chromium;
  there is no unpatched one to fall back to). What stays opt-in is what a site would notice:
  `stealth: true` adds canvas noise, a WebRTC lock and a search-engine referer, and
  `solveCloudflare: true` runs the solver. Neither is on by default and `stealth` never solves a
  challenge. robots.txt checks and per-host pacing are unchanged. Docs carry Scrapling's
  disclaimer: respect each site's terms of service and robots.txt.
- **Ladder `plain, tls, browser`.** The browser rung calls helix-scrape `/render`, unless the
  request needs what only Playwright gives (screenshot, PDF, actions, a phone or custom viewport,
  dark mode, a non-Chromium engine); then it renders on the API's Playwright pool. A named
  `profile` also goes to the pool, which applies it (the patched browser presents its own
  identity), and so does every render when the operator set `remoteCdpUrl` or a non-Chromium
  `browserEngine` (review fix, 2026-11-01). Crawl sessions pin a profile, so a crawl's browser
  rung renders on the pool. `stealth` or `solveCloudflare` that cannot apply (pool render, or an
  explicit `plain`/`tls` tier) is reported in `warnings`. That choice is
  a capability of the rung, not a tier. `chromium` is accepted as the old name of `browser`;
  `lightpanda` and `camoufox` are removed and run as `browser` with a warning, not a 400.
- **The private-address guard for the browser is a loopback proxy** (`helix_scrape/guard_proxy.py`).
  Measured: a Playwright page route does not see redirect hops (Chromium followed a 302 to
  `localhost` and served it while the route saw only the first URL). Every browser connection
  goes through the proxy, which resolves once, refuses a private answer and connects to the
  checked addresses, as `/fetch` does per hop. The page host is checked before a browser starts
  and the final URL after. With a caller proxy the target is resolved by that proxy, as on
  `/fetch`, and only the literal checks apply. WebRTC's UDP (STUN) goes around any HTTP proxy,
  so the WebRTC lock (`disable_non_proxied_udp`) is on whenever the guard or a caller proxy is,
  not only with `stealth` (review fix, 2026-11-01). The API's Playwright pool still guards with a
  route, so it has the redirect gap this proxy closes; that is open (not changed in Phase 2).
- **One browser per render**, closed after it, capped by `HELIX_SCRAPE_MAX_RENDERS` (default 2).
  Each render runs in a worker thread with its own Proactor loop: uvicorn runs a Selector loop on
  Windows (curl_cffi needs it) and that loop cannot start a subprocess. Measured: about 1.6 s for
  example.com through the browser, 2.0 s for a script-built page.
- **Hard deadline:** the whole render, the solver included, ends at the request timeout; an
  unsolved challenge fails as `timeout after <ms>ms (the Cloudflare challenge was not solved in
  time)`.
- **Headers come from the last main-frame document.** Scrapling pairs the first response's
  headers with the last one's status, which after a solve reported `cf-mitigated` beside a 200.
