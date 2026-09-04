import { chromium } from 'playwright';
import fs from 'fs';

const OUT = 'out/subdomains';
fs.mkdirSync(OUT, { recursive: true });

const sitemap = await (await fetch('https://www.firecrawl.dev/sitemap.xml')).text();
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const bySegment = new Map();
for (const u of locs) {
  const seg = new URL(u).pathname.split('/').filter(Boolean)[0] ?? '(root)';
  if (!bySegment.has(seg)) bySegment.set(seg, []);
  bySegment.get(seg).push(u);
}
const segments = [...bySegment.entries()].map(([seg, urls]) => ({ seg, count: urls.length, first: urls[0] }));
fs.writeFileSync(`${OUT}/sitemap-segments.json`, JSON.stringify(segments, null, 2));

const targets = [
  ['www-home', 'https://www.firecrawl.dev/'],
  ['www-playground', 'https://www.firecrawl.dev/playground'],
  ['www-changelog', 'https://www.firecrawl.dev/changelog'],
  ['www-templates', 'https://www.firecrawl.dev/templates'],
  ['www-use-cases', 'https://www.firecrawl.dev/use-cases'],
  ['www-search', 'https://www.firecrawl.dev/search'],
  ['www-crawl', 'https://www.firecrawl.dev/crawl'],
  ['www-monitor', 'https://www.firecrawl.dev/monitor'],
  ['www-agent', 'https://www.firecrawl.dev/agent'],
  ['www-mcp', 'https://www.firecrawl.dev/mcp'],
  ['www-cli', 'https://www.firecrawl.dev/cli'],
  ['www-sdks', 'https://www.firecrawl.dev/sdks'],
  ['www-signin', 'https://www.firecrawl.dev/signin'],
  ['status', 'https://status.firecrawl.dev/'],
  ['community', 'https://community.firecrawl.dev/'],
  ['docs-intro', 'https://docs.firecrawl.dev/introduction'],
  ['docs-api', 'https://docs.firecrawl.dev/api-reference/introduction'],
  ['docs-mcp', 'https://docs.firecrawl.dev/mcp-server'],
  ['api-root', 'https://api.firecrawl.dev/'],
];
for (const s of segments) {
  if (s.count >= 3 && !targets.some(([, u]) => u.startsWith(`https://www.firecrawl.dev/${s.seg}`))) {
    targets.push([`www-${s.seg}`, s.first]);
  }
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
const index = [];

for (const [name, url] of targets) {
  const rec = { name, url };
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded' });
    rec.status = res?.status() ?? 0;
    rec.finalUrl = page.url();
    await page.waitForTimeout(1500);
    for (const sel of ['button:has-text("Accept")', 'button:has-text("Got it")']) {
      try { await page.locator(sel).first().click({ timeout: 500 }); } catch {}
    }
    const total = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < total; y += 700) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(90);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    rec.structure = await page.evaluate(() => {
      const text = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim();
      const headings = [...document.querySelectorAll('h1,h2,h3')].map((h) => `${h.tagName.toLowerCase()} ${text(h).slice(0, 90)}`).slice(0, 80);
      const nav = [...document.querySelectorAll('header a, nav a')].map((a) => text(a).slice(0, 40)).filter(Boolean).slice(0, 40);
      const sections = document.querySelectorAll('section').length;
      const grids = [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).display === 'grid' && e.getBoundingClientRect().width > 600 && e.children.length >= 3)
        .map((e) => ({ cols: getComputedStyle(e).gridTemplateColumns.split(' ').length, n: e.children.length, text: text(e).slice(0, 60) })).slice(0, 30);
      const footer = [...document.querySelectorAll('footer a')].map((a) => text(a).slice(0, 40)).filter(Boolean).slice(0, 60);
      return { title: document.title, headings, nav, sections, grids, footer, height: document.body.scrollHeight };
    });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    rec.shot = `${name}.png`;
  } catch (e) {
    rec.error = String(e.message).slice(0, 160);
  }
  index.push(rec);
  console.log(name, rec.status ?? '-', rec.error ?? 'ok');
}

fs.writeFileSync(`${OUT}/index.json`, JSON.stringify(index, null, 2));
await browser.close();
