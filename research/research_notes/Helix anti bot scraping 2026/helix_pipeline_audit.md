# Helix scraping pipeline audit: anti-bot handling and efficiency (2026-10-05)

Scope: read-only audit of `D:\Helix` at commit `07481f6` (main, dirty tree; none of the audited files are in the modified list). Every claim cites `file:line` in the repo, or a probe that was run during this audit. Probe scripts live in the session scratchpad (`canvas.mts`, `fp.mts`, `pipe.mts`, `probe.cjs`); they are not repo files.

Stack state during the audit: `GET http://127.0.0.1:7400/v1/health` returned 503 `"status":"unhealthy"` because `extract` (7402) was `unreachable`. Postgres, fetch (7401) and the browser pool reported `ok`. Desktop ports 7410-7412 did not answer. `helix-fetch` `/health` reported `{"version":"1.6.0","profiles_loaded":44,"definitions_loaded":0}`. The live probes below therefore used the real fetch service and a real Playwright pool, with a stub extractor in place of 7402.

## 1. Request flow for a scrape: first tier, escalation rule, what is reused

### Takeaway
Every `tier: "auto"` scrape with no capability needs starts at `plain`. That tier is a bare HTTP client with no browser headers. The ladder then climbs one tier per attempt on "blocked" or "content absent" evidence, up to `chromium`. No state carries across tiers or across requests: no cookies, no clearance, no per-domain tier memory, no result cache, and no shared deadline.

### Cited Findings
- The tier order is `plain → tls → lightpanda → chromium → camoufox`, with the default ceiling at `chromium`. Camoufox is reachable only through an explicit tier — [apps/api/src/core/escalation.ts:21-39](apps/api/src/core/escalation.ts)
- The start tier is `minimumViableTier(capabilities)`, which is `plain` unless the request needs screenshot, actions, pdf, waitFor or a proxy. An explicit tier is both floor and ceiling — [apps/api/src/core/pipeline.ts:261-266](apps/api/src/core/pipeline.ts), [apps/api/src/core/escalation.ts:64-91](apps/api/src/core/escalation.ts)
- `POST /v1/scrape` has no `maxTier` field. A caller cannot say "auto, but allow camoufox" and can only jump straight to `tier: "camoufox"`. The escalation.ts comment says "`maxTier` opts a request in", but the scrape schema does not expose it — [apps/api/src/routes/scrape.ts:62-83](apps/api/src/routes/scrape.ts), [apps/api/src/core/escalation.ts:31-39](apps/api/src/core/escalation.ts)
- `mobile: true` with `tier: auto` is forced to `chromium` — [apps/api/src/routes/scrape.ts:247](apps/api/src/routes/scrape.ts)
- The pipeline does the following for each tier:
  1. Fetch or render the page (`attemptTier`).
  2. On a transport error, call `shouldEscalate`.
  3. Otherwise, send the full HTML to helix-extract **before** classifying it.
  4. Run `detectBlock`, then `shouldEscalate`.

  Source: [apps/api/src/core/pipeline.ts:271-414](apps/api/src/core/pipeline.ts)
- Escalation rule: a block verdict means go up a tier. Otherwise, if `contentLooksAbsent` holds (extracted text under 200 characters, an empty app root, or a script ratio above 0.9), also go up a tier. HTTP status is never consulted except through `detectBlock` — [apps/api/src/core/escalation.ts:93-175](apps/api/src/core/escalation.ts)
- A transport error escalates through `shouldEscalate` on empty facts. An empty body counts as "content absent", so a DNS failure climbs every tier. `classifyTransportError` runs only after the ladder is spent — [apps/api/src/core/pipeline.ts:290-319](apps/api/src/core/pipeline.ts)
  - Probe: `https://nonexistent-host-helix-audit.example/` tried `plain>tls>lightpanda>chromium` and ended as `dns` (pipe.mts run, 2026-10-05).
- Each tier gets the full `options.timeout` (default 30 s, max 300 s). There is no shared deadline across tiers, so a 30 s request can take about 4 x 30 s in the worst case — [apps/api/src/core/pipeline.ts:184-193,213-231](apps/api/src/core/pipeline.ts), [apps/api/src/routes/scrape.ts:73](apps/api/src/routes/scrape.ts)
- A disabled lightpanda is still stepped onto as a transport error before chromium.
  - Probe: `example.com` escalations were `["content absent from raw HTML","content absent from raw HTML","transport error: lightpanda tier requested but not enabled"]`, and the page climbed to chromium (pipe.mts run).
  - The same finding is already logged in [FOLLOWUPS-PLAN.md:78-80](FOLLOWUPS-PLAN.md) (example.com 0.3 s → 3.6 s), with fixes planned in [SUITE-PLAN.md:82-86](SUITE-PLAN.md).
