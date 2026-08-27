import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// Unauthenticated captures of the auth surface (sign-in / sign-up) at desktop,
// wide and mobile, plus a reduced-motion pass so the static frame is reviewed too.
const BASE = process.env.BASE ?? 'http://localhost:3400';
const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : ['/sign-in', '/sign-up'];
const OUT = path.resolve('../../apps/dashboard/.screenshots');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];

const passes = [
  [1440, 1000, 'desktop', 'no-preference'],
  [1680, 1050, 'wide', 'no-preference'],
  [390, 844, 'mobile', 'no-preference'],
  [1440, 1000, 'reduced', 'reduce'],
];

for (const [w, h, tag, motion] of passes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: motion });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    // Clerk mounts after hydration; the ambient tickers need a beat to advance past frame 0.
    await page.waitForTimeout(4500);
    const name = route.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'root';
    await page.screenshot({ path: path.join(OUT, `auth-${name}-${tag}.png`), fullPage: false });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(`${tag} ${route}: ${overflow ? 'HORIZONTAL OVERFLOW' : 'ok'}`);
  }
  await ctx.close();
}

await browser.close();
console.log(errors.length ? `CONSOLE ERRORS:\n${errors.join('\n')}` : 'no console errors');
