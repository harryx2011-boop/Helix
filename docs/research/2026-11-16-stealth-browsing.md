# Stealth browsing for Helix: what to study, what to merge

Date: 2026-11-16 (web fetches are stamped 2026-11-17 UTC). Author: Claude (research subagent). Status: research only. No code changed, nothing installed or cloned.

Harry's request: "we need actual stealth browsing btw, find github repos to merge/study ideas". Use case: personal research scraping on his own PC. Helix keeps its robots check.

Legend: **[V]** = verified, with the file:line, URL or command next to it. **[U]** = unverified: background knowledge or a vendor's own claim that was not tested here. Every repo fact in section 3 comes from `gh api` calls run on 2026-11-16 (commands in section 8).

## 0. Short answer

1. Helix's TLS layer already looks like Chrome. Measured today, the `tls` tier sends Chrome's JA4 and Chrome's HTTP/2 settings **[V]** (section 1.3). New TLS libraries add nothing. Keep the tier.
2. The failures are in the browser layers (headless mode, CDP traces, fingerprint consistency), in behaviour, and in IP reputation. The browser rung that should handle them is not running in the live stack at all **[V]** (section 1.2).
3. Ranked picks:
   1. **patchright** (already installed through Scrapling): run it the way its authors say is undetectable (real Google Chrome, headed, persistent profile, no injected identity). Small to medium effort.
   2. **Camoufox** as the top automatic rung: patched Firefox that sets its identity in C++, not JavaScript. Run it as a separate process. Medium effort.
   3. **rebrowser-patches** (`rebrowser-playwright`) for the Node Playwright pool (screenshots, actions, interact). Small to medium effort.
   4. **curl_cffi / curl-impersonate**: keep them, and add the **FlareSolverr/Byparr cookie hand-off** (the browser clears the challenge, the cheap `tls` tier reuses the cookie). Medium effort.
   5. **A real-browser rung**: a dedicated Chrome profile (or Cortex) attached over CDP through Helix's existing `remoteCdpUrl`. Medium effort.
4. This conflicts with Harry's 2026-11-12 decision to keep only SearXNG and CX-Obscura and drop the `tls` and Chromium fallbacks (`context.md:3`). Obscura's `-stealth` build changes only the TLS transport. In R0 it changed nothing on the 9 blocked pages **[V]** (section 1.4). Question 1 in section 9 asks Harry to settle this.

## 1. Helix's fetch path today

### 1.1 The ladder (code on `main`, 51b5c75)

| Step | What it does | Evidence |
|---|---|---|
| Tiers | `plain`, `tls`, `browser`, cheapest first | `apps/api/src/core/escalation.ts:24-26` [V] |
| Start | `auto` starts at `tls`; `plain` only when asked | `context.md:110` [V] |
| Escalation | Climbs only on evidence: a block verdict or missing content | `escalation.ts:133-171` [V] |
| `plain`/`tls` | helix-scrape `/fetch`; `tls` sets `impersonate` | `apps/api/src/core/pipeline.ts:226-241` [V] |
| `tls` client | curl_cffi `AsyncSession(impersonate=target)` | `apps/scrape/helix_scrape/fetcher.py:21-22,143,148` [V] |
| Identities | Helix names mapped to curl_cffi targets (default chrome150, Windows UA) | `apps/scrape/helix_scrape/profiles.py:1-8,16-21` [V] |
| `browser` | helix-scrape `/render`: Scrapling `AsyncStealthySession` | `apps/scrape/helix_scrape/render.py:1-5,78-81` [V] |
| Browser driver | Scrapling's stealth session imports **patchright** | `D4Vinci/Scrapling` `scrapling/engines/_browsers/_stealth.py:7-10` (`gh api .../contents`) [V] |
| Browser mode | `headless: True`; `hide_canvas`, `google_search` only with `stealth`; `solve_cloudflare` opt-in | `render.py:189,195-200` [V] |
| Identity on `/render` | The pipeline sends a UA, Accept-Language, timezone, screen and a fingerprint script | `pipeline.ts:272`, `context.md:27` [V] |
| Playwright pool | Screenshots, PDF, actions, phone viewport and other engines go to the Node Playwright pool | `pipeline.ts:198`, `escalation.ts:8-10` [V] |
| Pool stealth | Launch flags (`AutomationControlled` off, WebRTC lock) and JavaScript overrides (`webdriver`, plugins, `[native code]` toString, canvas noise) | `apps/api/src/browser/engines.ts:25-31`; `apps/api/src/browser/profiles.ts:240-283,335-378,429` [V] |
| Pool and CDP | Stock Playwright. Patchright was evaluated and not adopted (its init-script routing would need re-proving against the private-address guard) | `context.md:123` [V] |
| Memory | Per-host tier floor (30 min), cookie jar per host+proxy+tier+profile | `context.md:125-127` [V] |
| Clearance cookies | `/render` returns cookies such as `cf_clearance` and Helix drops them; no `host_sessions` code | `context.md:8` [V] |
| Block detection | Cloudflare, DataDome, PerimeterX, Akamai, Imperva, AWS WAF, Turnstile markers | `apps/api/src/core/block-detection.ts:145-214` [V] |
| Robots | Crawl and batch respect robots.txt by default; single `/scrape` has no check (only a comment) | `apps/api/src/config.ts:44`, `routes/batch.ts:96`, `crawl/worker.ts:284,389`, `routes/scrape.ts:59` (grep) [V] |

