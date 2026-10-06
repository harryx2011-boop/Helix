// Scrape throughput baseline over a fixed URL set (SUITE-PLAN Phase 1).
// Usage: HELIX_API_KEY=helix-... node apps/api/scripts/bench-scrape.mjs <label> [runs=4] [baseUrl]
// Runs the set serially `runs` times and writes per-URL medians to
// research/research_notes/Helix anti bot scraping 2026/bench-<label>.json.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LABEL = process.argv[2] ?? 'run';
const RUNS = Number(process.argv[3] ?? 4);
const BASE = (process.argv[4] ?? process.env.HELIX_URL ?? 'http://127.0.0.1:7400').replace(/\/$/, '');
const KEY = process.env.HELIX_API_KEY;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../../research/research_notes/Helix anti bot scraping 2026', `bench-${LABEL}.json`);

const URLS = [
  ['static', 'https://example.com/'],
  ['static', 'https://example.org/'],
  ['static', 'https://www.iana.org/help/example-domains'],
  ['static', 'https://httpbin.org/html'],
  ['static', 'https://en.wikipedia.org/wiki/Web_scraping'],
  ['static', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Accept-Encoding'],
  ['static', 'https://www.rfc-editor.org/rfc/rfc9110.html'],
  ['static', 'https://news.ycombinator.com/'],
  ['static', 'https://docs.python.org/3/library/asyncio.html'],
  ['static', 'https://blog.cloudflare.com/'],
  ['github', 'https://github.com/microsoft/playwright'],
  ['github', 'https://github.com/fastify/fastify'],
  ['github', 'https://github.com/rust-lang/rust'],
  ['github', 'https://raw.githubusercontent.com/microsoft/playwright/main/README.md'],
  ['spa', 'https://react.dev/'],
  ['spa', 'https://vercel.com/'],
  ['spa', 'https://linear.app/'],
  ['spa', 'https://www.notion.com/'],
  ['spa', 'https://www.airbnb.com/'],
  ['walled', 'https://discord.com/'],
  ['walled', 'https://medium.com/'],
  ['walled', 'https://www.cloudflare.com/'],
  ['walled', 'https://www.npmjs.com/'],
  ['walled', 'https://www.npmjs.com/package/playwright'],
  ['walled', 'https://www.g2.com/'],
  ['walled', 'https://www.g2.com/products/notion/reviews'],
  ['walled', 'https://www.zillow.com/'],
  ['walled', 'https://www.indeed.com/'],
  ['walled', 'https://www.reddit.com/r/programming/'],
  ['fail', 'https://www.npmjs.com/does-not-exist-404'],
  ['fail', 'https://httpbin.org/status/404'],
  ['fail', 'https://nonexistent-host-helix-bench.example/'],
];

async function scrape(url) {
  const t = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const res = await fetch(`${BASE}/v1/scrape`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
      body: JSON.stringify({ url, formats: ['markdown'] }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    const ms = Date.now() - t;
    let json;
    try { json = JSON.parse(text); } catch { json = {}; }
    const meta = json.data?.metadata ?? json.failure ?? {};
    return {
      ok: json.success === true,
      status: res.status,
      ms,
      tier: meta.tier ?? null,
      tiers: meta.tiersAttempted ?? [],
      bytes: Buffer.byteLength(text),
      mdBytes: json.data?.markdown ? Buffer.byteLength(json.data.markdown) : 0,
      reason: json.failure?.reason ?? (json.success ? undefined : json.error?.code ?? `http ${res.status}`),
    };
  } catch (error) {
    return { ok: false, status: 0, ms: Date.now() - t, tier: null, tiers: [], bytes: 0, mdBytes: 0, reason: String(error) };
  } finally {
    clearTimeout(timer);
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
const mode = (xs) => {
  const c = new Map();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

{
  const runs = [];
  for (let r = 0; r < RUNS; r++) {
    const run = [];
    for (const [kind, url] of URLS) {
      const res = await scrape(url);
      run.push({ kind, url, ...res });
      console.error(`run ${r + 1}/${RUNS} ${res.ok ? 'ok ' : 'ERR'} ${String(res.ms).padStart(6)} ms ${String(res.tier).padEnd(10)} ${url}${res.ok ? '' : ` (${res.reason})`}`);
    }
    runs.push(run);
  }

  const perUrl = URLS.map(([kind, url], i) => {
    const xs = runs.map((run) => run[i]);
    return {
      kind,
      url,
      successes: xs.filter((x) => x.ok).length,
      medianMs: median(xs.map((x) => x.ms)),
      tier: mode(xs.map((x) => x.tier)),
      tiers: mode(xs.map((x) => x.tiers.join('>'))),
      medianBytes: median(xs.map((x) => x.bytes)),
      medianMdBytes: median(xs.map((x) => x.mdBytes)),
      reason: mode(xs.filter((x) => !x.ok).map((x) => x.reason)),
    };
  });

  // The failure URLs are expected to fail; success rate is over the rest.
  const scored = perUrl.filter((u) => u.kind !== 'fail');
  const all = runs.flat();
  const summary = {
    label: LABEL,
    at: new Date().toISOString(),
    runs: RUNS,
    urls: URLS.length,
    successRate: scored.reduce((a, u) => a + u.successes, 0) / (scored.length * RUNS),
    // A success with no content (an empty challenge page) is not one.
    usefulRate:
      all.filter((x) => x.kind !== 'fail' && x.ok && x.mdBytes >= 100).length / (scored.length * RUNS),
    p50Ms: median(perUrl.map((u) => u.medianMs)),
    p95Ms: pct(perUrl.map((u) => u.medianMs), 95),
    totalMedianMs: perUrl.reduce((a, u) => a + u.medianMs, 0),
    failSetMedianMs: perUrl.filter((u) => u.kind === 'fail').reduce((a, u) => a + u.medianMs, 0),
    tierCounts: Object.fromEntries(
      [...new Set(perUrl.map((u) => u.tier))].map((t) => [t, perUrl.filter((u) => u.tier === t).length]),
    ),
    totalMedianBytes: perUrl.reduce((a, u) => a + u.medianBytes, 0),
    rawCalls: all.length,
  };

  writeFileSync(OUT, JSON.stringify({ summary, perUrl, runs }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log('\n| kind | url | ok/runs | median ms | tier | tiers | md bytes |\n|---|---|---|---|---|---|---|');
  for (const u of perUrl) {
    console.log(`| ${u.kind} | ${u.url} | ${u.successes}/${RUNS} | ${u.medianMs} | ${u.tier} | ${u.tiers} | ${u.medianMdBytes} |`);
  }
  console.log(`\nwrote ${OUT}`);
}
