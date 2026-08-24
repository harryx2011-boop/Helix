import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// Screenshots of the local Helix site for the design pass (WEBSITE.md §12 DoD).
// usage: node shoot-helix.mjs [baseUrl] [route ...]
const BASE = process.argv[2] && process.argv[2].startsWith('http') ? process.argv[2] : 'http://localhost:3400';
const routes = process.argv.slice(process.argv[2]?.startsWith('http') ? 3 : 2);
const ROUTES = routes.length ? routes : ['/', '/scrape', '/parse', '/search', '/crawl', '/interact', '/monitor', '/self-host', '/architecture', '/docs', '/sign-in', '/sign-up'];
const OUT = path.resolve('../../apps/dashboard/.screenshots');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
for (const route of ROUTES) {
  const slug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/[\/?=&]/g, '-');
  for (const [w, h, tag] of [[1440, 1000, 'desktop'], [390, 844, 'mobile']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    try {
      const res = await page.goto(BASE + route, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(1200);
      const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      await page.screenshot({ path: path.join(OUT, `${slug}-${tag}.png`), fullPage: true });
      console.log(`${res?.status()} ${route} ${tag}${hasHScroll ? '  !! HORIZONTAL SCROLL' : ''}${errors.length ? `  !! ${errors.length} console errors: ${errors[0].slice(0, 120)}` : ''}`);
    } catch (e) {
      console.log(`FAIL ${route} ${tag} ${e.message.slice(0, 120)}`);
    }
    await ctx.close();
  }
}
await browser.close();
