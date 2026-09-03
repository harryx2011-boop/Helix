import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3400';
const OUT = 'E:/Helix/apps/dashboard/.screenshots';
const pages = (process.env.PAGES || 'home,scrape,crawl,parse,search,interact,monitor').split(',').map((p) => (p === 'home' ? '/' : '/' + p));

async function scrollThrough(page) {
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 400) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(70);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

const browser = await chromium.launch();
for (const vp of [{ name: '1440', width: 1440, height: 900 }, { name: '390', width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  for (const path of pages) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(600);
    await scrollThrough(page);
    const name = path === '/' ? 'home' : path.slice(1);
    // meter-bearing section shots at settled state
    if (vp.name === '1440') {
      const target = path === '/' ? 'text=Cheapest tier wins' : '[class*="grid-cols-6"]';
      try {
        const loc = page.locator(target).first();
        await loc.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1600);
        const sec = path === '/' ? loc.locator('xpath=ancestor::div[contains(@class,"grid")][1]') : loc;
        await sec.screenshot({ path: `${OUT}/bento-${name}.png` });
      } catch (e) { console.log('bento shot failed', name, e.message.slice(0, 80)); }
    }
    await page.screenshot({ path: `${OUT}/${name}-${vp.name}.png`, fullPage: true });
    console.log(`shot ${name}-${vp.name}`);
  }
  await ctx.close();
}
await browser.close();
console.log('done');