### 1.2 What actually runs (live stack)

- `~/.claude/hooks/helix-ensure.js:145-149` starts the old Rust `helix-fetch.exe` on 7401. Nothing starts helix-scrape on 7403. **[V]**
- `netstat` today: 7400 (API) and 7401 (Rust fetch) listening; 7403 not listening. **[V]**
- So the browser rung gets a 404 from `/render` and reports `service_unavailable` (`context.md:6`) **[V from the 2026-11-11 audit]**. The patched-Chromium rung exists in code but is not live.

### 1.3 Measured today: the `tls` tier already looks like Chrome

`helix_scrape https://tls.peet.ws/api/clean` (live stack, profile `chrome-149`):

| Tier | JA4 | HTTP/2 (Akamai) fingerprint |
|---|---|---|
| `tls` | `t13d1516h2_8daaf6152771_d8a2da3f94cd` | `1:65536;2:0;4:6291456;6:262144\|15663105\|0\|m,a,s,p` |
| `plain` | `t13d2811h2_257f3020b3a2_78e6aca7449b` | `4:2097152;5:16384;6:16384\|5177345\|0\|m,s,a,p` |

**[V]** for the values. The `tls` row has Chrome's cipher-count shape (15 ciphers, 16 extensions, h2), Chrome's HTTP/2 SETTINGS (header table 65536, push off, window 6291456, header list 262144) and the m,a,s,p pseudo-header order. **[U]** that it matches a live Chrome 150 byte for byte: no real Chrome was measured beside it. `plain` is plainly not a browser.

### 1.4 Where it fails (evidence)

| Finding | Source |
|---|---|
| g2.com and the nopecha Cloudflare demo: 403 on every path (Rust tls, Python tls, plain, default render, stealth render) | `docs/audits/2026-11-11-scrapling-live-timing.md:23,28,87,89` [V] |
| Scrapling's Cloudflare solver on nopecha: ran 60.7 s and timed out | same file, line 28 [V] |
| npmjs: the browser renders got 403 challenge pages while the `tls` tier got the real 497 KB page | same file, line 28 [V] |
| 2.3.0 bench: airbnb, g2, zillow, indeed still blocked at the browser tier | `context.md:137` [V] |
| Home IP, plain headless Chromium (Playwright build 1194): blocked on 6 of 9 (stackoverflow, npmjs, reddit, ebay, walmart, google) | `D:\Cortex - Web Browser\docs\plans\2026-11-12-cx-obscura-and-rust.md:30` [V] |
| boat VM (datacenter IP), stock Obscura 0.2.6 vs headless Chrome: both blocked on 6 of 24 | same plan, line 91 [V] |
| Obscura `-stealth` build vs default on 9 blocked pages: no page moved from blocked to content | same plan, lines 141-155 [V] |

Reading the evidence together: the TLS and HTTP/2 layer is solved where Helix uses it. What fails is
- a **headless** browser,
- a browser with **page-world JavaScript overrides**, which rebrowser's own detector flags (section 2),
- a **datacenter IP**.

A residential home IP alone did not get headless Chromium through (6 of 9 blocked). So the browser layers matter even at home.

### 1.5 Direction already on record

- 2026-11-12: "remove helix fallbacks like chromium, tls, etc. we use searxng and cx-obscura" (`context.md:3`) **[V]**.
- 2026-11-13 amendment, for Cortex: agent pages stay on "Chromium with stealth, no Obscura". R7 (Helix) still uses CX-RustEngine "until Harry says otherwise" (`2026-11-12-cx-obscura-and-rust.md:12,25-27`) **[V]**.
- Obscura's README: `-stealth` = "stealth transport" through wreq/BoringSSL. The rendering build uses rustls (`gh api repos/h4ckf0r0day/obscura/readme`) **[V]**. So Obscura stealth covers layer 1 below, which Helix's `tls` tier already covers. It does not cover layers 3-5.

## 2. The six detection layers, in plain words

