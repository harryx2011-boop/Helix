// Compares the text a model receives over MCP with the compact REST body for the same call.
// Usage: node apps/api/scripts/mcp-response-size.mjs [--url http://host:port]   (HELIX_API_KEY is the bearer)
// Without --url it boots a scratch API on HELIX_SCRATCH_PORT; outbound calls use https://example.com.
import { connect, startScratch } from './mcp-schema-size.mjs';

const args = process.argv.slice(2);
const given = args.includes('--url') ? args[args.indexOf('--url') + 1] : undefined;
const scratch = given ? undefined : await startScratch();
const base = given ?? scratch.url.replace(/\/mcp$/, '');
const key = scratch?.key ?? process.env.HELIX_API_KEY;

const rest = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return JSON.stringify(await res.json());
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const client = await connect(`${base}/mcp`, key);
let imageBlocks = 0;
const call = async (name, a) => {
  const res = await client.callTool({ name, arguments: a });
  imageBlocks = res.content.filter((c) => c.type === 'image').length;
  return res.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
};
const row = (label, mcp, restBody) => {
  const images = imageBlocks ? `  (+${imageBlocks} image block, not text)` : '';
  imageBlocks = 0;
  console.log(`${label.padEnd(26)} mcp ${String(mcp.length).padStart(6)}  rest ${String(restBody.length).padStart(6)}${images}`);
};

try {
  const url = 'https://example.com';
  row('helix_scrape', await call('helix_scrape', { url }), await rest('POST', '/v1/scrape', { url }));
  row('helix_scrape [links]', await call('helix_scrape', { url, formats: ['markdown', 'links'] }), await rest('POST', '/v1/scrape', { url, formats: ['markdown', 'links'] }));
  row('helix_screenshot', await call('helix_screenshot', { url }), await rest('POST', '/v1/screenshot', { url }));
  row('helix_search', await call('helix_search', { query: 'example domain', limit: 3 }), await rest('POST', '/v1/search', { query: 'example domain', limit: 3 }));
  row('helix_map', await call('helix_map', { url: 'https://www.sitemaps.org', limit: 20 }), await rest('POST', '/v1/map', { url: 'https://www.sitemaps.org', limit: 20 }));

  const started = JSON.parse(await call('helix_crawl', { url, limit: 2 }));
  const startedRest = JSON.parse(await rest('POST', '/v1/crawl', { url, limit: 2 }));
  row('helix_crawl (start)', JSON.stringify(started), JSON.stringify(startedRest));
  let mcp = '';
  for (let i = 0; i < 40; i++) {
    mcp = await call('helix_get_crawl', { id: started.id });
    if (['completed', 'failed', 'cancelled'].includes(JSON.parse(mcp).status)) break;
    await sleep(1000);
  }
  row('helix_get_crawl', mcp, await rest('GET', `/v1/crawl/${started.id}`));
  row('helix_get_job_ladder', await call('helix_get_job_ladder', { id: started.id }), await rest('GET', `/v1/jobs/${started.id}/ladder`));
} finally {
  await client.close();
  scratch?.stop();
}
process.exit(0);
