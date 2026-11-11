# Scrapling in Helix: wiring, gaps and where the time goes

Date: 2026-11-11. Repo: `D:\Helix`, branch `main`. Scope: code and upstream reading only. No benchmark was run; every latency figure below is either quoted from `docs/adr/0001-scrapling.md` (measured by its author) or labelled **guess**. A separate session owns live timings.

Newest Scrapling found: **v0.5.1**, read on the GitHub releases page (https://github.com/D4Vinci/Scrapling/releases) on 2026-11-11. Helix pins **0.5** (`apps/scrape/pyproject.toml:13`, exact pin). `https://scrapling.readthedocs.io/llms.txt` returns 404, so the docs pages were read one by one.

## 1. Short answer

Helix uses Scrapling in exactly one place: `AsyncStealthySession` for the `/render` browser rung (`apps/scrape/helix_scrape/render.py:79`, used at `render.py:255`). Everything else in `helix-scrape` is curl_cffi called directly (`fetcher.py:21-23`) or Helix's own code (guard, guard proxy, profile mapping). The Scrapling parser, adaptive selectors, request recorder, spiders, link rules, proxy rotation, DNS-over-HTTPS, session reuse and save/load state are all unused.

The two largest costs on the request path are both "built fresh on every request": a new Chromium per render (`render.py:255`) and a new curl_cffi session, with a new connection, per fetch hop (`fetcher.py:148`).

## 2. Wiring table

| Feature | Used? | Where (file:line) | Note |
|---|---|---|---|
| Scrapling `AsyncStealthySession` (browser rung) | Yes | `render.py:78-81` (import, lazy), `render.py:255-256` (`async with ... session.fetch(req.url)`) | One session, one browser, one fetch, then closed. |
| Scrapling `Fetcher` / `FetcherSession` / `AsyncFetcher` | No | `fetcher.py:21-23` uses curl_cffi `AsyncSession` instead | ADR 0001 "Consequences": needs manual redirect hops, pinned IP per hop, raw `set-cookie` lines. |
| curl_cffi `AsyncSession` | Yes, per hop | `fetcher.py:148` (`async with AsyncSession(**session_args)`), `session.get` at `fetcher.py:149-155` | New session for every hop of every request: no connection reuse. |
| curl_cffi `impersonate` | Yes | `fetcher.py:142-143`, targets in `profiles.py:16-29`, default chrome150 at `profiles.py:42` | Edge and old Chrome names map to the nearest Chrome target. |
| curl_cffi `CurlOpt.RESOLVE` pin | Yes | `fetcher.py:78-92` (`_pin`), applied at `fetcher.py:146-147` | Skipped when a proxy is set, the host is an IP literal, or `allow_private`. |
| patchright (via Scrapling) | Indirect | `render.py:84-113` points it at Helix's staged Chromium; `profiles.py:97-120` uses the page and CDP session | `executable_path` at `render.py:188`. |
| Session options passed to the browser | Partly | `render.py:182-206`: `headless`, `retries=1`, `timeout`, `wait`, `wait_selector`, `network_idle`, `solve_cloudflare`, `hide_canvas`, `block_webrtc`, `google_search`, `block_ads`, `disable_resources`, `extra_headers`, `cookies`, `proxy`, `page_setup`, `useragent`, `locale`, `timezone_id`, `additional_args` | `solve_cloudflare`, `hide_canvas` and `google_search` follow the request flags and are off by default. |
| Scrapling parser (`Selector`, `Response.markdown()`) | No | Extraction is trafilatura in `helix-extract` (`apps/extract/helix_extract/extraction.py:22,135-149`) | Called over HTTP from `pipeline.ts:475`. |
| Adaptive selectors | No | `pyproject.toml:4` describes "adaptive selection" but no code uses it | ADR 0001 lists it as planned. |
| `record_requests` / `session.network` | No | none | ADR lists it as planned. |
| Spiders, `LinkExtractor`, `CrawlSpider`, AutoThrottle | No | Helix crawls with its own engine (`apps/api/src/crawl/`) | ADR decision 7 planned a merge; not built. |
| `ProxyRotator` | No | `proxy` is a single operator or caller string (`models.py:15`, `render.py:205`) | Helix's own `SessionPool` in `apps/api/src/crawl/sessions.ts:68` rotates proxies for crawls only. |
| `dns_over_https`, `blocked_domains`, `real_chrome`, `pierce_shadow`, `user_data_dir`, `save_state`/`load_state`, `RemoteSession`, `max_pages` tab pool | No | none | See section 5. |
| Cookies out of the browser | Produced, never consumed | `render.py:281` returns `page.cookies`; `models.py:119` documents `cf_clearance`; but `pipeline.ts:259-281` reads none of it and `client.ts:168-187` never sends `cookies` in (the field exists at `models.py:104`) | The planned `host_sessions` (migration 016) is absent: no `host_sessions` match anywhere in `apps/api/src` outside tests. |

## 3. One `/v1/scrape` request, rung by rung

Common front end (every request): `routes/scrape.ts:162` `checkUrl` resolves the host with `dns.lookup` (`core/url-guard.ts:114-117`); `routes/scrape.ts:275` `hostGate.run` can sleep for per-host politeness up to 10 s (`core/host-gate.ts:9,63-76`, unmeasured, delays only same-host bursts); an in-process `scrapeCache` answers only when `maxAge > 0` (`routes/scrape.ts:79,233-239`, 500 entries, `core/scrape-cache.ts:7`).

Ladder start: in `auto` the ladder starts at **tls**, not plain, because `minimumViableTier` skips `plain` (`core/escalation.ts:79-85`). `plain` runs only when a caller pins it. A tier learned for the host (`TierMemory`, 30 minutes, in memory: `core/tier-memory.ts:10`) can start the ladder higher (`pipeline.ts:369-375`).

### Rung tls (and plain): `POST /fetch`

| # | Step | Cost kind | Where |
|---|---|---|---|
| 1 | Node `fetch` to helix-scrape, JSON body | per request (HTTP hop on loopback; undici keep-alive is **guess**, not verified) | `fetch/client.ts:102-115` |
| 2 | Literal private-host check | per request, no DNS | `fetcher.py:180`, `guard.py:68-81` |
| 3 | Second DNS lookup, in a thread (`loop.getaddrinfo`), checked and pinned | per hop, no cache | `fetcher.py:89`, `guard.py:94-104` |
| 4 | New curl_cffi session: new handle, new TCP connect, new TLS handshake with the impersonated ClientHello | per hop | `fetcher.py:148` |
| 5 | Response streamed and decoded in Python, capped at 10 MB | per request | `fetcher.py:127-134,166` |
| 6 | Each redirect repeats steps 2 to 5 | per hop (max 10) | `fetcher.py:187-202` |
| 7 | HTML returned as a JSON string to Node | per request | `main.py:25-27`, `client.ts:126-146` |
| 8 | Cookie jar header lookup (memory) and store | per request, negligible | `pipeline.ts:230-242`, `core/cookie-jar.ts` |

### Extraction hop (after every rung that returns a body)

| # | Step | Cost kind | Where |
|---|---|---|---|
| 9 | Full HTML re-sent as JSON to helix-extract `/extract` | per request and **per escalation attempt** (an absent-content tls page is extracted, then the browser page is extracted again) | `pipeline.ts:473-483`, `extract/client.ts:285-298` |
| 10 | trafilatura runs synchronously inside an `async def` route, so it blocks that service's event loop; concurrent scrapes queue behind each other | per request | `apps/extract/helix_extract/main.py:96-105` |
| 11 | `detectBlock`, `contentLooksAbsent` (several regex passes over the HTML), favicon resolve | per request, CPU in Node | `pipeline.ts:489-513`, `core/escalation.ts:94-124` |

### Rung browser: `POST /render`

| # | Step | Cost kind | Where |
|---|---|---|---|
| 1 | Node `fetch`, JSON body (identity script included when a profile is set) | per request | `client.ts:165-189` |
| 2 | Literal check plus a DNS lookup before any browser starts | per request | `render.py:329-337` |
| 3 | Wait for a render slot (default 2 at once) | per request, queue under load | `render.py:54-58,344-350` |
| 4 | New worker thread and a new Proactor event loop | per request | `render.py:310-314,353` |
| 5 | Guard proxy: a new listening socket on 127.0.0.1 | per request (skipped with a caller proxy or `allow_private`) | `render.py:289-293`, `guard_proxy.py:44-48` |
| 6 | `AsyncStealthySession.__aenter__`: patchright driver process, Chromium process launch, context creation. By ADR measurement the whole render is about 1.6 s for example.com, so launch is the bulk (the split is **guess**, not measured) | per request, the dominant fixed cost | `render.py:255`, ADR 0001 "One browser per render" |
| 7 | Staged-Chromium path scan of `ms-playwright` | per request, small | `render.py:84-113,188` |
| 8 | With a profile: a second page is opened, a route is registered, `goto` to `https://identity.invalid/`, JS evaluated, page closed, then a CDP session and UA override | per request, only when `identity` is set | `profiles.py:97-120`, `render.py:166-179` |
| 9 | Navigation through the guard proxy: each CONNECT resolves the host again with `getaddrinfo` and opens a fresh upstream TCP socket; plain-HTTP requests are forced `Connection: close` | per connection, per subresource host | `guard_proxy.py:98-108,123-135` |
| 10 | Page load wait (`domcontentloaded`, optional `network_idle`, `wait`) | per request; `disable_resources` is on unless the host is "walled" | `render.py:191-194,202`, `pipeline.ts:270` |
| 11 | `page.html_content`, cookies, close of browser, driver, guard and thread | per request | `render.py:269-281,255-256` |
| 12 | One-time: the first `from scrapling.fetchers import ...` and the first Chromium page cache warm-up (cost **guess**) | one-time per process | `render.py:78-81` |

Escalation costs stack: a page that is absent from raw HTML pays steps 1 to 11 of tls, then the extraction hop, then the whole browser path and the extraction hop again.

## 4. Finding: the stale Rust fetch service

What is running (checked with `netstat` and process paths): `127.0.0.1:7401` is `D:\Helix\apps\fetch\target\release\helix-fetch.exe` (the retired Rust service); nothing listens on 7403, where helix-scrape belongs. The Rust service has no `/render`, which matches the API's "helix-scrape returned HTTP 404" from `fetch/client.ts:191`.

What starts it: **`C:\Users\harry\.claude\hooks\helix-ensure.js`, lines 145-149**:

```js
const FETCH_EXE = path.join(REPO, 'apps', 'fetch', 'target', 'release', 'helix-fetch.exe');
if (!(await listening(7401)) && fs.existsSync(FETCH_EXE)) {
  launch('fetch', FETCH_EXE, [], path.dirname(FETCH_EXE), { ...process.env, HELIX_FETCH_PORT: '7401', HELIX_FETCH_HOST: '127.0.0.1' });
  started.push('fetch:7401');
}
```

To fix, this block must start `apps\scrape\.venv\Scripts\pythonw.exe -m helix_scrape --port 7403 --host 127.0.0.1` (that venv exists and has `pythonw.exe`; `__main__.py:32-33` defaults to 7403 and 127.0.0.1) with `HELIX_SERVICE_TOKEN` passed if set. The comment at `helix-ensure.js:61-63` ("the Rust fetch tier is not built here") is also stale.

Why the API still talks to 7401: the API default is `http://localhost:7403` (`apps/api/src/config.ts:40`), `.env.example:41` says 7403 and `docker-compose.yml:91` says `http://scrape:7403`. `helix-ensure.js:70-79` loads `apps/api/.env` over the environment, so the live API almost certainly carries `HELIX_FETCH_URL=http://...:7401` in `D:\Helix\apps\api\.env`. I did not read that file (reads are denied), so this part is an inference. `context.md` line 16 records that `.env.example` once said 7401 and was fixed later; the live `.env` was probably not.

Two more file-level changes needed: `D:\Helix\apps\api\.env` (`HELIX_FETCH_URL` to 7403, not read) and, if the old exe should stay dead, delete or rename `apps\fetch\target\release\helix-fetch.exe` so the hook cannot start it. I changed none of them.

## 5. Upstream features Helix does not use

Sources are pages opened on 2026-11-11. Release notes: https://github.com/D4Vinci/Scrapling/releases. Fetching docs: https://scrapling.readthedocs.io/en/latest/fetching/stealthy.html, https://scrapling.readthedocs.io/en/latest/fetching/static.html, https://scrapling.readthedocs.io/en/latest/fetching/choosing.html. Migration: https://scrapling.readthedocs.io/en/latest/migrating-to-v0.5.html.

| Upstream feature | What it gives | Source |
|---|---|---|
| Session reuse with a **tab pool** (`max_pages`); tabs stay open and settings are reset on each reuse since 0.4.15 | "Much faster subsequent requests by reusing the same browser instance"; several URLs fetched at once in one browser | stealthy.html "Session Management", release v0.4.15 |
| `FetcherSession` (HTTP, curl_cffi) | Docs say "10 times faster than creating a single session for each request"; connection pooling; cookie persistence | static.html "Session Management" and "Session Benefits" |
| `RemoteSession` / `AsyncRemoteSession` (new in 0.5.1) | Attach to an already running Chromium over CDP; `new_context=True` makes a separate context per session and closes it afterwards | release v0.5.1, stealthy.html "Remote Sessions", migrating-to-v0.5.html |
| `save_state(path)` / `load_state(path)` (0.5) | Cookies, local storage and IndexedDB in Playwright JSON, for login or clearance reuse; not usable with `proxy_rotator` | release v0.5, stealthy.html |
| `record_requests=True` and `session.network.search(...)` (0.5) | Read the page's XHR/fetch API calls and their JSON bodies without re-requesting | release v0.5, stealthy.html "Network History" |
| `ProxyRotator` (browser and HTTP sessions) | Rotation per request; in the browser it opens one context and tab per proxy | stealthy.html "Proxy Rotation", static.html |
| `dns_over_https` | DNS through Cloudflare DoH to stop leaks behind proxies (a leak concern, not a speed one) | stealthy.html argument table |
| `blocked_domains` and `block_ads` (~3,500 domains) | Fewer requests per page; Helix already passes `block_ads` | stealthy.html argument table |
| `real_chrome=True` | Uses installed Google Chrome: "more authentic, less detectable" | stealthy.html "Real Chrome" |
| `user_data_dir` | Persistent profile, sessions only | stealthy.html argument table |
| `pierce_shadow=True` | Open Shadow DOM in the HTML | release v0.5, stealthy.html "Shadow DOM" |
| Parser: `Response.markdown(main_content_only=True, css_selector=...)` (needs the `rag` extra) | Markdown in-process; strips scripts, styles and hidden prompt-injection content | release v0.4.15, choosing.html "Response Object" |
| Parser speed | Scrapling parse of 5,000 nested elements 1.99 ms vs Parsel 2.06 ms vs BS4+lxml 1,562 ms | https://scrapling.readthedocs.io/en/latest/benchmarks.html |
| Adaptive selectors | Relocate an element after a layout change; SQLite storage by default, pluggable | https://scrapling.readthedocs.io/en/latest/parsing/adaptive.html |
| Spiders: `CrawlSpider`, `LinkExtractor`, `SitemapSpider`, feed spiders, `SiteToMarkdownSpider`, AutoThrottle (per-domain delay that doubles on blocks and honours `Retry-After`), checkpoints, uvloop | A full crawl engine | https://scrapling.readthedocs.io/en/latest/spiders/advanced.html, releases v0.4.8, v0.4.12, v0.5 |
| MCP server (browser sessions, screenshots, network inspection, drag and drop in 0.5.1) | Agent-facing browsing; overlaps with Helix's own MCP | release v0.5, v0.5.1 |
| `follow_redirects="safe"` default on `Fetcher` | Rejects redirects to internal or private IPs; Helix already does this itself per hop (`fetcher.py:47-54`) | static.html "Shared arguments" |

Confirmed by upstream: `DynamicFetcher` and the plain-Playwright backend were removed in 0.5 and every browser fetch uses the patchright-based stealth backend (migrating-to-v0.5.html "Replace the dynamic browser classes"). That matches ADR 0001. 0.5.1 breaks only remote CDP connections (`cdp_url` moved to the new Remote classes), which Helix does not use, so the pin bump to 0.5.1 looks low risk (bug fixes include browser cleanup on setup failure and percent-encoded proxy credentials). It has not been tested here.

## 6. Optimizations, ranked

Gain figures are estimates unless marked measured. "Guard" means the private-address guard in `guard.py` and `guard_proxy.py`, which must keep its rule: resolve once, refuse any private answer, connect only to the checked address.

### 1. Keep a warm browser for `/render` (largest expected win on the browser rung)

- Change: stop launching a browser per render (`render.py:255`, `render.py:287-307`). Hold a small pool of started `AsyncStealthySession` objects (the upstream session uses a tab pool, `max_pages`, stealthy.html "Session Management"), or one long-lived Chromium plus `AsyncRemoteSession(new_context=True)` per render (release v0.5.1). Start the pool at service boot; `chromium_path()` once.
- Expected effect: removes the Chromium and driver launch from every render. Today about 1.6 s for example.com (ADR, measured); a warm tab should leave mostly navigation time. **Guess: 0.3 to 0.8 s saved per render.**
- Risk: isolation. ADR decision says nothing may carry between callers (`render.py:9-10`). A shared session shares one context, so cookies, storage and the proxy would leak across callers. Options: one context per render (the remote-session route), or clear cookies and storage after each render, or key pools by (proxy, identity). The remote route needs Helix to launch Chromium with the stealth flags itself, since launch options do not apply when attaching (stealthy.html), so some stealth coverage may be lost (**guess**; test with the ADR's stealth marker checks). The guard proxy is passed at browser launch: a long-lived browser needs one long-lived guard proxy per browser. `refused` and `unresolved` (`guard_proxy.py:38-41`) are per-render diagnostics, so reset them at the start of each render and serve one render per browser at a time. Per-context proxy on Chromium may need a launch-time dummy proxy (**guess**, verify).
- Measure: p50 and p95 of `timing_ms` from `/render` on example.com and a script-built page, cold vs warm, plus memory per browser. Re-run the guard tests (`tests/test_guard_proxy.py`, `tests/test_render.py`) and a redirect-to-loopback check.

### 2. Reuse curl_cffi sessions on `/fetch`

- Change: replace the per-hop `AsyncSession` (`fetcher.py:148`) with a small keyed pool (target, proxy) or, better for crawls, a session per host so TCP and TLS stay open. The pin (`curl_options` RESOLVE) is set when a session is built (`fetcher.py:146-147`), so key the session by host and the checked address list; confirm whether curl_cffi 0.17 accepts `curl_options` per request, which would allow one shared session (**not verified**).
- Expected effect: saves one TCP connect and one TLS handshake on repeat requests to a host (**guess: 30 to 150 ms** depending on distance); upstream claims 10x for session reuse over per-request sessions (static.html), which is for batches of requests.
- Risk: a reused connection pins its IP implicitly, so a DNS-rebinding swap cannot happen on that connection, but the pool must drop sessions after a short TTL and re-run `lookup_public` for new connections. Cookies must not be shared across callers: curl_cffi sessions keep a cookie jar by default, so disable it or clear it, because the API owns cookies (`pipeline.ts:230-242`). Proxy credentials sit in the key.
- Measure: `timing_ms` of 20 sequential `/fetch` calls to one host, before and after; count handshakes with a local TLS server log.

### 3. Remember "content absent" hosts in `TierMemory`

- Change: `runPipeline` only learns a tier when the ladder climbed past a *block* or the final tier equals the existing floor (`pipeline.ts:340-342`; `escalation reason` starts with `blocked` only for blocks, `escalation.ts:158`). A JS-only site that escalated for "content absent from raw HTML" (`escalation.ts:164-167`) is never remembered, so every request pays tls, the extraction hop, then the browser. Learn that case too, and persist it (the `host_sessions` plan, Phase 3).
- Caveat: a remembered tier also sets `hostIsWalled`, which turns `disableResources` off (`pipeline.ts:270,415`), making the browser slower. Use a separate flag for "needs JS" so resources stay blocked.
- Expected effect on repeat SPA hosts: saves one tls fetch plus one extraction hop (**guess: 100 to 600 ms**). No gain on first hit. High confidence in the code reading, low in the number.
- Risk: a site that starts rendering server-side stays on the browser until the 30-minute TTL (`tier-memory.ts:10`). Memory is lost at restart.
- Measure: `tiersAttempted` and `timingMs` in the result for the same SPA URL twice.

### 4. Reuse `cf_clearance` instead of re-solving or re-rendering (success rate and latency on protected hosts)

- Change: the browser returns its cookie jar (`render.py:281`) and nothing reads it. Store clearance cookies per host in the API, send them back on the tls rung (the `Cookie` header path exists at `pipeline.ts:230-237`) and as `cookies` to `/render` (the field exists in `models.py:104` but `client.ts:168-187` never sends it). Add an opt-in automatic retry with `solve_cloudflare` when the browser rung is blocked by a Cloudflare challenge (today only a caller can set it, `pipeline.ts:266`).
- Expected effect: a solve took 121.9 s in the ADR's nopecha test; after a solve, same-host requests could run on the tls rung in tens of milliseconds. **Guess**: Cloudflare ties clearance to the user agent and often the IP and TLS fingerprint, so tls with curl_cffi may still be challenged. Treat as an experiment.
- Risk: storing session cookies is a privacy decision (per-caller keys, TTL); solving challenges raises terms-of-service questions Scrapling's own disclaimer points at (ADR 0001). Guard is unaffected.
- Measure: success rate on a Cloudflare-protected test page over 20 tries with and without stored clearance.

### 5. DNS: cache and de-duplicate lookups

- Change: the same host is resolved up to three times on tls (API `url-guard.ts:115`, then `fetcher.py:89`, again on each redirect) and four or more on the browser rung (API, `render.py:335`, then `guard_proxy.py:100` for every CONNECT, including each subresource connection). Add a short-TTL cache (for example 30 to 60 s) inside `lookup_public`, keyed by host, storing only answers that passed `public_only` (`guard.py:84-91`). A refusal or failure is cached for a few seconds at most, or not at all.
- Expected effect: tens of ms on a slow resolver, little on a warm OS cache. On Windows `getaddrinfo` runs in the default thread pool (`guard.py:101`), which the render queue also uses (`render.py:62-63`). **Guess: 5 to 50 ms per request.**
- Risk: a TTL window weakens the "resolve once per connection" rebinding defence, so keep the TTL short and keep connect-to-checked-address behaviour; never cache a private answer as allowed.
- Measure: count `getaddrinfo` calls per scrape with a debug counter, and p50 `timing_ms`.

### 6. Make extraction cheaper and non-blocking

- Change (a): in `apps/extract/helix_extract/main.py:96-105` the route is `async def` and calls sync trafilatura, so two concurrent scrapes extract one after the other. Make it a plain `def` (FastAPI runs it in a thread pool) or `asyncio.to_thread`. (b) Avoid extracting a page that will be discarded: when a tier attempt will certainly escalate (empty root or script-heavy HTML, `escalation.ts:91-106`), the cheap regex check can run before the extraction hop. (c) Optionally try in-process `Response.markdown()` from Scrapling as a second extractor; the extractor module cites trafilatura as the F1 leader (`extraction.py:5`), so compare quality before switching.
- Expected effect: (a) improves concurrent throughput, not single-request latency; (b) saves one extraction hop on escalating pages (**guess: 50 to 300 ms**); (c) unknown.
- Risk: (b) changes escalation decisions, which need tests (`core/escalation.test.ts`); (c) may lower content quality.
- Measure: scrape 10 URLs concurrently and compare total time; `extract` call count per scrape.

### 7. Smaller items

- Warm `scrapling` and Chromium at service start so the first request after a restart is not slow (`render.py:78-81` imports lazily). Guess: seconds on the first render only.
- Cache `chromium_path()` (`render.py:84-113` lists a directory on every render). Negligible.
- `retries: 1` in `render.py:190` is already minimal; upstream default is 3 (stealthy.html).
- Pass `blocked_domains` for common analytics hosts on the browser rung; `block_ads` is already available (`render.py:201`). Fewer connections through the guard proxy, so fewer lookups. Guess: small.
- Bump the pin to 0.5.1 once the above is stable.

## 7. Open questions

1. What does `D:\Helix\apps\api\.env` set for `HELIX_FETCH_URL`? (Not read; the inference in section 4 rests on that.)
2. Does curl_cffi 0.17 accept `curl_options` per request? This decides the simplest design for optimization 2.
3. Does a long-lived Chromium accept a per-context proxy for the guard on Windows? This decides optimization 1's design.
4. Is the API-to-helix-scrape connection kept alive by Node's global undici dispatcher? Not verified.
5. The live timing split between browser launch, navigation and teardown: belongs to the separate measuring session.

Prompt-injection screening: no page read for this audit contained text that tells an AI agent to do anything (release notes mention AI-agent features as product descriptions only), so 0 Proton checks were run.