- HTTP 429 and 403 are block signals, so they escalate at once to a heavier tier against the same host. `Retry-After` is parsed only for the final failure report and is never honoured between tiers — [apps/api/src/core/block-detection.ts:122-133](apps/api/src/core/block-detection.ts), [apps/api/src/core/pipeline.ts:147-161,431-434](apps/api/src/core/pipeline.ts)
- A non-2xx page with enough text is returned as `success: true`.
  - Probe: `https://www.npmjs.com/does-not-exist-404` returned success at tier `tls`, after plain earned a `403 cf-mitigated` (pipe.mts run).
  - `pipeline.test.ts` has no 404 or 410 case (grep of [apps/api/src/core/pipeline.test.ts](apps/api/src/core/pipeline.test.ts)).
- Scrape result cache: none. `fromCache: false` is hardcoded — [apps/api/src/routes/scrape.ts:404](apps/api/src/routes/scrape.ts)
- Per-domain memory: none in the scrape path. Every request starts the ladder from the bottom ([apps/api/src/core/pipeline.ts:266](apps/api/src/core/pipeline.ts)). Per-host state exists only in the crawl `PolitenessController`, which tracks concurrency and backoff but not tier — [apps/api/src/crawl/politeness.ts:43,152-203](apps/api/src/crawl/politeness.ts)
- Cookies and clearance:
  - The Rust client has no cookie store and is rebuilt for every request — [apps/fetch/src/main.rs:165-198](apps/fetch/src/main.rs)
  - Each browser render uses a fresh context, closed afterwards — [apps/api/src/browser/pool.ts:592-598,661-662](apps/api/src/browser/pool.ts)
  - Response headers are collapsed into a `HashMap`, so only one `set-cookie` value survives — [apps/fetch/src/main.rs:261-270](apps/fetch/src/main.rs)
- The crawl `SessionPool` has a cookie jar, and the worker sends it as a `Cookie` header ([apps/api/src/crawl/sessions.ts:141,221-225](apps/api/src/crawl/sessions.ts), [apps/api/src/crawl/worker.ts:537-547](apps/api/src/crawl/worker.ts)). Nothing ever fills that jar:
  - The only call is `sessions.release(session, { blocked, statusCode })`, with no cookies — [apps/api/src/crawl/worker.ts:759](apps/api/src/crawl/worker.ts)
  - No non-test code under `apps/api/src` reads `set-cookie` (grep).
- Crawl sessions pin one profile and one proxy per session, and retire a session after 2 blocks or 500 requests — [apps/api/src/crawl/sessions.ts:70-79,136-169](apps/api/src/crawl/sessions.ts)

### Inferences
- Starting at `plain` exposes a bot signature on the first request to every host (see section 2). It also burns a round trip whenever a WAF is present. A per-host "last winning tier" memory, held for N minutes, would skip both plain and the failed tiers on repeat visits.
- A transport error should be classified first, and the ladder should continue only for `tls` or `http_error` reasons. DNS, `unsafe_url` and `service_unavailable` cannot be fixed by a higher tier.
- The cookies that `tls` receives (for example `__cf_bm`) are never handed to `chromium`, and browser cookies are never kept. A Cloudflare clearance cookie (`cf_clearance`), earned once, is thrown away every time.

### Gaps
- No live timing for the full stack with the real extractor, because 7402 was down. The latencies in the pipe.mts run (399-876 ms) use a stub extractor and a warm local browser.

## 2. Rust fetch (`apps/fetch`): library, identities, JA4/HTTP2, headers, proxy

### Takeaway
The `tls` tier is good: `wreq` 0.16 on BoringSSL presents a real Chrome 149 JA4 and HTTP/2 fingerprint. The `plain` tier, which runs first, is a raw non-browser client: no User-Agent, a 28-cipher JA4 and a non-Chrome HTTP/2 SETTINGS frame. Both tiers omit `Accept-Encoding` entirely. A client is built per request, so there is no connection reuse, no TLS resumption and no cookies.

