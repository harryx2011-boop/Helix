import { chromium } from 'playwright';
import fs from 'fs';

const OUT = 'out/drive';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(45000);
await page.goto('https://www.firecrawl.dev/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
// dismiss cookie/banners if any
for (const sel of ['button:has-text("Accept")', 'button:has-text("Got it")']) { try { await page.locator(sel).first().click({ timeout: 800 }); } catch {} }

// scroll the whole page slowly so lazy sections mount
const total = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y < total; y += 600) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(120); }
await page.evaluate(() => window.scrollTo(0, 0));

// 1. find the reliability section
const perf = page.locator('text=Industry-leading reliability').first();
await perf.scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
const perfSection = perf.locator('xpath=ancestor::section[1]');
try { await perfSection.screenshot({ path: `${OUT}/perf-section.png` }); } catch (e) { console.log('perf section shot failed', e.message); }

// 2. sample progress bars: any element whose inline width is a percentage or which has role=progressbar
const samples = [];
for (let i = 0; i < 12; i++) {
  const s = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[style*="width"]')) {
      const w = el.style.width;
      if (!/%$/.test(w)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 8 || r.height > 80 || r.width < 20) continue;
      const cs = getComputedStyle(el);
      out.push({ w, px: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, radius: cs.borderRadius, transition: cs.transition, text: (el.textContent || '').trim().slice(0, 30), cls: el.className.toString().slice(0, 160) });
    }
    return out;
  });
  samples.push({ t: i * 250, bars: s });
  await page.waitForTimeout(250);
}
fs.writeFileSync(`${OUT}/progress-samples.json`, JSON.stringify(samples, null, 2));

// 3. look for the bar's parent markup (Firecrawl / Puppeteer / cURL rows)
const rowHtml = await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('*')).find((e) => e.children.length === 0 && /^Puppeteer$/.test((e.textContent || '').trim()));
  if (!el) return null;
  let row = el; for (let i = 0; i < 4 && row.parentElement; i++) row = row.parentElement;
  return row.outerHTML.slice(0, 6000);
});
fs.writeFileSync(`${OUT}/bar-row.html`, rowHtml || 'not found');

// 4. bento grid: the section containing "We handle the hard stuff" or similar four-card grid
const gridInfo = await page.evaluate(() => {
  const res = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display !== 'grid') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 700 || el.children.length < 3) continue;
    const kids = Array.from(el.children).map((k) => { const cr = k.getBoundingClientRect(); const kcs = getComputedStyle(k); return { w: Math.round(cr.width), h: Math.round(cr.height), col: kcs.gridColumn, row: kcs.gridRow, border: kcs.borderTopWidth + ' ' + kcs.borderTopColor, bg: kcs.backgroundColor, radius: kcs.borderRadius, text: (k.textContent || '').trim().slice(0, 60) }; });
    res.push({ cols: cs.gridTemplateColumns, rows: cs.gridTemplateRows.slice(0, 120), gap: cs.gap, w: Math.round(r.width), top: Math.round(r.top + scrollY), n: el.children.length, cls: el.className.toString().slice(0, 200), kids });
  }
  return res;
});
fs.writeFileSync(`${OUT}/grids.json`, JSON.stringify(gridInfo, null, 2));

// 5. screenshots of named sections
for (const [name, text] of [['hardstuff', 'hard stuff'], ['bento-token', 'Token-efficient'], ['actions', 'Interact with pages'], ['builtfor', 'Built for Performance']]) {
  try {
    const loc = page.locator(`text=${text}`).first();
    await loc.scrollIntoViewIfNeeded(); await page.waitForTimeout(700);
    const sec = loc.locator('xpath=ancestor::section[1]');
    await sec.screenshot({ path: `${OUT}/${name}.png` });
  } catch (e) { console.log(name, 'failed', e.message.slice(0, 80)); }
}
await page.screenshot({ path: `${OUT}/home-full.png`, fullPage: true });

// 6. capability page feature grid
await page.goto('https://www.firecrawl.dev/scrape', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const t2 = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y < t2; y += 600) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(100); }
await page.screenshot({ path: `${OUT}/scrape-full.png`, fullPage: true });
const headings = await page.evaluate(() => Array.from(document.querySelectorAll('h1,h2,h3')).map((h) => h.tagName + ' ' + (h.textContent || '').trim().slice(0, 90)));
fs.writeFileSync(`${OUT}/scrape-headings.txt`, headings.join('\n'));
await browser.close();
console.log('done');