| # | Layer | What the site checks | Repos that address it |
|---|---|---|---|
| 1 | **TLS handshake (JA3/JA4)** | The order of ciphers and extensions in the first packet. Python `requests` or Node `fetch` have a handshake no browser has, so the site knows before any page loads. | curl_cffi, curl-impersonate (both forks), wreq, tls-client; Obscura `-stealth`; Scrapling (via curl_cffi). Helix `tls` tier: done **[V 1.3]**. |
| 2 | **HTTP/2 frames** | The SETTINGS values, window update and header order a client sends. Each browser has its own pattern ("Akamai fingerprint"). | Same libraries as layer 1. Helix `tls` tier: done **[V 1.3]**. |
| 3 | **CDP leaks (automation traces)** | Playwright and Puppeteer call `Runtime.enable` on every frame. A few lines of page script can tell it was called, and "all major anti-bot software" uses this per rebrowser **[V: rebrowser-patches README]**. Other traces: the `UtilityScript` name in stack traces, `navigator.webdriver`, automation launch flags, `HeadlessChrome` in the UA. | patchright (no `Runtime.enable`, console off, flag fixes) **[V README]**; rebrowser-patches (`addBinding`/`alwaysIsolated` modes, helper renamed, webdriver flag) **[V README]**; nodriver, zendriver, pydoll, SeleniumBase CDP mode (CDP without WebDriver) **[V description]**; Camoufox avoids CDP entirely (Juggler in an isolated world) **[V README]**. |
| 4 | **Navigator, canvas and other fingerprints** | Hundreds of values (UA, platform, screen, WebGL GPU, fonts, audio, canvas pixels, timezone vs IP) that must agree with each other. JavaScript overrides leave marks: `toString()`, property descriptors, workers and iframes that miss the patch. | Camoufox (C++ level, real-device distribution, coherence check) **[V README]**; CloakBrowser (87 C++ patches, closed binary) **[V README]**; BotBrowser (proprietary core) **[V README]**; invisible-playwright (C++-patched Firefox) **[V README]**; fingerprint-suite and browserforge (generate and inject; injection is page-world JS). rebrowser reports that adding `puppeteer-extra-plugin-stealth` turns `nativeTampering` and `workerConsistency` red **[V README]**. |
| 5 | **Behaviour** | Mouse paths, typing rhythm, scroll, timing, and whether a "user" clicks a Turnstile box like a person. A scraper that only reads a page shows little here, but challenge pages score it. | Camoufox `humanize` (2,356 recorded human paths, LGPL Cursory) **[V README]**; CloakBrowser `humanize` **[V README]**; botasaurus "Humane Driver" **[V README]**; pydoll "realistic interactions" **[V description]**. |
| 6 | **IP reputation** | Datacenter ranges, known proxy pools, request rate per IP. No browser fix helps when the IP is flagged. | None in code. Camoufox and patchright READMEs both sell residential proxies. Measured: datacenter VM blocked 6/24 with stealth on or off; home IP did not save headless Chromium (6/9 blocked) **[V 1.4]**. Helix's `PolitenessController` and host gate pace requests (`context.md:55`). |

CAPTCHA handling sits across layers 5 and 6:
- Scrapling's `solve_cloudflare` clicks Turnstile. It timed out on nopecha **[V 1.4]**.
- FlareSolverr says "none of the captcha solvers work" (README line 363) **[V]**.
- Byparr depends on `playwright-captcha`, which offers Turnstile and reCAPTCHA clicks or paid 2captcha **[V PyPI summary]**.

## 3. Repo table

Status rule: **maintained** = a commit in the last 90 days (since 2026-08-18); **slow** = 90 days to 12 months; **stale** = no commit in over 12 months. "Release" is `releases/latest` unless marked; repos with none show the newest tag or package-registry version. Stars, license, last commit and release came from `gh api` on 2026-11-16 **[V]**. Technique text comes from the README **[V README]** or, where marked (desc), from the GitHub description only.

### 3.1 Transport (layers 1-2)

| Repo | What and technique | Lang | License | Stars | Last commit | Latest release (date) | Status |
|---|---|---|---|---|---|---|---|
| lexiforest/curl_cffi | Python binding to curl-impersonate; TLS/JA3/JA4 + HTTP/2 impersonation (desc) | Python | MIT | 6,877 | 2026-10-27 | v0.17.0 (2026-10-26) | maintained |
| lexiforest/curl-impersonate | Active fork of curl-impersonate: Chrome, Firefox, Safari targets (desc) | C/Python | MIT | 2,889 | 2026-10-29 | v2.3.2 (2026-10-30) | maintained |
| lwthiker/curl-impersonate | The original curl build (desc) | C/Python | MIT | 7,195 | 2024-03-03 | v0.6.1 (2024-03-02) | stale |
| 0x676e67/wreq | Rust HTTP client on BoringSSL with browser emulation; Obscura `-stealth` uses it [V Obscura README] | Rust | Apache-2.0 | 1,113 | 2026-11-15 | v0.16.3 (2026-10-30); newest tag v6.0.0-rc.31 | maintained |
| bogdanfinn/tls-client | Go client with selectable TLS fingerprints (desc) | Go | BSD-3-Clause | 1,945 | 2026-11-11 | v1.18.1 (2026-11-11) | maintained |

### 3.2 Patched Chromium drivers (layer 3)