### Cited Findings
- The libraries are `wreq = "0.16"` and `wreq-util = "0.2"`. The lockfile has `wreq 0.16.0`. The build compiles BoringSSL through `btls-sys` (seen in the `cargo test` build log) — [apps/fetch/Cargo.toml:18-30](apps/fetch/Cargo.toml), [apps/fetch/Cargo.lock](apps/fetch/Cargo.lock)
- Identities:
  - 44 named identities: Chrome 131-149, Edge 127-148 and Safari 17.5-26.4, plus iOS Safari — [apps/fetch/src/profile.rs:165-281](apps/fetch/src/profile.rs)
  - The default is `chrome-149` — [apps/fetch/src/profile.rs:231](apps/fetch/src/profile.rs)
  - No Firefox identity exists.
  - Unknown names fall back to Chrome 149 silently, with only a debug log — [apps/fetch/src/profile.rs:213-220](apps/fetch/src/profile.rs)
- TLS and HTTP/2 come entirely from wreq-util presets. The JSON `tls`/`http2`/`headers.order` blocks are documentation that only the validator reads. They do not drive the handshake — [apps/fetch/src/profile.rs:18-21](apps/fetch/src/profile.rs), [packages/profiles/definitions/chrome-148-windows.json](packages/profiles/definitions/chrome-148-windows.json) (`"ja4": "unset_transport_owned_by_wreq_util"`)
- Probe of tier `tls` against `https://tls.peet.ws/api/all`, through the running fetch service on 2026-10-05:
  - `ja4 t13d1516h2_8daaf6152771_d8a2da3f94cd`
  - akamai h2 `1:65536;2:0;4:6291456;6:262144|15663105|0|m,a,s,p`
  - pseudo-header order `m,a,s,p`
  - `sec-ch-ua` Chrome 149, `sec-ch-ua-platform: "macOS"`, macOS Chrome/149 UA
  - `priority: u=0, i`
  - 272 ms
- Probe of tier `plain` against the same endpoint:
  - `ja4 t13d2811h2_257f3020b3a2_78e6aca7449b`
  - akamai h2 `4:2097152;5:16384;6:16384|5177345|0|m,s,a,p`
  - only the 4 pseudo-headers: **no user-agent, accept or accept-language** (probe run)
- `Accept-Encoding` is absent on the `tls` tier:
  - the tls.peet.ws header frame lists none
  - the `https://httpbin.org/headers` echo returns every Chrome header except `Accept-Encoding` (probe run)
  - the JSON profile documents `"acceptEncoding": "gzip, deflate, br, zstd"` — [packages/profiles/definitions/chrome-148-windows.json:61](packages/profiles/definitions/chrome-148-windows.json)
  - `Cargo.toml` enables no wreq compression features — [apps/fetch/Cargo.toml:30](apps/fetch/Cargo.toml)
- A client is built per request. The code says this is deliberate, so a pooled connection does not carry the previous identity's TLS session. The cost is a full TCP and TLS handshake on every fetch, with no cookie store — [apps/fetch/src/main.rs:165-198,222](apps/fetch/src/main.rs)
  - Reusing the client per `(profile, proxy, allow_private)` is already planned in [SUITE-PLAN.md:87-88](SUITE-PLAN.md).
- Caller headers are added with `request.header(name, value)` after the emulation headers ("caller headers win"). This can change Chrome's header order or duplicate a header — [apps/fetch/src/main.rs:234-241](apps/fetch/src/main.rs)
- Proxy: one `wreq::Proxy::all(proxy)` per request, operator-supplied, with no pool — [apps/fetch/src/main.rs:181-183](apps/fetch/src/main.rs). The route resolves `auto | stealth | none | {url}` — [apps/api/src/routes/scrape.ts:43-54,141-156](apps/api/src/routes/scrape.ts)
- The body is read with `response.text()`. There is no size cap and no content-type check, and an undecodable body becomes `None` — [apps/fetch/src/main.rs:272-280](apps/fetch/src/main.rs)
- Bodies cross three JSON hops: Rust → API, then API → extract — [apps/api/src/fetch/client.ts:53-95](apps/api/src/fetch/client.ts), [apps/api/src/core/pipeline.ts:327-334](apps/api/src/core/pipeline.ts)
- The running fetch service reports `definitions_loaded: 0`, so the binary did not find `packages/profiles/definitions` from its working directory. That only disables validation. The transport presets are unaffected — [apps/fetch/src/profile.rs:289-302,357-359](apps/fetch/src/profile.rs) and the `/health` probe.

### Inferences
- The plain tier's request (no UA, non-browser JA4 and HTTP/2) is what Cloudflare and Akamai score as a bot before the `tls` tier ever runs.
  - Probe: npmjs answered plain with `403 cf-mitigated`, and the same URL succeeded on `tls`.
  - This can lower the reputation of the IP for the follow-up request.
  - Recommendation: make `tls` the floor for `auto`, or make `plain` send the default profile's headers at least.
