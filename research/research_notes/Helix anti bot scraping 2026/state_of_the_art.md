# Anti-bot evasion and scraping efficiency: state of the art (October 2026)

Legend: **[V]** = verified against the primary source in this session (URL read). **[S]** = taken from a search-result snippet or a secondary blog; not read at the primary source. **[T]** = background knowledge, not re-checked this session. **(stale?)** = source dated before 2025.

Research date: 2026-10-05. Several key pages could not be read through Helix (see the benchmarks section, "Observed in this session"); WebFetch was used as the fallback for those.

## 1. Detection layers in 2026 and what each vendor checks

### Takeaway
Detection is now layered and cross-checked: TLS (JA4) and HTTP/2 fingerprints at the edge, IP and residential-proxy reputation, CDP/automation leaks and C++-level fingerprint coherence in the page, then per-site ML on behavior and request sequence. Cloudflare in particular moved in 2025 to per-customer ML models and explicitly targets residential-proxy traffic, so a correct TLS fingerprint plus a residential IP is no longer sufficient on its own.

### Cited Findings
**Cloudflare**
- [V] JA3 broke because Chrome (2023) began randomizing TLS extension order; JA4 (launched September 2023) resists that randomization and adds dimensions such as ALPN. — [Cloudflare blog, 2024-08-12 (stale?)](https://blog.cloudflare.com/ja4-signals/)
- [V] Cloudflare computes JA4 "inter-request signals" over the last hour of global traffic: `browser_ratio_1h`, `cache_ratio_1h`, `h2h3_ratio_1h`, `reqs_quantile_1h`. Scale: 15 million unique JA4 fingerprints per day, 500 million user agents, 50 million requests per second. — [Cloudflare blog, 2024-08-12 (stale?)](https://blog.cloudflare.com/ja4-signals/)
- [V] Per-customer ML bot models (announced 2025-09-23) build a traffic baseline per application. Inputs: HTTP/2 fingerprints and ClientHello extensions (analysts wrote 50 heuristics on these), JA4 in context, behavior (session traversal paths, request sequences), request header structure, and residential-proxy detection that combines network data with client-side fingerprints from challenge solves. — [Cloudflare blog](https://blog.cloudflare.com/per-customer-bot-defenses/)
- [V] Numbers from that post: 11 billion requests tied to residential/commercial proxy networks in 7 days; 138 million scraping requests caught in 24 hours across 5 beta zones; 34% of flagged scraping requests would have been missed by the existing bot score. — [Cloudflare blog, 2025-09-23](https://blog.cloudflare.com/per-customer-bot-defenses/)
- [V] AI Labyrinth (2025-03-19): AI-generated decoy pages with links hidden from humans, stored in R2, marked noindex; activates automatically on "inappropriate bot activity"; following a hidden link is a high-confidence bot signal fed into ML. It targets "bots that don't respect 'no crawl' directives". Free plan and up, opt-in. — [Cloudflare blog](https://blog.cloudflare.com/ai-labyrinth/)
- [S] Cloudflare blocks AI crawlers by default for new domains and opened pay-per-crawl (private beta) on 2025-07-01, the same day Web Bot Auth entered the Verified Bots Program. — [Crawlbase blog](https://crawlbase.com/blog/web-bot-auth-signed-agents/); primary: [Cloudflare pay-per-crawl blog](https://blog.cloudflare.com/introducing-pay-per-crawl/) (not read)
- [S] Pay-per-crawl has an authenticated discovery endpoint `GET https://crawlers-api.ai-audit.cfdata.org/charged_zones` that requires Web Bot Auth. — [Cloudflare changelog 2025-12-10](https://developers.cloudflare.com/changelog/2025-12-10-pay-per-crawl-enhancements/) (snippet only)
- [S] Cloudflare runs a CDP-layer probe for the `Runtime.enable` command, which JavaScript-level stealth patches cannot hide. — [search snippet, Patchright articles](https://dataresearchtools.com/patchright-vs-rebrowser-patches-stealth-playwright-patches-compared-2026/); no Cloudflare primary source found.

**CDP / automation leak (cross-vendor)**
- [V] rebrowser states that `Runtime.Enable` detection is "used by all major anti-bot software such as Cloudflare, DataDome, and others". Other leaks it patches: Puppeteer's `//# sourceURL=pptr:...` annotation and the `__puppeteer_utility_world__` world name. — [rebrowser-patches README](https://github.com/rebrowser/rebrowser-patches)
- [V] Camoufox documents further in-page tells: `navigator.webdriver`, stack/debugger reading tricks, ChromeDriver-injected document variables, `window.__playwright__binding__`, and JS-injection tells (`Object.getOwnPropertyDescriptor` overrides, `toString()` not returning `[native code]`, main-window vs worker mismatch). — [Camoufox README](https://github.com/daijro/camoufox)
- [V] Fingerprint coherence is checked: a Windows UA with an Apple M1 GPU, or a mobile UA with a desktop screen, is flagged. Population share matters too ("If the Linux market share was 5%, then suddenly it's 20%... require all Linux users to complete a captcha"). Some WAFs test SpiderMonkey vs V8 engine behavior, which a Firefox build cannot hide when claiming Chrome. — [Camoufox README](https://github.com/daijro/camoufox)
- [V] Behavioral checks: mouse movement, clicks, scrolling and timing. Camoufox dropped Bézier-curve paths sampled every 10 ms because velocity/jerk profiles separate cleanly from human hands; it now replays one of 2,356 recorded human movements (Cursory). — [Camoufox README](https://github.com/daijro/camoufox)
- [V] Browser Use (2026-02-02) lists the signals anti-bots cross-reference: IP reputation, timezone/locale vs geolocation, GPU/audio/screen consistency, API availability vs claimed OS/browser, mouse/scroll/typing cadence. It claims "traditional stealth methods are detectable within 50ms at scale" (vendor claim, no data shown). — [browser-use.com](https://browser-use.com/posts/bot-detection)

**DataDome, Kasada, Akamai, PerimeterX/HUMAN**
- [S] DataDome keeps a per-request bot score; each anomaly raises it until a block. — [Scrapfly DataDome guide](https://scrapfly.io/blog/posts/how-to-bypass-datadome-anti-scraping) (not read)
- [S] Kasada ships an obfuscated client script that is a custom bytecode interpreter with collection and proof-of-work logic, and checks for CDP, Playwright and patched runtimes. — [crawlex blog](https://blog.crawlex.net/blog/kasada-anti-instrumentation/) (not read)
- [T] Akamai's HTTP/2 fingerprint (SETTINGS values and order, WINDOW_UPDATE, PRIORITY frames, pseudo-header order) originates from Akamai's 2017 Black Hat paper (stale?). Akamai Bot Manager also uses a `sensor_data` JS payload and `_abck` cookie. Not re-verified.
- [T] PerimeterX/HUMAN uses a `_px` cookie family and a "press and hold" challenge. Not re-verified.

### Inferences
- Edge-layer fingerprint (JA4 + h2 + header order) now gates whether a request even reaches the page; Helix's Rust fetch tier must match a current Chrome on all three at once, and match the User-Agent it claims.
- Cloudflare's residential-proxy detection uses fingerprints gathered from challenge solves, so the IP and the browser fingerprint are scored together. Rotating IPs while keeping one fingerprint, or the reverse, creates exactly the inconsistency these models learn.
- Robots-respecting crawlers do not trigger AI Labyrinth by design; following hidden or `nofollow` links is itself a bot signal, so Helix's crawler should skip links hidden by CSS/attributes and honor `nofollow`.

### Gaps
- No primary vendor documentation was read for Akamai, DataDome, HUMAN or Kasada signal lists; their docs are marketing-level and the technical detail lives in third-party reverse-engineering posts.
- No primary Cloudflare source confirms the specific `Runtime.enable` probe; it is widely repeated in secondary sources only.
- Cloudflare Turnstile internals (what the widget measures) were not researched.

## 2. Open-source tools: current status (October 2026)

### Takeaway
For HTTP impersonation, curl_cffi (Python) and wreq (Rust, ex-rquest) are the maintained leaders; wreq is the natural fit for Helix's Rust fetch service. For browsers, the field split into CDP-leak-patched Chromium drivers (nodriver/zendriver, Patchright) and C++-patched engines (Camoufox on Firefox, commercial Chromium forks). rebrowser-patches has fallen behind upstream versions; FlareSolverr is effectively dead and replaced by Byparr.

### Cited Findings
**HTTP impersonation**
- [V] wreq: "Rust HTTP Client for high-fidelity protocol matching, featuring customizable TLS, JA3/JA4, and HTTP/2 signature capabilities"; a reqwest fork on BoringSSL; preserves HTTP/1 header case and controls header order, TLS extensions and HTTP/2 settings; companion `wreq-util` has "100+ browser device emulation profiles"; version 0.16+, Apache-2.0. — [wreq GitHub](https://github.com/0x676e67/wreq)
- [S] rquest was renamed wreq by the same author and every rquest version on crates.io was yanked; wreq 0.16.1 / wreq-util 0.2.0; profiles include `Emulation::Chrome149`. — [search snippets](https://github.com/0x676e67/rquest-deprecated), [crw PR #527](https://github.com/us/crw/pull/527)
- [V] curl_cffi: Python binding to lexiforest's curl-impersonate fork; ~37 built-in fingerprints (more in the commercial impersonate.pro); JA3/TLS, HTTP/2 and JA4 impersonation; HTTP/3 with fingerprints and UDP proxy since v0.15.0; custom JA3/Akamai strings accepted; claims to be "much faster than requests/httpx, on par with aiohttp/pycurl" (no number given). — [curl_cffi GitHub](https://github.com/lexiforest/curl_cffi)
- [V] curl_cffi 0.15.0 scored 26 OK / 3 gated / 2 blocked on 31 targets, beating vanilla Playwright (24/2/5) without any browser. — [Paterson benchmark, 2026-05-13, updated 2026-08-15](https://ianlpaterson.com/blog/anti-detect-browser-benchmark-patchright-nodriver-curl-cffi/)

**Browsers**
- [V] Camoufox: Firefox fork with fingerprint spoofing at the C++ level (navigator, screen, WebGL, AudioContext, fonts, WebRTC IP, geolocation/timezone/locale); Playwright via a patched Juggler that gives automation an isolated copy of the page; identities drawn from Scrapfly's `fpgen` Bayesian network with a coherence check; humanized cursor via recorded paths; ~200 MB memory; cannot fully pass as Chromium (SpiderMonkey tests). Browser is MPL-2.0, launchers MIT, cursor data LGPLv3+. Now has a TypeScript package (`@camoufox/camoufox`). — [Camoufox README](https://github.com/daijro/camoufox)
- [S] Camoufox had about a one-year maintenance gap; the project says performance dropped due to the old Firefox base and new fingerprint inconsistencies; active development moved to CloverLabsAI/camoufox and VulpineOS, with daijro merging checkpoint releases; betas through July-August 2026. — [Centinel Analytica](https://www.centinelanalytica.com/blog/what-is-camoufox), [camoufox.com](https://camoufox.com/)
- [V] Paterson benchmark ran Camoufox on "Firefox 135.0.1-beta.24", consistent with an aging Firefox base. — [Paterson benchmark](https://ianlpaterson.com/blog/anti-detect-browser-benchmark-patchright-nodriver-curl-cffi/)
- [V] rebrowser-patches: fixes `Runtime.Enable` with three modes (`addBinding` default, `alwaysIsolated`, `enableDisable`) via `REBROWSER_PATCHES_RUNTIME_FIX_MODE`; "latest fully tested" Puppeteer 24.8.1 (2025-05-06) and Playwright 1.52.0 (2025-04-17). — [rebrowser-patches README](https://github.com/rebrowser/rebrowser-patches)
- [V] In the Paterson benchmark, rebrowser-playwright ran Chromium 136 and scored the same as vanilla Playwright (24/2/5). — [Paterson benchmark](https://ianlpaterson.com/blog/anti-detect-browser-benchmark-patchright-nodriver-curl-cffi/)
- [S] Patchright is a Playwright fork that stops the automatic `Runtime.enable` and `Target.setAutoAttach` sequences and manages execution contexts by hand; Patchright and rebrowser reached the same fix independently. — [DataResearchTools comparison](https://dataresearchtools.com/patchright-vs-rebrowser-patches-stealth-playwright-patches-compared-2026/)
- [S] FlareSolverr is archived upstream and fails against stricter Cloudflare settings; Byparr is a Camoufox-backed FastAPI server speaking the FlareSolverr API and is the recommended replacement. Scrapling is at v0.4.8 (May 2026) with three fetchers (TLS-impersonated HTTP to full Playwright with a Cloudflare solver). Reported success: Byparr 92.16%, Scrapling StealthyFetcher 58.03% (benchmark source not identified). — [search snippets: Bytesized, ZenRows, godberrystudios](https://bytesized-hosting.com/guides/flaresolverr-on-a-seedbox-cloudflare-bypass-for-indexers) (godberrystudios page returned 404)
- [S] Firecrawl: core engine AGPL-3.0; proxy modes basic, stealth, enhanced, auto; `auto` starts on basic proxies and retries via enhanced proxies on 401/403/429; "fire-engine" (the stealth engine) is closed and only it supports enhanced proxies; a 2026 PR reuses HTTP clients and elevates proxy on 401/403/429. — [Firecrawl proxies docs](https://docs.firecrawl.dev/features/proxies), [PR #4958](https://github.com/firecrawl/firecrawl/pull/4958) (snippets)

### Inferences
- wreq is the strongest drop-in candidate for `apps/fetch`: same language, BoringSSL, header-order and h2 control, and a maintained profile set. Check how current Helix's impersonation profiles are against wreq-util's newest Chrome.
- Camoufox gives the best in-page stealth for free but its Firefox identity cannot pass sites that test for V8; a ladder with both a patched Chromium (Patchright or nodriver-style) and Camoufox covers more ground than either alone.
- rebrowser-patches is a maintenance risk (pinned to April-May 2025 releases); Patchright tracks Playwright more closely.
- Open-source Firecrawl does not include its stealth engine, so it is not a reference for anti-bot technique, only for the escalation pattern.

### Gaps
- zendriver, undetected-chromedriver, SeleniumBase UC/CDP mode, Botasaurus and Crawl4AI stealth mode were not checked at primary sources this session (call budget). Their 2026 status is unknown here.
- No primary benchmark for Byparr's 92.16% figure was found.
- Latest curl_cffi release date was not shown on the README.

## 3. Efficiency: cheaper and faster per page

### Takeaway
The large wins are structural: serve most pages from the HTTP tier (a browser costs 10-100x more), learn per domain which tier works and start there, reuse clearance cookies and browser contexts, and block heavy resources when a browser is needed. Measured resource-blocking savings range from 2-3x on text pages to 5-10x on image-heavy pages, with single-page anecdotes up to 96-99% fewer bytes.

### Cited Findings
- [V] curl_cffi (no browser) matched or beat every stealth browser except nodriver on 31 targets (26 OK vs 25 for Patchright and Camoufox). — [Paterson benchmark](https://ianlpaterson.com/blog/anti-detect-browser-benchmark-patchright-nodriver-curl-cffi/)
- [S] Firecrawl's production pattern is an escalation ladder keyed on status: try cheap proxies first, escalate on 401/403/429. — [Firecrawl docs](https://docs.firecrawl.dev/features/proxies)
- [S] Blocking images, fonts, stylesheets, media and tracking scripts cuts headless-browser wire bytes 5-10x on image-heavy e-commerce pages and 2-3x on text-heavy pages. — [hypeproxies blog](https://hypeproxies.com/blog/tips-to-reduce-proxy-bandwidth-costs)
- [S] Single-page measurements: 524 kB to 17.4 kB (96% cut); 1.9 MB to 8.7 KB with load time 2.614 s to 2.05 s. — [ZenRows / ScrapeOps resource-blocking guides](https://www.zenrows.com/blog/blocking-resources-in-playwright)
- [S] A Playwright scraper cut rotating-proxy bandwidth by over 60% with no loss of success rate. — [DEV Community](https://dev.to/proxyvero/how-we-optimized-a-django-playwright-scraper-to-save-60-on-rotating-proxy-bandwidth-3n5b)
- [V] Camoufox blocks ads via bundled uBlock Origin, can toggle image loading, WebRTC and WebGL, and offers `instantAnimations` (faster but detectable). — [Camoufox README](https://github.com/daijro/camoufox)
- [V] Cloudflare's own signals include `cache_ratio_1h` and `h2h3_ratio_1h` per JA4: a client that never sends HTTP/2/3 or never hits cacheable assets looks unlike browsers sharing its fingerprint. — [Cloudflare JA4 signals](https://blog.cloudflare.com/ja4-signals/)
- [T] `cf_clearance` (Cloudflare) and `datadome` cookies are bound to the IP, User-Agent and TLS fingerprint that solved the challenge; reusing them across requests works only if all three stay the same. Not re-verified this session.
- [T] Conditional requests (`If-None-Match` / `If-Modified-Since` returning 304), `__NEXT_DATA__` / `__NUXT__` / JSON-LD extraction and calling a site's own JSON API avoid rendering entirely. Standard practice; no 2026 numbers found.

### Inferences
- Resource blocking interacts with detection: Cloudflare tracks per-fingerprint cache ratios, so a browser that never loads CSS/images may look abnormal. Block on low-protection domains; load assets on protected ones, or block only third-party media.
- Clearance reuse should be keyed by (domain, proxy session, fingerprint profile), the same tuple the vendor binds the cookie to. Pairing the HTTP tier with a cookie earned by the browser tier needs the HTTP tier to present the same JA4/h2 identity as that browser, or the cookie is rejected.
- A per-domain learned route ("start at the tier that last worked, decay back to cheaper tiers over time") is the single biggest cost lever, because protected domains then skip the failed cheap attempts.

### Gaps
- No independent 2025-2026 measurement of cost per page by tier (HTTP vs headless) was found; the 10-100x figure in the takeaway is an estimate, not a cited number.
- No source measured the latency gain from browser-context reuse or HTTP/2 multiplexing in scraping specifically.
- Vendor guidance on how long `cf_clearance` stays valid was not checked.

## 4. Benchmarks with numbers

### Takeaway
The only independent multi-tool benchmark read in full is Paterson (May-August 2026, 31 targets, 651 verdicts): nodriver led with zero blocks; curl_cffi, CloakBrowser, Patchright and Camoufox clustered just behind; rebrowser-playwright did no better than vanilla Playwright. Vendor-run benchmarks (Scrapfly, Scrapeway) report 91-100% against Cloudflare and DataDome but are self-interested.

### Cited Findings
- [V] Paterson benchmark: 31 targets (JS detection panels, TLS fingerprint endpoints, live Cloudflare/anti-bot sites, high-traffic sites); vendors include Cloudflare, F5 BIG-IP ASM, DataDome, Radware ShieldSquare; 3 sweeps from one residential Mac Studio IP in one night; 651 verdicts. Published 2026-05-13, updated 2026-08-15. — [ianlpaterson.com](https://ianlpaterson.com/blog/anti-detect-browser-benchmark-patchright-nodriver-curl-cffi/)

| Tool | OK | Gated | Blocked | Engine |
|---|---|---|---|---|
| nodriver | 28 | 3 | 0 | Chrome 148.0.7778.168 |
| CloakBrowser | 26 | 3 | 2 | Chromium 145.0.7632.109 |
| curl_cffi | 26 | 3 | 2 | curl_cffi 0.15.0 |
| Patchright | 25 | 3 | 3 | Chrome 148.0.7778.168 |
| Camoufox | 25 | 3 | 3 | Firefox 135.0.1-beta.24 |
| Playwright (vanilla) | 24 | 2 | 5 | Chromium 147.0.7727.15 |
| rebrowser-playwright | 24 | 2 | 5 | Chromium 136.0.7103.25 |

- [S] Scalebrowser's Patchright review: 25 of 31 targets vs Playwright's 24 (appears to reuse the same dataset). — [scalebrowser.net](https://scalebrowser.net/blog/patchright)
- [S] Scrapfly self-reports 98% vs Cloudflare and 96% vs DataDome; a Scrapeway benchmark of 8 scraping APIs against DataDome (August 2026) reportedly had Scrapfly at 100%; a managed API showed 91% initial success vs DataDome; HasData claims >98% Cloudflare, >95% DataDome. — [Scrapfly](https://scrapfly.io/bypass), [Scrapeway](https://scrapeway.com/anti-bot-services/datadome), [Scrapewise](https://scrapewise.ai/blogs/bypass-datadome-web-scraping-2026) (all snippets; Scrapfly's numbers are self-reported, and Scrapeway's independence was not checked)
- [S] Byparr 92.16%, Scrapling StealthyFetcher 58.03% (source and target set not identified). — [search snippet](https://www.zenrows.com/blog/top-stealth-browser-tools)

**Observed in this session (first-hand, Helix 2.2.0 via MCP `helix_scrape`, tier `auto`)**
- `ianlpaterson.com/...` and `scrapeway.com/anti-bot-services/datadome`: Helix returned `reason: challenge`, `detectedBy: ["datadome", ...]` after plain, tls, lightpanda and chromium. WebFetch read the Paterson page without trouble, so this was probably a false positive: the article text mentions DataDome.
- `github.com/rebrowser/rebrowser-patches` and `github.com/lexiforest/curl_cffi` (tier `plain`): Helix flagged `detectedBy: ["datadome"]`. GitHub does not use DataDome; both READMEs mention DataDome in their text. This is a clear false positive in challenge detection.
- `blog.cloudflare.com/per-customer-bot-defenses/` and `/ja4-signals/` (tier `plain`): Helix flagged `detectedBy: ["captcha-widget"]`; WebFetch read both normally. Same false-positive pattern: posts about Turnstile and captchas.
- `github.com/0x676e67/wreq` and `scrapfly.io/blog/...`: chromium tier failed with `browser.newContext: Target page, context or browser has been closed`. The browser pool appears to have crashed; later the `helix` MCP server showed as reconnecting.
- Forcing `tier: "camoufox"` returned `camoufox tier requested but not enabled`.
- `github.com/daijro/camoufox` (auto) and `developers.cloudflare.com/...web-bot-auth/` succeeded.

### Inferences
- Helix's success rate on bot-related content is understated by its own challenge detector: it matches vendor names or widget markers in page text. Detection should key on response structure (status code, challenge script URLs, `cf-mitigated` header, DataDome `x-datadome` / `datadome` cookie, interstitial page shape and size) rather than body keywords. This is likely a cheap, large success-rate gain.
- The chromium pool crash ("context has been closed") cascades across requests; the pool needs a health check and relaunch on browser disconnect.
- A Camoufox tier exists in the API schema but is disabled in this install; enabling it would add the Firefox-engine rung the benchmark shows performing at Patchright level.

### Gaps
- No independent per-vendor breakdown (Akamai vs DataDome vs Kasada vs HUMAN) for open-source tools was found; Paterson's table is aggregate per tool.
- Paterson used one residential IP; results with datacenter IPs (Helix's likely self-host case) will be worse and were not measured.
- Scrapeway and Scrapfly pages could not be read (Helix false positive; call budget), so their methodology is unverified.

## 5. Ethics and legal guardrails

### Takeaway
The industry is moving from "evade and hope" toward declared identity: Cloudflare's Web Bot Auth lets a crawler sign requests with Ed25519 under IETF drafts and be treated as a verified bot, and pay-per-crawl lets publishers price access. Reputable crawlers respect robots.txt (AI Labyrinth exists to trap those that do not) and rate limits.

### Cited Findings
- [V] Web Bot Auth is a Cloudflare verified-bot method based on IETF drafts `draft-meunier-http-message-signatures-directory-03` (key directory) and `draft-meunier-web-bot-auth-architecture-02` (protocol). — [Cloudflare docs](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/)
- [V] Steps: generate an Ed25519 key; host a JWKS at `/.well-known/http-message-signatures-directory` over HTTPS with content type `application/http-message-signatures-directory+json`, with the response itself signed (`tag=http-message-signatures-directory`); register through the dashboard Bot Submission Form with Verification Method "Request Signature". — [Cloudflare docs](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/)
- [V] Each request carries `Signature`, `Signature-Input` (`tag=web-bot-auth`, `keyid` = JWK thumbprint, `created`, `expires`; sign at least `@authority`; about one minute of expiry is "often sufficient") and `Signature-Agent` (a quoted `https://` structured string, included in the signed components). Unsupported: `@query-params`, `@status`, and parameters `sf`, `bs`, `key`, `req`, `name`. — [Cloudflare docs](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/)
- [V] Cloudflare publishes a `web-bot-auth` crate (Rust) and npm package (TypeScript), plus an `http-signature-directory` CLI to validate a directory. — [Cloudflare docs](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/)
- [V] Cloudflare is experimenting with the RFC 7239 `Forwarded` header (`for=` operator) to carry "transitive trust" (site owner, bot operator, end user) and a `content-use` value. — [Cloudflare docs](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/)
- [V] AI Labyrinth targets bots ignoring "no crawl" directives. — [Cloudflare blog](https://blog.cloudflare.com/ai-labyrinth/)
- [S] Pay-per-crawl: the publisher sets a price; the crawler pays it or does not get the page. — [Cloudflare blog](https://blog.cloudflare.com/introducing-pay-per-crawl/) (not read)

### Inferences
- Web Bot Auth fits Helix's self-hosted, BYOK model as a user-configured signing key: the Rust fetch tier signs each request with the operator's own key, and the `web-bot-auth` crate already exists. A signed crawler can be allowed through where an anonymous stealth crawler is blocked.
- Because Web Bot Auth identifies the operator, it does not combine with stealth on the same request. It is an alternative route per domain (signed and declared vs. anonymous), which Helix's routing could choose.
- Helix already has `helix_robots_check`; making robots.txt and per-domain rate limits default-on in the ladder matches what reputable tools do.

### Gaps
- No legal source (case law, ToS enforcement in 2025-2026) was researched; this question was covered only at the protocol level.
- Adoption of Web Bot Auth outside Cloudflare (Akamai, Fastly, others) was not checked.
- Pay-per-crawl general availability status and pricing mechanics were not read at the primary source.