| Repo | What and technique | Lang | License | Stars | Last commit | Latest release (date) | Status |
|---|---|---|---|---|---|---|---|
| Kaliiiiiiiiii-Vinyzu/patchright | Patched Playwright driver: no `Runtime.enable` (isolated contexts), Console API off, flag fixes, closed shadow roots; init scripts via routes [V README] | TS | Apache-2.0 | 5,206 | 2026-11-12 | v1.64.1 (2026-10-15) | maintained |
| Kaliiiiiiiiii-Vinyzu/patchright-python | Python package of the above. Best practice: `channel="chrome"`, `headless=False`, persistent context, no custom UA or headers [V README:189-206] | Python | Apache-2.0 | 1,603 | 2026-11-10 | v1.62.0 (2026-08-17); PyPI 1.64.4 (2026-11-02) | maintained |
| rebrowser/rebrowser-patches | Patches for Puppeteer/Playwright: `Runtime.enable` fix (`addBinding` default), sourceURL and `UtilityScript` renamed, webdriver flag, popup and IPC flags; drop-in `rebrowser-playwright` [V README] | JS | MIT | 1,464 | 2026-11-02 | v1.1.3 (2026-11-02); npm rebrowser-playwright 1.64.102 (2026-11-02) | maintained |
| ultrafunkamsterdam/nodriver | CDP-only async driver, no WebDriver or Selenium; successor of undetected-chromedriver [V README] | Python | AGPL-3.0 | 4,944 | 2026-10-26 | none; PyPI 0.50.99 (2026-10-26) | maintained |
| cdpdriver/zendriver (was stephanlensky/zendriver) | nodriver fork, async-first, Docker (desc) | Python | AGPL-3.0 | 1,483 | 2026-10-02 | v0.17.1 (2026-10-02) | maintained |
| autoscrape-labs/pydoll | Chromium over CDP without WebDriver, realistic interactions (desc) | Python | MIT | 7,144 | 2026-11-08 | 3.0.1 (2026-11-08) | maintained |
| seleniumbase/SeleniumBase | Test and scrape framework; "CDP Mode" for bot-detection bypass (desc) | Python | MIT | 13,268 | 2026-11-16 | v4.58.1 (2026-11-16) | maintained |
| ultrafunkamsterdam/undetected-chromedriver | Patched chromedriver (desc) | Python | GPL-3.0 | 12,907 | 2025-07-05 | none; PyPI 3.5.5 (2024-02-17) | stale |
| ttlns/Selenium-Driverless (was kaliiiiiiiiii) | Stealthy CDP framework; patchright borrows parts [V patchright README] | Python | MIT | 859 | 2026-10-30 | none | **archived** |

### 3.3 Fingerprint-level browsers (layers 4-5)

| Repo | What and technique | Lang | License | Stars | Last commit | Latest release (date) | Status |
|---|---|---|---|---|---|---|---|
| daijro/camoufox | Patched Firefox: identity drawn from real-device data, answered from C++ (navigator, screen, WebGL, fonts, audio, WebRTC IP, timezone); Juggler isolated world; `humanize`; GeoIP; per-context identities; uBlock by default [V README] | C | MPL-2.0 browser; MIT Python/TS packages; LGPL-3.0+ Cursory paths | 13,354 | 2026-11-16 | v158.0.1-beta.41 (2026-10-29); prerelease v159.0-beta.42 (2026-11-15); PyPI 0.5.9 (2026-11-01) | maintained |
| oss-invisible/playwright (`invisible-playwright`) | Playwright wrapper for a Firefox patched at C++ level; fingerprint set in the engine; Windows and Linux x64 [V README] | Python | MIT | 2,590 | 2026-11-16 | v0.53.1 (2026-11-16) | maintained |
| CloakHQ/CloakBrowser | Closed Chromium binary with 87 C++ patches; `humanize`; drop-in Playwright/Puppeteer. Wrappers MIT; the binary needs a license key (free key: one concurrent session; no redistribution) [V README] | Python | MIT wrappers; binary under BINARY-LICENSE | 32,931 | 2026-11-12 | chromium-v156.0.8078.47.1-pro (2026-11-03); PyPI 0.7.2 (2026-11-10) | maintained |
| botswin/BotBrowser | Chromium-based "privacy browser core". "The full core remains proprietary"; binaries on request [V README:304,334] | TS | repo MIT; core proprietary | 2,668 | 2026-11-16 | 157.0.8103.78 (2026-11-16) | maintained |
| apify/fingerprint-suite | Fingerprint generator (real-traffic model) plus injector (desc) | TS | Apache-2.0 | 2,672 | 2026-11-09 | v2.1.90 (2026-11-09) | maintained |
| berstend/puppeteer-extra | Stealth plugin: JavaScript evasions. rebrowser shows these evasions are detectable [V rebrowser README] | JS | MIT | 7,422 | 2023-03-01 | none; npm stealth 2.11.2 (2023-03-01) | stale |
| AtuboDad/playwright_stealth | Python port of the puppeteer evasions (desc) | Python | MIT | 990 | 2023-09-11 | none | stale |
| Mattwmaster58/playwright_stealth | Maintained fork; PyPI `playwright-stealth` (crawl4ai depends on it) [V crawl4ai pyproject] | Python | MIT | 272 | 2026-04-04 | none; PyPI 2.0.3 (2026-04-04) | slow |
| ulixee/hero | "The web browser built for scraping" (desc) | TS | MIT | 1,559 | 2026-05-16 | v2.0.0-alpha.34 (2025-09-08) | slow |
| ZFC-Digital/puppeteer-real-browser | Puppeteer acting as a real browser against Cloudflare (desc) | JS | MIT | 1,649 | 2025-09-03 | 1.3.12 (2024-09-09) | stale |

### 3.4 Frameworks and products (mixed layers)