- A missing `Accept-Encoding` is a header-level inconsistency with the claimed Chrome identity. Most servers then send uncompressed bodies: on the tls probe of cloudflare.com, `content-encoding` was absent and the body was 1,334,300 bytes. Enabling wreq's `gzip`/`brotli`/`zstd`/`deflate` features (feature names not verified in this audit) would fix both the bandwidth cost and the tell.
- The tls tier's default identity is macOS (`sec-ch-ua-platform: "macOS"`), while the browser tier on this host reports Windows (section 3). Two tiers that hit the same host seconds apart present different OSes and Chrome versions.

### Gaps
- `cargo test` did not finish. The cold debug BoringSSL build (`btls-sys` via cmake) was still compiling at the 280 s timeout (exit 143), so the 9 Rust unit tests in `profile.rs` were not run.
- Not verified: wreq 0.16's exact compression feature flag names, and whether `.header()` appends or replaces.

## 3. Playwright pool: stealth, CDP leaks, resource blocking, reuse, concurrency, launch cost

### Takeaway
The render tier is stock Playwright 1.62.1 driving `chromium-headless-shell`, with no stealth layer.
- `navigator.webdriver` is `true`.
- The UA says `HeadlessChrome/151`.
- `window.chrome` is undefined, there are 0 plugins, and WebGL reports SwiftShader.
- Playwright sends `Runtime.enable`.

The profile JS layer runs only when a caller names a profile. Even then it never sets the UA, and its overrides fail a `toString()` check. Resource blocking covers ads only, and only when asked for.

### Cited Findings
- `"playwright": "^1.49.0"` is declared, and 1.62.1 is installed — [apps/api/package.json:32](apps/api/package.json), `node_modules/playwright-core/package.json`
- No `patchright`, `rebrowser`, `stealth` or `webdriver` handling exists anywhere in non-test `apps/api/src` (grep).
- Launch args are only the container flags (`--no-sandbox`, `--disable-gpu`, …). There is no `--disable-blink-features=AutomationControlled` and no headless mode choice — [apps/api/src/browser/engines.ts:36-47](apps/api/src/browser/engines.ts), [apps/api/src/browser/pool.ts:371-377](apps/api/src/browser/pool.ts)
- Probe of a default launch on 2026-10-05 (probe.cjs, same args as `CHROMIUM_ARGS`):
  - `ua: "...HeadlessChrome/151.0.7922.34..."`
  - `webdriver: true`, `plugins: 0`, `window.chrome: "undefined"`
  - WebGL `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)...`
  - launch 146 ms, context and page 180 ms (warm)
- Playwright's bundle sends `Runtime.enable` on every page session — `node_modules/playwright-core/lib/coreBundle.js` offset 1885451 (`this._client.send("Runtime.enable", {})`).
- In headless mode Playwright adds `--headless` and `--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4` (coreBundle.js offset ~2116072). The headless shell binaries are installed (`%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1243`).
- The profile's `headers.userAgent` is never applied. `profileContextOptions` sets only `timezoneId`, `locale` and `screen` — [apps/api/src/browser/pool.ts:298-309](apps/api/src/browser/pool.ts)
  - Probe with profile `chrome-148`: the UA was still `HeadlessChrome/151` and `webdriver` was still `true` (canvas.mts run).
- The init script runs only `if (profile)`, and `profile` is undefined unless the caller passes one, so a default scrape gets no JS-layer changes — [apps/api/src/browser/pool.ts:595-618](apps/api/src/browser/pool.ts), [apps/api/src/browser/profiles.ts:106-108](apps/api/src/browser/profiles.ts)
- The overrides are detectable:
  - getters are defined as `get: () => value` — [apps/api/src/browser/profiles.ts:192-196](apps/api/src/browser/profiles.ts)
  - `getParameter` and `toDataURL` are replaced with plain functions — [apps/api/src/browser/profiles.ts:212-259](apps/api/src/browser/profiles.ts)
  - Probe: `hwGetterSrc: "() => value"`, and `toDataURL.toString()` / `getParameter.toString()` return the JS source, not `[native code]` (canvas.mts run).
