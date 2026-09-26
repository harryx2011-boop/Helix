// Live smoke over every openapi.yaml operation against a running instance.
// Usage: HELIX_API_KEY=helix-... node apps/api/scripts/smoke-live.mjs [baseUrl]
// Without a key it runs the open routes and proves every protected route answers 401.
// It never mutates provider config; the key it creates is revoked before exit.

const BASE = (process.argv[2] ?? process.env.HELIX_URL ?? 'http://127.0.0.1:7400').replace(/\/$/, '');
const KEY = process.env.HELIX_API_KEY;
const PDF = 'https://arxiv.org/pdf/1706.03762';
const DOC_PDF = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
const UUID0 = '00000000-0000-4000-8000-000000000000';

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, body, { auth = true, raw = false } = {}) {
  const headers = {};
  if (auth && KEY) headers.authorization = `Bearer ${KEY}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const t = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
    let json = null;
    if (raw) await res.body?.cancel();
    else {
      const text = await res.text();
      try { json = JSON.parse(text); } catch { json = { _text: text.slice(0, 200) }; }
    }
    return { status: res.status, json, headers: res.headers, ms: Date.now() - t };
  } catch (error) {
    return { status: 0, json: { error: String(error) }, ms: Date.now() - t };
  } finally {
    clearTimeout(timer);
  }
}

async function check(name, method, path, body, expect, verify, opts) {
  const r = await call(method, path, body, opts);
  const okStatus = expect.includes(r.status);
  let note = '';
  let ok = okStatus;
  if (okStatus && verify) {
    try {
      const v = verify(r.json, r);
      if (typeof v === 'string') { ok = false; note = v; } else if (v && typeof v === 'object') note = v.note ?? '';
    } catch (error) { ok = false; note = `verify threw: ${error.message}`; }
  }
  if (!okStatus) note = `expected ${expect.join('|')}: ${JSON.stringify(r.json).slice(0, 180)}`;
  results.push({ name, method, path: path.split('?')[0], status: r.status, ms: r.ms, ok, note });
  return r;
}

const skip = (name, method, path, why) => results.push({ name, method, path, status: '-', ms: 0, ok: null, note: why });

async function poll(path, done, tries = 40) {
  let r;
  for (let i = 0; i < tries; i++) {
    r = await call('GET', path);
    if (done(r.json)) return r;
    await sleep(1500);
  }
  return r;
}

// Open routes and the auth wall.
await check('health', 'GET', '/v1/health', undefined, [200], (j) => (j.status === 'ok' ? { note: Object.entries(j.services).map(([k, v]) => `${k}:${v.status}`).join(' ') } : `status ${j.status}`), { auth: false });
await check('status history', 'GET', '/v1/status/history', undefined, [200], null, { auth: false });
await check('live view, unknown id', 'GET', '/v1/interact/live/sess_nope', undefined, [401, 404, 410], null, { auth: false });

const protectedOps = [
  ['POST', '/v1/scrape'], ['POST', '/v1/screenshot'], ['POST', '/v1/extract'], ['POST', '/v1/parse'], ['POST', '/v1/pdf-assess'],
  ['POST', '/v1/metadata'], ['POST', '/v1/metadata/scrub'], ['POST', '/v1/document'], ['POST', '/v1/map'], ['POST', '/v1/robots-check'],
  ['POST', '/v1/crawl'], ['POST', '/v1/crawl/estimate'], ['GET', `/v1/crawl/${UUID0}`], ['DELETE', `/v1/crawl/${UUID0}`],
  ['POST', '/v1/batch/scrape'], ['GET', `/v1/batch/scrape/${UUID0}`], ['DELETE', `/v1/batch/scrape/${UUID0}`], ['POST', '/v1/search'],
  ['POST', '/v1/agent/schema'], ['POST', '/v1/enrich'], ['POST', '/v1/interact'], ['POST', '/v1/interact/session'],
  ['GET', '/v1/interact/session/x'], ['DELETE', '/v1/interact/session/x'], ['GET', '/v1/monitor'], ['POST', '/v1/monitor'],
  ['GET', `/v1/monitor/${UUID0}`], ['PATCH', `/v1/monitor/${UUID0}`], ['DELETE', `/v1/monitor/${UUID0}`], ['GET', `/v1/monitor/${UUID0}/history`],
  ['GET', `/v1/monitor/${UUID0}/snapshots/1`], ['POST', `/v1/monitor/${UUID0}/check`], ['GET', `/v1/monitor/${UUID0}/deliveries`],
  ['POST', `/v1/monitor/${UUID0}/deliveries/1/replay`], ['POST', '/v1/diff'], ['GET', `/v1/jobs/${UUID0}`], ['DELETE', `/v1/jobs/${UUID0}`],
  ['GET', `/v1/jobs/${UUID0}/errors`], ['GET', `/v1/jobs/${UUID0}/schema`], ['GET', '/v1/usage'], ['GET', '/v1/providers'],
  ['PUT', '/v1/providers/openai'], ['DELETE', '/v1/providers/openai'], ['GET', '/v1/providers/openai/models'], ['POST', '/v1/keys'],
  ['GET', '/v1/keys'], ['DELETE', `/v1/keys/${UUID0}`], ['GET', '/v1/usage/all'], ['GET', '/v1/profiles/chrome-131-win/health'],
];
let wallFailures = 0;
for (const [method, path] of protectedOps) {
  const r = await call(method, path, method === 'GET' || method === 'DELETE' ? undefined : {}, { auth: false });
  if (r.status !== 401) {
    wallFailures++;
    results.push({ name: 'auth wall', method, path, status: r.status, ms: r.ms, ok: false, note: 'answered without a key' });
  }
}
results.push({ name: `auth wall (${protectedOps.length} protected ops)`, method: '*', path: '/v1/*', status: 401, ms: 0, ok: wallFailures === 0, note: wallFailures ? `${wallFailures} leaked` : 'every protected op refused an anonymous call' });
await check('bad key', 'GET', '/v1/usage', undefined, [401], null, { auth: false });

if (!KEY) {
  print();
  console.log('\nHELIX_API_KEY not set: authenticated operations skipped.');
  process.exit(results.some((r) => r.ok === false) ? 1 : 0);
}

const hasMd = (j) => (j.success && j.data?.markdown?.length > 0 ? { note: `tier ${j.data.metadata?.tier}, ${j.data.markdown.length} chars` } : `success=${j.success} md=${j.data?.markdown?.length ?? 'none'} ${JSON.stringify(j.failure ?? '')}`);

// Reads.
await check('scrape', 'POST', '/v1/scrape', { url: 'https://docs.python.org/3/', formats: ['markdown', 'links'] }, [200], hasMd);
await check('scrape auto, example.com', 'POST', '/v1/scrape', { url: 'https://example.com' }, [200], (j) => (j.success ? { note: `tier ${j.data.metadata.tier} via ${j.data.metadata.tiersAttempted.join('>')}` } : 'failed'));
await check('scrape, validation', 'POST', '/v1/scrape', { url: 'not a url' }, [400]);
await check('scrape, SSRF refused', 'POST', '/v1/scrape', { url: 'http://127.0.0.1:7400/v1/health' }, [200, 400], (j) => (j.success === true ? 'loopback was fetched' : { note: j.failure?.reason ?? j.error }));
await check('screenshot', 'POST', '/v1/screenshot', { url: 'https://example.com', format: 'jpeg', quality: 30 }, [200], (j) => (j.success && j.data.bytes > 1000 ? { note: `${j.data.bytes} bytes` } : 'no image'));
await check('map', 'POST', '/v1/map', { url: 'https://docs.python.org/3/', limit: 5 }, [200], (j) => (j.links?.length ? { note: `${j.links.length} links` } : 'no links'));
await check('robots-check', 'POST', '/v1/robots-check', { url: 'https://www.google.com/search?q=x' }, [200], (j) => (j.allowed === false ? null : 'google /search should be disallowed'));
await check('diff', 'POST', '/v1/diff', { before: { text: 'a b c' }, after: { text: 'a x c' } }, [200], (j) => (j.diff?.added === 1 ? null : 'wrong diff'));
await check('diff json', 'POST', '/v1/diff', { mode: 'json', before: { a: 1 }, after: { a: 2 } }, [200]);

// Documents.
await check('parse', 'POST', '/v1/parse', { url: PDF, maxPages: 1 }, [200], hasMd);
await check('pdf-assess', 'POST', '/v1/pdf-assess', { url: PDF }, [200], (j) => (j.success ? { note: `needsOcr ${j.data.needsOcr}` } : 'failed'));
await check('metadata', 'POST', '/v1/metadata', { url: DOC_PDF }, [200], (j) => (j.data?.findings?.length ? { note: `${j.data.findings.length} findings` } : 'no findings'));
await check('metadata/scrub', 'POST', '/v1/metadata/scrub', { url: DOC_PDF }, [200], (_j, r) => (r.headers.get('content-type')?.includes('pdf') ? null : `content-type ${r.headers.get('content-type')}`), { raw: true });
await check('document op=metadata', 'POST', '/v1/document', { op: 'metadata', url: DOC_PDF }, [200]);
await check('document op=parse', 'POST', '/v1/document', { op: 'parse', url: PDF, maxPages: 1 }, [200], hasMd);

// Model-backed: a typed failure is correct when no LLM is configured.
const modelOk = (j) => (j.success ? { note: 'model answered' } : { note: `typed failure: ${j.failure?.reason ?? j.warnings?.[0]?.slice(0, 60)}` });
await check('agent/schema', 'POST', '/v1/agent/schema', { prompt: 'product name and price' }, [200], modelOk);
await check('extract', 'POST', '/v1/extract', { urls: ['https://example.com'], schema: { type: 'object', properties: { title: { type: 'string' } } } }, [200], modelOk);
await check('enrich', 'POST', '/v1/enrich', { subject: 'Python', fields: [{ name: 'creator' }], urls: ['https://docs.python.org/3/faq/general.html'] }, [200], (j) => ({ note: `creator=${JSON.stringify(j.data?.creator?.value)} ${j.data?.creator?.reason ?? ''}` }));
await check('search', 'POST', '/v1/search', { query: 'helix', limit: 1 }, [200, 503], (j) => (j.error === 'search_unavailable' ? { note: 'no backend configured' } : null));

// Crawl lifecycle.
await check('crawl/estimate', 'POST', '/v1/crawl/estimate', { url: 'https://docs.python.org/3/tutorial/', limit: 5 }, [200], (j) => ({ note: `${j.pages} pages projected` }));
const crawl = await check('crawl', 'POST', '/v1/crawl', { url: 'https://docs.python.org/3/tutorial/', limit: 3, maxDepth: 1 }, [200, 202], (j) => (j.id ? null : 'no id'));
if (crawl.json?.id) {
  const id = crawl.json.id;
  const done = await poll(`/v1/crawl/${id}`, (j) => ['completed', 'failed', 'cancelled'].includes(j?.status));
  results.push({ name: 'crawl result', method: 'GET', path: '/v1/crawl/{id}', status: 200, ms: 0, ok: done.json?.status === 'completed' && done.json.data?.length > 0, note: `status ${done.json?.status}, ${done.json?.data?.length ?? 0} pages, completed ${done.json?.completed}/${done.json?.total}` });
  await check('jobs/{id}', 'GET', `/v1/jobs/${id}`, undefined, [200]);
  await check('jobs/{id}/errors', 'GET', `/v1/jobs/${id}/errors`, undefined, [200]);
  await check('jobs/{id}/schema', 'GET', `/v1/jobs/${id}/schema`, undefined, [200, 404, 409]);
  await check('crawl cancel, finished', 'DELETE', `/v1/crawl/${id}`, undefined, [200, 409]);
  await check('jobs delete', 'DELETE', `/v1/jobs/${id}`, undefined, [200, 204, 409]);
}
const running = await check('crawl to cancel', 'POST', '/v1/crawl', { url: 'https://docs.python.org/3/library/', limit: 50 }, [200, 202]);
if (running.json?.id) await check('crawl cancel, running', 'DELETE', `/v1/crawl/${running.json.id}`, undefined, [200, 409]);
await check('jobs, unknown id', 'GET', `/v1/jobs/${UUID0}`, undefined, [404]);

const batch = await check('batch/scrape', 'POST', '/v1/batch/scrape', { urls: ['https://example.com', 'https://docs.python.org/3/'] }, [200, 202], (j) => (j.id ? null : 'no id'));
if (batch.json?.id) {
  const done = await poll(`/v1/batch/scrape/${batch.json.id}`, (j) => ['completed', 'failed', 'cancelled'].includes(j?.status));
  results.push({ name: 'batch result', method: 'GET', path: '/v1/batch/scrape/{id}', status: 200, ms: 0, ok: done.json?.data?.length === 2, note: `status ${done.json?.status}, ${done.json?.data?.length ?? 0}/2 pages, completed ${done.json?.completed} failed ${done.json?.failed}` });
  await check('batch cancel, finished', 'DELETE', `/v1/batch/scrape/${batch.json.id}`, undefined, [200, 409]);
}

// Interact sessions.
await check('interact', 'POST', '/v1/interact', { url: 'https://example.com', actions: [{ type: 'executeJavascript', script: 'document.title' }] }, [200], (j) => (j.javascriptReturns?.[0] === 'Example Domain' ? null : JSON.stringify(j).slice(0, 150)));
const sess = await check('interact/session', 'POST', '/v1/interact/session', { url: 'https://example.com' }, [200, 201], (j) => (j.sessionId ? null : 'no sessionId'));
if (sess.json?.sessionId) {
  const sid = sess.json.sessionId;
  await check('interact/session/{id}', 'GET', `/v1/interact/session/${sid}`, undefined, [200]);
  await check('interact continue', 'POST', '/v1/interact', { sessionId: sid, actions: [{ type: 'executeJavascript', script: 'location.host' }], keepSessionOpen: true }, [200], (j) => (j.javascriptReturns?.[0] === 'example.com' ? null : JSON.stringify(j).slice(0, 150)));
  const liveUrl = sess.json.liveUrl ?? sess.json.liveViewUrl;
  if (liveUrl) await check('interact/live/{id}', 'GET', new URL(liveUrl, BASE).pathname + new URL(liveUrl, BASE).search, undefined, [200], null, { auth: false, raw: true });
  else skip('interact/live/{id}', 'GET', '/v1/interact/live/{id}', 'session response carries no live URL');
  skip('interact/live/{id}/stream', 'GET', '/v1/interact/live/{id}/stream', 'SSE stream; not held open by a smoke');
  await check('interact/session delete', 'DELETE', `/v1/interact/session/${sid}`, undefined, [200, 204]);
}

// Monitor lifecycle.
const mon = await check('monitor create', 'POST', '/v1/monitor', { url: 'https://example.com', schedule: { every: '1d' } }, [200, 201], (j) => (j.id ? null : 'no id'));
await check('monitor list', 'GET', '/v1/monitor', undefined, [200], (j) => (j.monitors?.some((m) => m.id === mon.json?.id) ? null : 'new monitor missing from list'));
if (mon.json?.id) {
  const m = `/v1/monitor/${mon.json.id}`;
  await check('monitor get', 'GET', m, undefined, [200]);
  await check('monitor patch', 'PATCH', m, { sensitivity: 'significant' }, [200], (j) => (j.sensitivity === 'significant' ? null : `sensitivity ${j.sensitivity}`));
  await check('monitor check', 'POST', `${m}/check`, undefined, [200], (j) => (j.check?.reason === 'first' ? null : { note: j.check?.reason }));
  const hist = await check('monitor history', 'GET', `${m}/history`, undefined, [200], (j) => (j.entries?.length ? null : 'empty'));
  // Snapshot ids are numbered across every monitor, so follow this one's link from its history.
  const snapshotUrl = hist.json?.entries?.find((e) => e.snapshotUrl)?.snapshotUrl;
  await check('monitor snapshot', 'GET', snapshotUrl ?? `${m}/snapshots/0`, undefined, [200]);
  await check('monitor deliveries', 'GET', `${m}/deliveries`, undefined, [200]);
  await check('monitor replay, unknown', 'POST', `${m}/deliveries/999999/replay`, undefined, [404]);
  await check('monitor delete', 'DELETE', m, undefined, [200, 204]);
  await check('monitor get, deleted', 'GET', m, undefined, [404]);
}

// Account and instance.
await check('usage', 'GET', '/v1/usage', undefined, [200]);
await check('usage/all', 'GET', '/v1/usage/all', undefined, [200, 403]);
await check('providers', 'GET', '/v1/providers', undefined, [200]);
// A local runtime is browsed only after its base URL is saved; unsaved is a 400 naming `baseUrl`.
await check('providers/{p}/models', 'GET', '/v1/providers/ollama/models', undefined, [200, 400, 503], (j) =>
  j.error === 'invalid_request' && j.field !== 'baseUrl' ? `400 on ${j.field}` : null);
await check('providers put, invalid', 'PUT', '/v1/providers/openai', { apiKey: 'x' }, [400, 403]);
skip('providers delete', 'DELETE', '/v1/providers/{provider}', 'would remove stored provider config');
await check('profiles/{id}/health', 'GET', '/v1/profiles/chrome-131-win/health', undefined, [200, 404]);
await check('keys list', 'GET', '/v1/keys', undefined, [200, 403]);
const key = await check('keys create', 'POST', '/v1/keys', { name: 'smoke-live' }, [200, 201, 403]);
const newId = key.json?.id ?? key.json?.key?.id;
if (newId) await check('keys revoke', 'DELETE', `/v1/keys/${newId}`, undefined, [200, 204]);
else skip('keys revoke', 'DELETE', '/v1/keys/{id}', 'no key was created');

print();
process.exit(results.some((r) => r.ok === false) ? 1 : 0);

function print() {
  const mark = (ok) => (ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL');
  for (const r of results) console.log(`${mark(r.ok).padEnd(4)} ${String(r.status).padEnd(3)} ${String(r.ms).padStart(6)}ms  ${r.method.padEnd(6)} ${r.path.padEnd(38)} ${r.name}${r.note ? ` — ${r.note}` : ''}`);
  const n = (v) => results.filter((r) => r.ok === v).length;
  console.log(`\n${n(true)} pass, ${n(false)} fail, ${n(null)} skip`);
}
