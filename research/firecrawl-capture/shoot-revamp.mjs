import { chromium } from 'playwright';

const pages = [
  ['/', 'home'],
  ['/status', 'status'],
  ['/app/playground', 'playground'],
  ['/scrape', 'scrape'],
];
const viewports = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
];

async function scrollThrough(page) {
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 400) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

const browser = await chromium.launch();
for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  for (const [path, name] of pages) {
    try {
      await page.goto(`http://localhost:3400${path}`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.waitForTimeout(800);
      await scrollThrough(page);
      await page.screenshot({ path: `D:/Helix/apps/dashboard/.screenshots/revamp-${name}-${vp.name}.png`, fullPage: true });
      console.log(`shot ${name}-${vp.name}`);
    } catch (e) {
      console.log(`FAIL ${name}-${vp.name}: ${String(e.message).slice(0, 120)}`);
    }
  }
  if (vp.name === '1440') {
    await page.goto('http://localhost:3400/', { waitUntil: 'networkidle', timeout: 120000 });
    await scrollThrough(page);
    for (const [label, name] of [['PERFORMANCE', 'performance'], ['SETUP', 'setup'], ['SELF-HOST', 'self-host'], ['HARD PARTS', 'hard-parts'], ['USE CASES', 'use-cases']]) {
      try {
        const sec = page.locator(`section:has-text("${label}")`).first();
        await sec.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1200);
        await sec.screenshot({ path: `D:/Helix/apps/dashboard/.screenshots/revamp-sec-${name}.png` });
        console.log(`shot section ${name}`);
      } catch (e) {
        console.log(`FAIL section ${name}: ${String(e.message).slice(0, 100)}`);
      }
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.hover('button:has-text("Capabilities")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'D:/Helix/apps/dashboard/.screenshots/revamp-nav-capabilities.png' });
    await page.hover('button:has-text("Utilities")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'D:/Helix/apps/dashboard/.screenshots/revamp-nav-utilities.png' });
    await page.mouse.move(10, 400);
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'D:/Helix/apps/dashboard/.screenshots/revamp-hero-1440.png' });
    console.log('shot nav + hero');
  }
  await ctx.close();
}
await browser.close();
console.log('done');