- Resource blocking:
  - One `context.route(() => true, …)` handler is installed on every render, because `blockPrivate` is on by default, so every subresource round-trips through Node — [apps/api/src/browser/pool.ts:199-220,619-622](apps/api/src/browser/pool.ts)
  - Playwright documents that "Enabling routing disables http cache" — `node_modules/playwright-core/types/types.d.ts:4368`
  - The handler aborts private hosts, plus 20 ad and consent hosts only when `blockAds` is set — [apps/api/src/browser/pool.ts:156-182](apps/api/src/browser/pool.ts)
  - Images, fonts and media are never blocked, even for a markdown-only scrape. Blocking them is planned in [SUITE-PLAN.md:89](SUITE-PLAN.md).
  - `blockAds` is not in the scrape route schema, so `/v1/scrape` never sets it — [apps/api/src/routes/scrape.ts:62-83,257-275](apps/api/src/routes/scrape.ts)
- Navigation is `goto(..., waitUntil: 'domcontentloaded')`, then `page.content()` immediately, unless `waitFor` is set. Nothing waits for a JS challenge to clear or for network idle — [apps/api/src/browser/pool.ts:223-245](apps/api/src/browser/pool.ts)
- Reuse and concurrency:
  - `size` = 4 browsers per engine, 20 contexts per browser, recycled after 250 pages — [apps/api/src/config.ts:71-74](apps/api/src/config.ts)
  - `start()` launches all `size` browsers in parallel on first use — [apps/api/src/browser/pool.ts:350-369](apps/api/src/browser/pool.ts)
  - Callers park in `#acquire` when the pool is full — [apps/api/src/browser/pool.ts:422-438](apps/api/src/browser/pool.ts)
  - A new context per render — [apps/api/src/browser/pool.ts:592-598](apps/api/src/browser/pool.ts)
  - Recycle drain polls every 100 ms — [apps/api/src/browser/pool.ts:460-463](apps/api/src/browser/pool.ts)
- Lightpanda (`connectOverCDP`), Camoufox (`firefox.connect`) and remote CDP each connect and disconnect **per render** — [apps/api/src/browser/pool.ts:680-683,721,758-760,787,837,885](apps/api/src/browser/pool.ts). One persistent connection is planned in [SUITE-PLAN.md:90](SUITE-PLAN.md).
- Lightpanda and Camoufox contexts get no profile, init script or route except the private guard — [apps/api/src/browser/pool.ts:686-700,763-778](apps/api/src/browser/pool.ts)

### Inferences
- The live medium.com run shows the cost. The chromium tier was answered with a Cloudflare 403 (`status-403+cloudflare-blocked+access-denied-phrasing`), so the render tier is itself blocked where it is needed most.
- Plausible improvements, all within the "TS Playwright pool" architecture rule:
  - run Chrome headful-new or with a real channel
  - a CDP-patched driver without `Runtime.enable`
  - `AutomationControlled` disabled
  - a UA, Client Hints and platform derived from the actual browser build
  - native-looking getter shims
- Sending images, fonts and media through the route handler while they are needed only for screenshots adds Node round-trips per page. Aborting them by `resourceType()` reuses the same handler.

### Gaps
- Not measured: cold launch cost (the probe was warm, 146 ms) and memory per browser.
- No probe ran against a commercial bot test page (CreepJS, Sannysoft) in this audit.

## 4. Block detection: how a challenge page is recognized

### Takeaway
Detection is a weighted list of substring and header signals over the **whole HTML body**, with a 0.5 threshold. It catches real challenges, but it gives false positives on ordinary pages. On a live sample, 4 of 5 normal HTTP 200 pages behind Cloudflare were classified as blocked. That makes the pipeline throw away a good `tls` result, escalate, and report a failure.

### Cited Findings
- The signals ([apps/api/src/core/block-detection.ts:120-244](apps/api/src/core/block-detection.ts)):

  | Signal | Weight |
  |---|---|
  | status 403 | 0.6 |
  | status 429 | 0.9 |
  | status 503 | 0.4 |
  | `cf-mitigated` header | 1.0 |
  | body contains `cf-browser-verification` / `challenge-platform` / "checking your browser" | 0.95 |
  | body "attention required" + "cloudflare" | 0.9 |
  | body/header `datadome` | 0.95 |
  | PerimeterX markers | 0.95 |
  | Akamai `reference #18.` | 0.85 |
  | Imperva `_incapsula_` / `incident id:` | 0.9 |
  | AWS WAF | 0.85 |
  | `g-recaptcha` / `h-captcha` / `turnstile` | 0.8 |
  | "access denied" phrasing | 0.5 |
  | meta-refresh under 4 KB | 0.4 |
  | short body | 0.25 |
  | no extractable content | 0.3 |

