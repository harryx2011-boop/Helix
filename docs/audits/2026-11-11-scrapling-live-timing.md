# Scrapling live timing: helix-scrape vs the Rust fetch service

Date: 2026-11-11. Measured on Harry's PC (shared, CPU capped at 75%, other sessions running Chrome). One machine, one network, one sitting: treat every number as indicative, not a benchmark.

Raw data: `D:\scratch\helix-revamp\scrapling-bench\raw.json` (every call). Script: `D:\scratch\helix-revamp\scrapling-bench\bench.mjs` (`node bench.mjs run`, then `node bench.mjs report`). Logs: `run.log`, `server.log`. The first, discarded attempt is kept as `raw-attempt1-hung-render.json`.

## Setup

- helix-scrape: `python -m helix_scrape` from `D:\Helix\apps\scrape` (main-branch code), venv `D:\Helix\apps\scrape\.venv` (CPython 3.13.13, not 3.12), on 127.0.0.1:7403, `HELIX_SERVICE_TOKEN` unset, version 0.1.0.
- Rust service: `D:\Helix\apps\fetch\target\release\helix-fetch.exe` v1.7.0 on 127.0.0.1:7401, left running and untouched.
- Chromium: `C:\Users\harry\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe` (the service's own default pick; `chromium_path()` confirmed it). `HELIX_SCRAPE_MAX_RENDERS` left at its default, 2, but the bench was strictly serial.
- Client: Node 24 global `fetch`, one request at a time, 4 runs per URL per path (run 1 = cold, runs 2 to 4 = warm), one retry only on a network error (none happened). Fetch timeout 20 s, render timeout 30 s, solver run 60 s.
- Paths: py-fetch-plain (`impersonate:false`), py-fetch-tls (`impersonate:true`), rust-fetch-tls (same body, port 7401), py-render (default), py-render-stealth (`stealth:true`).

## Definitions

- Success = service reply `success:true` AND upstream status 2xx. A 403 from the site counts as a failure even though the service replied HTTP 200 with `success:true`. Every `!403` below is a challenge or block page, not a service error. No call hit a network error or a service timeout in the matrix.
- Cold = median of run 1 over successful calls; warm = pooled runs 2 to 4 over successful calls. p50 and p95 use linear interpolation. Warm n is small (3 to 30 samples per row), so p95 is close to the max for most rows. Failed calls are excluded from the latency columns.
- "Cold" is a loose word here: a URL's run 1 only cold-starts that host's DNS and TLS; the service process itself was already warm after the first few calls (see the first-call note).

## Findings

1. HTTP tier: the Rust service is about 2.6x faster warm (p50 55 ms vs 144 ms for py-fetch-tls over all URLs). Success is identical (40/48 each; the 8 misses are the same two sites, g2.com and the nopecha demo, which return 403 to both). The Python service adds about 5 ms of its own wrapper time (wall minus `timing_ms`, median) in both services, so the gap is inside the fetch itself, not in the HTTP surface.
2. Connection reuse (20 back-to-back tls calls to example.com): Rust 63 ms for the first, then 16 to 24 ms (p50 19): connections are reused. helix-scrape 84 ms first, then 62 to 88 ms (p50 75): no visible reuse; every call looks like it pays a fresh TLS handshake, about 55 ms more than Rust. This is the main place the milliseconds go on the HTTP path. Not verified in code (another agent is reading it); this is inferred from the timing shape only.
3. Plain tier is not a cheaper path in helix-scrape: warm p50 154 ms, about the same as tls (144 ms), and it fails 403 on Wikipedia, npm, g2, reddit and nopecha where tls succeeds on Wikipedia, npm and reddit. The Rust service was not asked for a plain tier here, so there is no plain comparison.
4. Browser tier: a render costs about 1.5 s of pure browser start on a quiet moment (5 back-to-back example.com renders: 1466, 2075, 1761, 1534, 1538 ms, median 1538 ms, matching the earlier 1.6 s on record). In the matrix, the same renders ran 2 to 10 s because the machine was busier. The cost is per call: one new browser each render, nothing is kept warm. Wall minus `timing_ms` is 10 to 13 ms, so the browser itself is the cost.
5. Stealth adds roughly 1.5 s (warm p50 4938 vs 3191 ms) in the pooled data and has the worst tail (a 27.5 s docs.python.org call and a 12.5 s Wikipedia call); with this sample the difference may partly be load noise.
6. Walled sites: no path got through g2.com or the nopecha Cloudflare demo. The Cloudflare solver (`solve_cloudflare:true`, 60 s) did not solve nopecha: it ran the full 60.7 s and returned `timeout after 60000ms (the Cloudflare challenge was not solved in time)`. Default and stealth renders on npm returned 403 challenge pages (about 45 KB) while the HTTP tls tier returned the real 497 KB page for 112 to 304 ms. For reddit, tls HTTP got the page (167 KB); plain failed 403.
7. The first call ever to a fresh helix-scrape process (a plain fetch of example.com) took 5883 ms (attempt 1) and 497 ms in this run (the process had already served one render). Service warm-up is worth watching; I did not isolate it.
8. Attempt 1 failure (environment, not a service finding as far as I can tell): my first launch of the service was from a shell that exited right after. Its `/fetch` calls worked, but both `/render` calls hung to the 30 s deadline and left both render slots held (a third call returned `timeout after 20000ms (waiting for a free browser)`). Run in-process, the same render worked, and after a clean relaunch with output redirected to a file, renders succeeded. Likely cause: the browser child process inherited broken stdio handles. One real property it shows: a hung render keeps its slot occupied past the caller's deadline, so two hung browsers lock `/render` until restart.

## Results

### All 12 URLs

| path | calls | success | cold p50 ms | warm p50 ms | warm p95 ms | warm n |
|---|---|---|---|---|---|---|
| py-fetch-plain | 48 | 28/48 (58%) | 232 | 154 | 329 | 21 |
| py-fetch-tls | 48 | 40/48 (83%) | 256 | 144 | 336 | 30 |
| rust-fetch-tls | 48 | 40/48 (83%) | 187 | 55 | 99 | 30 |
| py-render | 48 | 36/48 (75%) | 3385 | 3191 | 9054 | 27 |
| py-render-stealth | 48 | 36/48 (75%) | 4957 | 4938 | 11840 | 27 |

### static URLs

| path | calls | success | cold p50 ms | warm p50 ms | warm p95 ms | warm n |
|---|---|---|---|---|---|---|
| py-fetch-plain | 24 | 20/24 (83%) | 371 | 133 | 339 | 15 |
| py-fetch-tls | 24 | 24/24 (100%) | 263 | 170 | 352 | 18 |
| rust-fetch-tls | 24 | 24/24 (100%) | 236 | 50 | 104 | 18 |
| py-render | 24 | 24/24 (100%) | 4945 | 4536 | 9197 | 18 |
| py-render-stealth | 24 | 24/24 (100%) | 5048 | 5721 | 14716 | 18 |

### script URLs

| path | calls | success | cold p50 ms | warm p50 ms | warm p95 ms | warm n |
|---|---|---|---|---|---|---|
| py-fetch-plain | 12 | 8/12 (67%) | 228 | 171 | 197 | 6 |
| py-fetch-tls | 12 | 12/12 (100%) | 174 | 155 | 184 | 9 |
| rust-fetch-tls | 12 | 12/12 (100%) | 175 | 57 | 88 | 9 |
| py-render | 12 | 8/12 (67%) | 2183 | 2373 | 3063 | 6 |
| py-render-stealth | 12 | 8/12 (67%) | 2209 | 2202 | 2540 | 6 |

### walled URLs

| path | calls | success | cold p50 ms | warm p50 ms | warm p95 ms | warm n |
|---|---|---|---|---|---|---|
| py-fetch-plain | 12 | 0/12 (0%) | - | - | - | 0 |
| py-fetch-tls | 12 | 4/12 (33%) | 309 | 90 | 95 | 3 |
| rust-fetch-tls | 12 | 4/12 (33%) | 105 | 19 | 36 | 3 |
| py-render | 12 | 4/12 (33%) | 3385 | 2829 | 2914 | 3 |
| py-render-stealth | 12 | 4/12 (33%) | 5087 | 4963 | 7366 | 3 |

### Per URL (wall ms: run1 / run2 / run3 / run4; success in brackets: ok = service success and 2xx)

| url | py-fetch-plain | py-fetch-tls | rust-fetch-tls | py-render | py-render-stealth |
|---|---|---|---|---|---|
| https://example.com/ | 497 / 105 / 83 / 90 | 81 / 98 / 81 / 83 | 84 / 23 / 33 / 46 | 9704 / 9182 / 3819 / 4415 | 5138 / 10404 / 7568 / 4938 |
| https://httpbin.org/html | 198 / 133 / 135 / 125 | 208 / 141 / 136 / 128 | 374 / 39 / 34 / 35 | 2648 / 3925 / 4657 / 2657 | 5808 / 4956 / 2515 / 4378 |
| https://en.wikipedia.org/wiki/Web_scraping | 156!403 / 142!403 / 144!403 / 141!403 | 317 / 204 / 205 / 199 | 215 / 72 / 69 / 66 | 3240 / 3538 / 2369 / 3191 | 3443 / 6433 / 8899 / 12456 |
| https://docs.python.org/3/library/asyncio.html | 196 / 75 / 92 / 80 | 123 / 71 / 72 / 85 | 99 / 23 / 12 / 14 | 6219 / 9284 / 8754 / 6225 | 4957 / 9275 / 27525 / 3297 |
| https://news.ycombinator.com/ | 371 / 324 / 329 / 363 | 345 / 317 / 355 / 351 | 488 / 124 / 97 / 101 | 3670 / 5561 / 2628 / 2698 | 2292 / 2322 / 2536 / 2207 |
| https://github.com/D4Vinci/Scrapling | 719 / 237 / 238 / 209 | 728 / 237 / 242 / 240 | 256 / 60 / 54 / 68 | 6295 / 6007 / 6038 / 5919 | 5949 / 6525 / 5551 / 5890 |
| https://quotes.toscrape.com/js/ | 232 / 174 / 185 / 168 | 174 / 187 / 179 / 176 | 199 / 54 / 57 / 55 | 2069 / 2198 / 2683 / 2055 | 1976 / 2096 / 2115 / 1970 |
| https://react.dev/ | 224 / 132 / 154 / 201 | 174 / 147 / 155 / 161 | 175 / 56 / 62 / 46 | 2296 / 2383 / 2363 / 3190 | 2441 / 2570 / 2448 / 2289 |
| https://www.npmjs.com/package/react | 108!403 / 86!403 / 78!403 / 76!403 | 304 / 112 / 133 / 134 | 113 / 88 / 66 / 87 | 3302!403 / 3229!403 / 3066!403 / 6807!403 | 3465!403 / 3886!403 / 3929!403 / 5960!403 |
| https://www.g2.com/ | 834!403 / 103!403 / 120!403 / 105!403 | 112!403 / 169!403 / 141!403 / 143!403 | 158!403 / 81!403 / 75!403 / 107!403 | 3698!403 / 3622!403 / 2881!403 / 2498!403 | 2244!403 / 3764!403 / 3182!403 / 2637!403 |
| https://www.reddit.com/r/webscraping/ | 73!403 / 53!403 / 75!403 / 58!403 | 309 / 79 / 96 / 90 | 105 / 38 / 17 / 19 | 3385 / 2923 / 2829 / 2591 | 5087 / 7633 / 4963 / 4891 |
| https://nopecha.com/demo/cloudflare | 98!403 / 62!403 / 71!403 / 65!403 | 73!403 / 70!403 / 69!403 / 79!403 | 70!403 / 19!403 / 21!403 / 34!403 | 2942!403 / 3397!403 / 2810!403 / 2924!403 | 3056!403 / 3506!403 / 3607!403 / 3047!403 |

`!NNN` marks a call that was not a success (value is upstream status, else HTTP status or err).

### Service-reported timing_ms vs wall (median over successful calls)

| path | median wall ms | median timing_ms | median overhead ms |
|---|---|---|---|
| py-fetch-plain | 191 | 177 | 5 |
| py-fetch-tls | 168 | 161 | 5 |
| rust-fetch-tls | 64 | 56 | 5 |
| py-render | 3313 | 3276 | 10 |
| py-render-stealth | 4947 | 4931 | 13 |

### Cloudflare solver (single run, nopecha demo, timeout 60 s)

wall 60707 ms, http 200, upstream null, success false, bytes 0, timing_ms 60700, error timeout after 60000ms (the Cloudflare challenge was not solved in time)

### Fixed cost: 20 back-to-back /fetch tls to https://example.com/

| service | first | rest p50 | rest min | rest max | all 20 wall ms |
|---|---|---|---|---|---|
| py-fetch-tls-x20 (20/20 ok) | 84 | 75 | 62 | 88 | 84, 81, 77, 69, 71, 72, 76, 64, 74, 83, 76, 82, 73, 75, 88, 77, 62, 71, 87, 65 |
| rust-fetch-tls-x20 (20/20 ok) | 63 | 19 | 16 | 24 | 63, 18, 19, 19, 16, 19, 19, 16, 19, 18, 19, 20, 18, 24, 20, 17, 17, 20, 18, 19 |

Service timing_ms for the same calls:

- py-fetch-tls-x20: 80, 78, 74, 66, 68, 69, 73, 61, 72, 80, 73, 79, 70, 71, 84, 74, 60, 68, 84, 63
- rust-fetch-tls-x20: 61, 15, 17, 18, 15, 17, 17, 15, 18, 16, 18, 18, 16, 22, 19, 15, 15, 18, 16, 18

### Fixed cost: 5 back-to-back /render to https://example.com/

wall ms: 1466, 2075, 1761, 1534, 1538 (5/5 ok); median 1538 ms; timing_ms: 1461, 2070, 1757, 1528, 1534
