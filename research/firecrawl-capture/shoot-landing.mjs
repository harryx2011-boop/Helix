import { chromium } from 'playwright';

const pages = ['/', '/scrape', '/parse', '/search', '/crawl', '/interact', '/monitor'];
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
  for (const path of pages) {
    await page.goto(`http://localhost:3400${path}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);
    await scrollThrough(page);
    const name = path === '/' ? 'home' : path.slice(1);
    await page.screenshot({ path: `E:/Helix/apps/dashboard/.screenshots/${name}-${vp.name}.png`, fullPage: true });
    console.log(`shot ${name}-${vp.name}`);
  }
  await ctx.close();
}
await browser.close();
console.log('done');