- The strongest signal decides, with corroboration capped at +0.15 — [apps/api/src/core/block-detection.ts:246-276](apps/api/src/core/block-detection.ts)
- Live false positives: real `detectBlock` on bodies fetched by the tls tier (fp.mts run, 2026-10-05):

  | URL | Status | Verdict | Signal | detectBlock time |
  |---|---|---|---|---|
  | `https://discord.com/` | 200 (title "Discord - Group Chat…") | blocked, `challenge` | `cloudflare-challenge` | 11.8 ms on 170 KB |
  | `https://medium.com/` | 200 (title "Medium") | blocked | `cloudflare-challenge` | 2.6 ms |
  | `https://www.cloudflare.com/` | 200 | blocked | `captcha-widget`, 0.80 | 76.4 ms on 1.33 MB |
  | `https://developers.cloudflare.com/turnstile/` | 200 (docs) | blocked | `captcha-widget` | |
  | `https://www.npmjs.com/` | 200 | not blocked (control) | | |
  | `https://www.g2.com/` | 403 | blocked (true positive) | `status-403+cloudflare-challenge+datadome` | |

- End-to-end probe (pipe.mts): `https://medium.com/` tried `plain>tls>lightpanda>chromium` and failed with `challenge`. The tls tier had already fetched the real 200 "Medium" page (54,972 bytes).
- The vendor checks lowercase the whole body for each probe: `bodyIncludes` calls `r.body.toLowerCase()` per needle — [apps/api/src/core/block-detection.ts:113-114](apps/api/src/core/block-detection.ts).
  - `detectBlock` runs at least twice per tier: [apps/api/src/core/pipeline.ts:341](apps/api/src/core/pipeline.ts), and inside `shouldEscalate` at [apps/api/src/core/escalation.ts:154](apps/api/src/core/escalation.ts).
  - On a blocked tier it runs a third time through [apps/api/src/core/pipeline.ts:399](apps/api/src/core/pipeline.ts).
- There is no signal for Kasada, F5/Shape or Akamai `_abck`/sensor pages. Akamai is matched only by its error-page reference string — [apps/api/src/core/block-detection.ts:182-188](apps/api/src/core/block-detection.ts)
- Tests: `block-detection.test.ts` has 14 tests, all pass. None covers a normal page that embeds `/cdn-cgi/challenge-platform/` or mentions Turnstile (test run below).

### Inferences
- `challenge-platform` is a path that Cloudflare injects as a script into ordinary pages (the discord and medium bodies contain it on a 200). On its own it should not mark a page as a challenge. Use stronger markers: a `<title>` of "Just a moment...", `cf-mitigated`, `window._cf_chl_opt`, or a body under ~20 KB.
- The same applies to `turnstile`, `datadome` and `perimeterx` as bare words. Restrict them to script `src` hosts or to small bodies, and lowercase the body once per call.

### Gaps
- The false-positive rate was measured on 5 hand-picked pages only. A larger labelled set is needed for a rate.

## 5. Fingerprint perturbation (keyed HMAC seed) and where it lives

### Takeaway
The keyed-HMAC rule is implemented correctly in `apps/api/src/browser/profiles.ts`. The perturbation itself is **not stable**: `toDataURL` writes the noise back into the canvas, so every read returns a different hash. That is the exact tell the code says it avoids.

### Cited Findings
- The secret is `sha256("canvas:" + HELIX_ENCRYPTION_KEY | HELIX_BOOTSTRAP_KEY)`, or 32 random bytes per process when neither is set — [apps/api/src/browser/profiles.ts:130-139](apps/api/src/browser/profiles.ts)
- The seed is `HMAC-SHA256(secret, canvasSeed || profile.id)`, first 4 bytes — [apps/api/src/browser/profiles.ts:166-170](apps/api/src/browser/profiles.ts). The CLAUDE.md hard constraint, "Keyed HMAC only", is met.
- The noise is xorshift32-driven ±1 on one channel per 4-1024 bytes, applied with `getImageData` → `putImageData` on the **live canvas**, before calling the original `toDataURL` — [apps/api/src/browser/profiles.ts:231-259](apps/api/src/browser/profiles.ts)
- Probe (canvas.mts, profile `chrome-148`, three `toDataURL()` calls on the same canvas): `read1EqRead2: false`, `read2EqRead3: false`. The file's own comment says "real browsers return an identical canvas hash on every read" — [apps/api/src/browser/profiles.ts:151-153](apps/api/src/browser/profiles.ts)
- Coverage is `toDataURL` only. `toBlob`, `getImageData`, `OffscreenCanvas`, WebGL `readPixels` and audio are not covered — [apps/api/src/browser/profiles.ts:224-259](apps/api/src/browser/profiles.ts)
- The seed is per instance and per profile, not per session. Every request from one instance with the same profile carries the same perturbed hash (by construction of [apps/api/src/browser/profiles.ts:166-170](apps/api/src/browser/profiles.ts)). The Rust doc says "Seed once per session, then hold" — [apps/fetch/src/profile.rs:14-16](apps/fetch/src/profile.rs)
- Profiles:
  - Two definitions are shipped: `chrome-148` (verified, Windows, captured 2026-08-27) and `chrome-137` (hand-written, `verified:false`) — [packages/profiles/definitions/chrome-148-windows.json:12-17](packages/profiles/definitions/chrome-148-windows.json), [packages/profiles/definitions/chrome-137-macos.json:16-21](packages/profiles/definitions/chrome-137-macos.json)
  - `tools/capture` records them (directory present).

