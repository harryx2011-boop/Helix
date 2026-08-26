import { chromium } from 'playwright';
import { clerk, clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright';
import fs from 'fs';
import path from 'path';

// Authenticated screenshots of /app (WEBSITE.md §12 DoD). Reads Clerk keys from apps/dashboard/.env.local.
const envText = fs.readFileSync(path.resolve('../../apps/dashboard/.env.local'), 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
process.env.CLERK_PUBLISHABLE_KEY = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
process.env.CLERK_SECRET_KEY = env.CLERK_SECRET_KEY;

const BASE = 'http://localhost:3412';
const IDENTIFIER = process.env.E2E_EMAIL ?? 'e2e+clerk_test@helix.dev';
const PASSWORD = process.env.E2E_PASSWORD ?? 'HelixE2E-2026-Pass!';
const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : ['/app', '/app/playground?tab=scrape', '/app/playground?tab=crawl', '/app/keys', '/app/settings', '/app/usage', '/app/activity', '/app/self-host', '/app/self-host/instances', '/onboarding'];
const OUT = path.resolve('../../apps/dashboard/.screenshots');
fs.mkdirSync(OUT, { recursive: true });

await clerkSetup();
const browser = await chromium.launch();
for (const [w, h, tag] of [[1440, 1000, 'desktop'], [390, 844, 'mobile']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await setupClerkTestingToken({ page });
  await page.goto(BASE + '/sign-in', { waitUntil: 'load' });
  await clerk.loaded({ page });
  await clerk.signIn({ page, signInParams: { strategy: 'email_code', identifier: IDENTIFIER } });
  for (const route of ROUTES) {
    const slug = 'app-' + route.replace(/^\/(app\/?)?/, '').replace(/[\/?=&]/g, '-').replace(/^-+|-+$/g, '') || 'app-overview';
    errors.length = 0;
    try {
      const res = await page.goto(BASE + route, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(1500);
      const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      await page.screenshot({ path: path.join(OUT, `${slug}-${tag}.png`), fullPage: true });
      console.log(`${res?.status()} ${route} ${tag} -> ${page.url().replace(BASE, '')}${hasHScroll ? '  !! HORIZONTAL SCROLL' : ''}${errors.length ? `  !! ${errors.length} console errors: ${errors[0].slice(0, 140)}` : ''}`);
    } catch (e) {
      console.log(`FAIL ${route} ${tag} ${e.message.slice(0, 140)}`);
    }
  }
  await ctx.close();
}
await browser.close();