| Repo | What and technique | Lang | License | Stars | Last commit | Latest release (date) | Status |
|---|---|---|---|---|---|---|---|
| D4Vinci/Scrapling | Framework: curl_cffi fetcher, patchright stealth sessions, browserforge and Apify fingerprint data, Cloudflare click solver [V pyproject, `_stealth.py`] | Python | BSD-3-Clause | 103,639 | 2026-11-11 | v0.5.1 (2026-11-04) | maintained |
| omkarcloud/botasaurus | Scraper framework: "Humane Driver", browser-based fetch, Cloudflare claims [V README] | Python/TS | MIT | 5,846 | 2026-11-13 | none; PyPI 4.0.97 (2026-01-06) | maintained |
| unclecode/crawl4ai | AI crawler; depends on playwright, patchright, playwright-stealth [V pyproject] | Python | Apache-2.0 | 87,451 | 2026-11-04 | v0.9.5 (2026-10-14) | maintained |
| firecrawl/firecrawl (was mendableai) | Open repo has the **client** for fire-engine: engines `fire-engine;chrome-cdp`, `;tlsclient`, each with a `;stealth` variant, plus a `stealthProxy` feature [V `apps/api/src/scraper/scrapeURL/engines/index.ts:54-91,116,142`]. Self-host runs "bundled Playwright with basic fetch fallback"; fire-engine is a separate service; "enhanced proxy paths" are Cloud-only [V SELF_HOST.md, docs.firecrawl.dev/contributing/open-source-or-cloud] | TS | AGPL-3.0 | 202,357 | 2026-11-16 | v2.11.0 (2026-06-19); newest tag v2.11.762 | maintained |
| steel-dev/steel-browser | Browser API; puppeteer-core 23.6 + fingerprint-generator/injector 2.1.82 [V api/package.json] | TS | Apache-2.0 | 7,974 | 2026-11-16 | v0.5.5-beta (2026-10-31) | maintained |
| browser-use/browser-use | AI browser agent on raw CDP; "stealth browsers" are a Cloud product (desc) | Python | MIT | 121,233 | 2026-11-16 | 1.0.6 (2026-11-16) | maintained |
| Skyvern-AI/skyvern | AI workflows on Playwright 1.61 [V pyproject] | Python | AGPL-3.0 | 23,434 | 2026-11-17 UTC | v1.0.58 (2026-11-15) | maintained |
| lightpanda-io/browser | Zig headless browser; README has `--obey-robots` and no stealth claims (grep) | Zig | AGPL-3.0 | 42,143 | 2026-11-16 | 1.0.4 (2026-11-13) | maintained |
| h4ckf0r0day/obscura | Rust headless engine; `-stealth` = TLS transport via wreq/BoringSSL [V README] | Rust | Apache-2.0 | 35,938 | 2026-11-14 | v0.2.7 (2026-11-13) | maintained |

### 3.5 Challenge solvers (cookie hand-off)

| Repo | What and technique | Lang | License | Stars | Last commit | Latest release (date) | Status |
|---|---|---|---|---|---|---|---|
| FlareSolverr/FlareSolverr | Proxy server: undetected-chromedriver opens the URL, waits out the Cloudflare challenge, returns HTML and cookies "used to bypass Cloudflare using other HTTP clients"; captcha solvers do not work [V README:12-21,363] | Python | MIT | 16,247 | 2026-10-24 | v3.5.2 (2026-09-12) | maintained |
| ThePhaseless/Byparr | FlareSolverr-style API on `invisible-playwright` (patched Firefox) + `playwright-captcha` [V pyproject] | Python | GPL-3.0 | 2,104 | 2026-11-09 | v3.1.1 (2026-11-05) | maintained |
| sarperavci/CloudflareBypassForScraping | Pool of real Brave browsers driven by DrissionPage; returns `cf_clearance` plus the exact UA; Turnstile tokens; request mirroring [V README:3-68] | Python | MIT | 2,651 | 2026-11-02 | none | maintained |

That is 36 rows (the brief asked for at least 15).

## 4. Recommended ladder for Helix

Effort: **small** = under a day, **medium** = 1-3 days, **large** = over 3 days (estimates [U]).

Helix is Apache-2.0 and public (`LICENSE`, `gh api repos/harryx2011-boop/helix` → `Apache-2.0`, `private: false`) **[V]**. So:
- **AGPL-3.0** code (nodriver, zendriver, Firecrawl, Lightpanda, Skyvern) and **GPL-3.0** code (Byparr, undetected-chromedriver) cannot be copied into Helix without relicensing it. Study only. **[U: general license reading, not legal advice]**
- **MPL-2.0** (Camoufox browser) is file-level copyleft. An unmodified binary run as a separate process is fine. Changes to MPL files must be published.
- **LGPL** (Cursory, inside Camoufox) rides inside that binary.
- MIT, BSD and Apache-2.0 are fine as dependencies.