### Inferences
- The fix is to perturb a copy and leave the source canvas untouched, for example by drawing to a scratch canvas and serialising that. The same noise function can then wrap `toBlob` and `getImageData`.

### Gaps
- Whether detectors in the field check for read-to-read canvas variance was not researched here. That is the external researchers' scope.

## 6. Tests, benchmarks and metrics

### Takeaway
The unit suites for the ladder, detection, pool, profiles, sessions, scrape route and ladder/cost routes all pass: 166 tests in 11 files, 28.7 s. There is no latency or success-rate benchmark. The ladder and cost endpoints record per-page tier, escalations and browser seconds for crawl jobs only.

### Cited Findings
- `npx vitest run` over pipeline, escalation, block-detection, scrape, pool, pool.ceiling, profiles, engines, sessions, job-ladder and job-cost gave **11 files passed, 166 tests passed, duration 28.71 s** (run 2026-10-05 21:25 from `apps/api`). `pool.test.ts` took 17.7 s, using real browsers.
- Rust `cargo test` was not completed (section 2 gap).
- Benchmarks: none. `apps/api/scripts/` holds `bundle.mjs`, `mcp-response-size.mjs`, `mcp-schema-size.mjs` and `smoke-live.mjs`. `smoke-live.mjs` is a per-operation live smoke check, not a throughput measurement — [apps/api/scripts/smoke-live.mjs:1-4](apps/api/scripts/smoke-live.mjs). A baseline script (p50/p95, tier reached, bytes, success rate) is planned but not built — [SUITE-PLAN.md:78-80](SUITE-PLAN.md)
- Metrics:
  - The crawl worker counts `tierBreakdown` and `browserSeconds` into job usage — [apps/api/src/crawl/worker.ts:400,696,815-816](apps/api/src/crawl/worker.ts)
  - `GET /v1/jobs/:id/ladder` reads `tier`, `tiersAttempted`, `escalations` and `timingMs` from `documents.metadata` — [apps/api/src/routes/job-ladder.ts](apps/api/src/routes/job-ladder.ts)
  - A single `/v1/scrape` returns `tier`, `tiersAttempted` and `timingMs` in `metadata`, but stores no metric — [apps/api/src/routes/scrape.ts:387-406](apps/api/src/routes/scrape.ts)

### Gaps
- No historical success rate per tier or per vendor exists to compare against.

## 7. Concrete inefficiencies and anti-bot defects, ranked (file:line)

### Takeaway
The highest-value fixes are ranked below. Items 1-3 and 5 have live evidence from this audit. Items marked "planned" are already listed in `SUITE-PLAN.md` Phase 1.

### Cited Findings
1. **False-positive challenge detection on normal Cloudflare pages** (discord, medium, cloudflare.com, CF Turnstile docs). This turns tls successes into failures. See [apps/api/src/core/block-detection.ts:149-156,204-212](apps/api/src/core/block-detection.ts) and the fp.mts and pipe.mts probes. Not in SUITE-PLAN.
2. **The `plain` tier runs first and has no browser headers and a non-browser JA4**. This invites WAF challenges: npmjs gave plain a `403 cf-mitigated`. See [apps/api/src/core/escalation.ts:81-91](apps/api/src/core/escalation.ts), [apps/fetch/src/main.rs:175-179](apps/fetch/src/main.rs) and the probes. Not in SUITE-PLAN.
3. **Render tier is unstealthed**: `HeadlessChrome` UA, `webdriver: true`, `Runtime.enable`, SwiftShader WebGL, and the profile UA never applied. See [apps/api/src/browser/pool.ts:298-309,598-618](apps/api/src/browser/pool.ts), [apps/api/src/browser/engines.ts:36-47](apps/api/src/browser/engines.ts) and the probes. Live result: Cloudflare 403 on medium at chromium. Not in SUITE-PLAN beyond "more captured profiles".
4. **Canvas noise changes on every read**: [apps/api/src/browser/profiles.ts:231-259](apps/api/src/browser/profiles.ts), canvas.mts probe.
5. **No `Accept-Encoding` on the tls tier**: an identity mismatch, plus uncompressed transfer. See [apps/fetch/Cargo.toml:30](apps/fetch/Cargo.toml) and the peet and httpbin probes.
6. **Transport errors (DNS and similar) and short complete pages walk the whole ladder**, and a disabled lightpanda is still tried. See [apps/api/src/core/pipeline.ts:290-305](apps/api/src/core/pipeline.ts), [apps/api/src/core/escalation.ts:93,100-103](apps/api/src/core/escalation.ts). Partly planned in SUITE-PLAN 1.
7. **No shared deadline across tiers.** Each tier gets the full `timeout`: [apps/api/src/core/pipeline.ts:190,218](apps/api/src/core/pipeline.ts).
8. **429 and 403 escalate immediately to a heavier tier**, ignoring `Retry-After`: [apps/api/src/core/pipeline.ts:398-414](apps/api/src/core/pipeline.ts).
9. **Extraction runs before block classification.** A challenge page still costs an HTTP round trip to helix-extract with the full HTML: [apps/api/src/core/pipeline.ts:322-341](apps/api/src/core/pipeline.ts). A cheap header and status pre-check (`cf-mitigated`, 403 or 429 with a small body) could skip it.
10. **`detectBlock` lowercases the full body up to ~22 times per call**, and runs 2-3 times per tier (76 ms per call measured on 1.3 MB): [apps/api/src/core/block-detection.ts:113-114](apps/api/src/core/block-detection.ts).
11. **No per-domain tier memory and no scrape cache** (`fromCache: false` hardcoded): [apps/api/src/core/pipeline.ts:266](apps/api/src/core/pipeline.ts), [apps/api/src/routes/scrape.ts:404](apps/api/src/routes/scrape.ts). The cache is planned in SUITE-PLAN 5. Tier memory is not.
12. **Cookies are never carried**:
    - between tiers
    - between requests (per-request wreq client, fresh browser context)
    - into the crawl session jar (never filled)

    See [apps/fetch/src/main.rs:170-198,261-270](apps/fetch/src/main.rs), [apps/api/src/crawl/worker.ts:759](apps/api/src/crawl/worker.ts). Not in SUITE-PLAN.
13. **A new wreq client and TLS handshake on every fetch**: [apps/fetch/src/main.rs:170](apps/fetch/src/main.rs) (planned, SUITE-PLAN 2).
14. **No image, font or media blocking, plus a Node round-trip per subresource** through the always-on route: [apps/api/src/browser/pool.ts:199-220,619-622](apps/api/src/browser/pool.ts) (planned, SUITE-PLAN 3).
15. **Per-render connect and disconnect** for lightpanda, camoufox and remote CDP: [apps/api/src/browser/pool.ts:680,758,837](apps/api/src/browser/pool.ts) (planned, SUITE-PLAN 4).
16. **No JS-challenge wait in the render tier.** Content is taken at `domcontentloaded`: [apps/api/src/browser/pool.ts:231-245](apps/api/src/browser/pool.ts).
17. **Non-2xx pages with text return `success: true`** (npmjs 404 probe). There is no status-aware handling in [apps/api/src/core/escalation.ts:134-175](apps/api/src/core/escalation.ts).
18. **No body size cap in helix-fetch**: [apps/fetch/src/main.rs:274-280](apps/fetch/src/main.rs).
19. **The extract call ignores the caller's abort signal** and uses a fixed 30 s timeout: [apps/api/src/extract/client.ts:282-294](apps/api/src/extract/client.ts).
20. **Cross-tier identity mismatch**: the tls tier presents Chrome 149 on macOS, and the chromium tier presents HeadlessChrome 151 on Windows ([apps/fetch/src/profile.rs:231](apps/fetch/src/profile.rs) plus the probes).

### Inferences
- Fixing items 1, 2 and 6 alone would have turned the medium.com run into a single tls fetch of about 0.3 s instead of a four-tier failure. The example.com run would stop at tls instead of chromium.

### Gaps
- Not measured: real end-to-end throughput, which needs extract on 7402, and success rates on a broad URL set. SUITE-PLAN's baseline script does not exist yet.