| Rung | What | Merge or study | License | Effort | Why |
|---|---|---|---|---|---|
| 0 `plain` | Unchanged; explicit only | — | — | none | Not a browser handshake [V 1.3] |
| 1 `tls` | Keep curl_cffi 0.17.0 (Python) or wreq (Rust). **Add:** reuse clearance cookies and the browser's exact UA from rung 2/3 per host (the FlareSolverr/Byparr/CloudflareBypassForScraping pattern) | curl_cffi: dependency (already in). Solvers: study only | MIT; study GPL/MIT | medium (the `host_sessions` table is already planned, migration 016, `context.md:25`) | Chrome JA4/H2 measured today [V]. Cookies are dropped today [V `context.md:8`]. Whether Cloudflare accepts `cf_clearance` on curl_cffi is **[U]**: the audit itself calls it a guess (`2026-11-11-scrapling-wiring-and-gaps.md:153`) |
| 2 `browser` (patched Chromium) | First make it live (Phase 0 of the v3 plan). Then follow patchright's best practice: installed **Google Chrome** (`channel="chrome"`), **headed** (off-screen or on a hidden desktop), persistent profile per host, **no** injected UA, headers or fingerprint script on this rung | patchright: dependency (already in via Scrapling 0.5; patchright 1.64.4) | Apache-2.0 | small to medium | Today it runs headless (`render.py:189`) and injects an identity (`pipeline.ts:272`). patchright's own README says not to do either [V patchright-python README:189-206] |
| 2b Node pool (screenshots, actions, interact) | Swap `playwright` for `rebrowser-playwright` (npm alias) in `addBinding` mode; remove page-world overrides one at a time and keep only what a test page proves is needed | rebrowser-playwright: dependency | MIT | small to medium | Fixes `Runtime.enable`, `UtilityScript`, webdriver [V README]. The `addBinding` mode keeps normal init scripts, so the private-address guard concern that stopped patchright (`context.md:123`) does not apply in the same way **[U: needs the guard tests re-run]** |
| 3 `camoufox` (fingerprint-level) | Camoufox as an automatic top rung, run as `camoufox server` (remote Playwright) and reached over the pool's remote connection. Helix had this connection code before v3 (`context.md:56-57`) | Camoufox: dependency (binary, separate process). invisible-playwright: study as the alternative | MPL-2.0 binary, MIT package | medium | C++-level identity, isolated world, humanize, GeoIP [V README]. Firefox only: "some WAFs test SpiderMonkey engine behaviour" [V README] |
| 4 real browser (manual-grade) | A dedicated, persistent Chrome profile Harry signs into once, attached over CDP through Helix's `remoteCdpUrl` (`apps/api/src/browser/pool.ts:157,538,780`). Or Cortex, Harry's own Chromium browser, through Cornea | No new dependency | — | medium | Chrome 136+ ignores `--remote-debugging-port` on the default profile and needs a non-default `--user-data-dir` [V developer.chrome.com/blog/remote-debugging-port]. A real headed browser with history and a home IP is the strongest available option **[U]**. Never point it at Harry's main accounts |
| Not on the ladder | CloakBrowser and BotBrowser (closed binaries; CloakBrowser's free key allows one session and no redistribution); paid CAPTCHA farms; paid proxies | Test-only, by hand, if Harry wants a data point | proprietary | small (to test) | Cannot ship inside an open-source Helix |

Study list (ideas, no code copied):
- **SeleniumBase CDP mode**, **nodriver** and **pydoll**: CDP-only driving with no WebDriver.
- **botasaurus**: humane driver, browser-based fetch.
- **fingerprint-suite/browserforge**: the coherence data. Inject nothing.
- **Firecrawl's engine waterfall**: `index.ts:78-142`, priorities and the `stealthProxy` feature.

## 5. A measurable before/after test

Run nothing heavy on the PC without the queue (`rules/pc-resources.md`). This research ran only the status checks below and two `tls.peet.ws` calls.

**Pages** (HTTP status from plain `curl -L` with a Chrome UA, 2026-11-16) **[V]**:

| Group | URL | Today | What it measures |
|---|---|---|---|
| Transport | https://tls.peet.ws/api/all (and `/api/clean`) | 200 | JA3, JA4, HTTP/2 Akamai fingerprint |
| Transport | https://tls.browserleaks.com/json | 200 | Second opinion on JA3/JA4 |
| Leak | https://browserleaks.com/webrtc | 200 | WebRTC IP leak behind the guard proxy |
| CDP/automation | https://bot-detector.rebrowser.net/ | 200 | `Runtime.enable`, `UtilityScript`, `nativeTampering`, `workerConsistency` |
| CDP/automation | https://bot.sannysoft.com/ | 200 | webdriver, plugins, headless tells (older tests) |
| Fingerprint | https://abrahamjuliot.github.io/creepjs/ | 200 | Lies, tampering, headless score |
| Fingerprint | https://www.browserscan.net/bot-detection | 200 | Bot verdict |
| Fingerprint | https://pixelscan.net/ | 200 | Consistency verdict |
| Fingerprint | https://bot.incolumitas.com/ | 200 | Behaviour and fingerprint tests |
| Fingerprint | https://deviceandbrowserinfo.com/are_you_a_bot | 200 | Bot verdict |
| Fingerprint | https://demo.fingerprint.com/playground | 200 | Fingerprint.com bot detection result |
| Fingerprint | https://fingerprint-scan.com/ | 200 | Bot score |
| Fingerprint | https://iphey.com/ | 200 | Identity consistency |
| Challenge | https://nopecha.com/demo/cloudflare | 403 (challenge) | Cloudflare managed challenge |
| Challenge | https://www.scrapingcourse.com/cloudflare-challenge | 403 (challenge) | Cloudflare challenge |
| Challenge | https://www.scrapingcourse.com/antibot-challenge | 403 (challenge) | Mixed anti-bot |
| Challenge | https://turnstile.zeroclover.io/ | 403 (challenge) | Turnstile |
| Challenge | https://2captcha.com/demo/cloudflare-turnstile | 200 | Turnstile widget |
| Challenge | https://demo.turnstile.workers.dev/ | 200 | Cloudflare's own Turnstile demo |
| Score | https://antcpt.com/score_detector/ | 200 | reCAPTCHA v3 score (0.1-0.9) |
| Dead | https://kaliiiiiiiiii.github.io/brotector/ | 404 | Patchright README still links it; skip |
| Dead | https://arh.antoinevastel.com/bots/areyouheadless | 502 | Skip |

**Real sites:**
- Helix's 32-URL bench (`apps/api/scripts/bench-scrape.mjs`, `context.md:97`).
- The 9 pages of Cortex's `exp.sh` (stackoverflow, npmjs, reddit, ebay, google, walmart, booking, airbnb, youtube).
- g2.com, zillow, indeed: the 2.3.0 failure set.

**Protocol:**
1. **Baseline:** each rung (`tls`, `browser`, pool `chromium`) on every page. 3 runs, median, serial, from the home IP. Repeat the challenge and real-site groups on the boat VM to separate IP effects from browser effects.
2. **Record per page and rung:**
   - pass or fail on the page's own verdict;
   - "useful success" (at least 100 bytes of markdown, `context.md:97`);
   - wall time;
   - JA4;
   - the rebrowser-detector red rows.
3. **After each change** (2, 2b, 3, 4 in section 4), rerun the same set. A change counts only if it moves pages from fail to pass on the home IP without new failures in the 32-URL bench.
4. **Target:** the 6 of 9 `exp.sh` pages that block headless Chromium at home, and the 4 walled sites from the 2.3.0 bench.

## 6. Legal and terms-of-service limits (plain)

- robots.txt and a site's terms are separate. robots.txt can allow a path while the terms forbid automated access. Getting past a bot wall can breach the terms even for personal research **[U: general, not legal advice; the law differs by country]**.
- Helix keeps its robots check: crawl and batch respect it by default **[V 1.1]**. Single `/scrape` has no robots check today **[V grep]**. Question 7 in section 9 asks whether stealth rungs should require it.
- Helix's own option docs already say "Respect the site's terms and robots.txt" (`routes/scrape.ts:59`) **[V]**.
- Projects state their own limits:
  - patchright: "educational purposes only" **[V README]**;
  - CloakBrowser's binary license prohibits "access without authorization, credential stuffing, and account creation abuse" **[V README]**;
  - BotBrowser: "authorized ... research only" **[V README]**.
- Rung 4 uses a signed-in profile. A ban hits that account. Keep it to a throwaway profile with no main accounts.
- Do not send CAPTCHAs to human-solver services. Do not log in to sites you do not own an account on. Do not create accounts by automation.

## 7. Upstream watch (Harry's standing rule, 2026-11-16)

| Repo | What Helix uses or last studied | Upstream now | New since? |
|---|---|---|---|
| D4Vinci/Scrapling | 0.5, exact pin (`apps/scrape/pyproject.toml:13`, `uv.lock:1316-1317`) | v0.5.1 (2026-11-04) | **Yes** |
| lexiforest/curl_cffi | 0.17.0 (`uv.lock:248-249`) | v0.17.0 (2026-10-26) | No |
| patchright (Python) | 1.64.4 via Scrapling (`uv.lock:988-989`) | PyPI 1.64.4 (2026-11-02); driver repo commit 2026-11-12 | No release; driver commits since |
| playwright (Python) | 1.64.1 (`uv.lock:1016-1017`) | — (not checked) | — |
| browserforge | 1.2.4 (`uv.lock:114-115`) | 1.2.4 (2026-02-03) | No |
| h4ckf0r0day/obscura | 0.2.6 measured 2026-11-12 (Cortex plan:63) | v0.2.7 (2026-11-13) | **Yes** |
| daijro/camoufox | Dropped in v3 (2026-11-01) | v158.0.1-beta.41 (2026-10-29); prerelease v159.0-beta.42 (2026-11-15) | **Yes** (prerelease) |
| lightpanda-io/browser | Dropped in v3 | 1.0.4 (2026-11-13) | **Yes** |
| firecrawl/firecrawl | Studied 2026-11-11 (`docs/audits/2026-11-11-firecrawl-*.md`) | Latest GitHub release v2.11.0 (2026-06-19); tags up to v2.11.762; commit 2026-11-16 | Tags and commits since; no new GitHub release |
| Rust `helix-fetch.exe` (still live on 7401) | 1.7.0, source deleted in v3 | — | Not tracked upstream |

## 8. Method and commands

- Repo facts:
  - `gh api repos/OWNER/REPO --jq '{full_name, stars: .stargazers_count, license: .license.spdx_id, pushed_at, archived, language}'`
  - `gh api repos/OWNER/REPO/releases/latest`
  - `gh api repos/OWNER/REPO/commits?per_page=1`
  - `gh api repos/OWNER/REPO/tags?per_page=1`
  - `gh api repos/OWNER/REPO/releases?per_page=4` (camoufox, CloakBrowser, BotBrowser, lightpanda, firecrawl)
  - All run 2026-11-16, 36 repos. Renamed repos resolved by the API: `mendableai/firecrawl` → `firecrawl/firecrawl`, `stephanlensky/zendriver` → `cdpdriver/zendriver`, `kaliiiiiiiiii/Selenium-Driverless` → `ttlns/Selenium-Driverless`. `Skyvern` = `Skyvern-AI/skyvern`.
- Package versions:
  - `https://pypi.org/pypi/<name>/json`: nodriver, botasaurus, undetected-chromedriver, playwright-stealth, camoufox, cloakbrowser, patchright, scrapling, zendriver, pydoll-python, curl_cffi, invisible-playwright, playwright-captcha, browserforge;
  - `https://registry.npmjs.org/<name>`: puppeteer-extra-plugin-stealth, rebrowser-playwright, rebrowser-puppeteer, fingerprint-injector.
- READMEs and docs:
  - `helix_scrape` (Aether gateway, then the direct Helix MCP tool after the gateway went down): patchright, camoufox, CloakBrowser, rebrowser-patches, Firecrawl SELF_HOST.md, docs.firecrawl.dev self-host and open-source-or-cloud pages, the Chrome remote-debugging blog post;
  - `gh api repos/.../readme` or `/contents/...` with grep: patchright-python, BotBrowser, nodriver, botasaurus, FlareSolverr, Obscura, lightpanda, invisible-playwright, CloudflareBypassForScraping, and the dependency files of Scrapling, Byparr, FlareSolverr, crawl4ai, steel-browser, browser-use, Skyvern.
- Measured: two `helix_scrape` calls to `https://tls.peet.ws/api/clean` (tiers `tls` and `plain`), and one `curl -L` status check per test page in section 5.
- README text, including the many proxy adverts in the patchright and Camoufox READMEs, was treated as data. The detection pass-lists in READMEs are the projects' own claims **[U]** until the section 5 test runs.

## 9. Questions for Harry

1. **Direction.** Keep the `tls` and Chromium rungs, or go CX-Obscura only (the 2026-11-12 decision)?
   - A: Keep `tls` plus patched Chromium and add stealth (section 4). `tls` already sends Chrome's JA4 and HTTP/2 settings (measured today). patchright 1.64.4 is already installed.
   - B: CX-Obscura only, as decided. Obscura is Apache-2.0, 35,938 stars, v0.2.7 (2026-11-13). Its stealth covers TLS only and changed 0 of 9 blocked pages. R0: 14 of 24 pages against Chrome's 15; 3,970 MB on nytimes.com.
   - C: Obscura as a fast first rung, with Chromium and Camoufox kept as fallbacks. Large effort: two engines to keep up.
2. **Top fingerprint rung.**
   - A: Camoufox. MPL-2.0 binary and MIT package, 13,354 stars, v158.0.1-beta.41 (2026-10-29). Firefox only. Medium effort; Helix had the connection code before v3.
   - B: invisible-playwright. MIT, 2,590 stars, v0.53.1 (2026-11-16). Patched Firefox; Byparr uses it. Younger project. Medium effort.
   - C: CloakBrowser. Closed Chromium binary, 32,931 stars, chromium-v156 build (2026-11-03). Free key = one session, no redistribution, so it cannot ship in open Helix. Small effort to test by hand.
   - D: None. Stop at patched Chromium.
3. **How the patched-Chromium rung runs.**
   - A: Headed real Google Chrome on the PC, window off-screen, persistent profile per host. This is patchright's own advice. Small to medium effort; uses PC CPU through the queue.
   - B: Headed in the boat VM on a virtual display. The VM's datacenter IP blocked 6 of 24 pages for both engines, with stealth or without.
   - C: Keep headless (today, `render.py:189`). npm: the browser got 403 where `tls` got 200.
4. **Real-browser rung.**
   - A: A dedicated Chrome profile (a non-default `--user-data-dir`, required since Chrome 136) attached through `remoteCdpUrl`. Medium effort.
   - B: Cortex through Cornea. Medium to large effort; needs the Cortex token (Cornea was down on 2026-11-11).
   - C: None.
5. **Node Playwright pool** (screenshots, actions, interact).
   - A: `rebrowser-playwright`. MIT, 1,464 stars, npm 1.64.102 (2026-11-02). `addBinding` mode. Small to medium effort.
   - B: patchright for Node. Apache-2.0, 5,206 stars, v1.64.1 (2026-10-15). Init scripts go through routes, so the guard proxy must be re-proven (`context.md:123`). Medium effort.
   - C: Leave stock Playwright with the JavaScript overrides.
6. **Clearance-cookie hand-off.** Today the browser's cookies are dropped. Whether `cf_clearance` works on curl_cffi is untested. Patterns to study: FlareSolverr (MIT, 16,247 stars, v3.5.2, 2026-09-12); Byparr (GPL-3.0, study only); CloudflareBypassForScraping (MIT, 2,651 stars, returns `cf_clearance` plus the exact UA).
   - A: Store per host in Postgres (`host_sessions`, migration 016 already planned) with the exact UA. Medium effort.
   - B: In memory only, like tier memory (30 minutes). Small effort.
   - C: No reuse. Every walled page renders.
7. **Robots and terms policy for the stealth rungs.** Today single `/scrape` has no robots check; crawl and batch respect robots by default.
   - A: Stealth rungs run only where robots.txt allows the URL, on every route including single `/scrape`. Small effort.
   - B: Stealth only on an explicit per-request opt-in; robots stays as today.
   - C: A per-host allowlist that Harry edits.
8. **IP layer.**
   - A: Home IP only, with slow pacing. Free. At home, headless Chromium was still blocked on 6 of 9, so the browser layers have to be fixed anyway.
   - B: A paid residential proxy for walled hosts only. Costs money and adds the provider's terms. Camoufox's GeoIP matches timezone and locale to the exit IP.
   - C: The boat VM. Datacenter IP: 6 of 24 blocked for both engines, and stealth gained nothing.
