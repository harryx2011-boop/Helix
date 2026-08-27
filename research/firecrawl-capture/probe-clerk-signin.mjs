import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// Browser-level diagnosis of the deployed Clerk sign-in. curl is misleading here:
// without Accept: text/html, Clerk treats the request as non-page and rewrites
// /app to 404, which is not what a person in a browser sees.
const BASE = process.env.BASE ?? 'https://helixapi-dev.vercel.app';
const EMAIL = process.env.E2E_EMAIL ?? 'e2e+clerk_test@helix.dev';
const CODE = process.env.E2E_CODE ?? '424242';
const OUT = path.resolve('../../apps/dashboard/.screenshots');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const responses = [];
page.on('response', (r) => { if (r.status() >= 400) responses.push(`${r.status()} ${r.url().slice(0, 120)}`); });

console.log('1. visit /app signed out');
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
console.log('   landed:', page.url());
await page.screenshot({ path: path.join(OUT, 'probe-1-app.png') });

console.log('2. visit /sign-in');
await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const hasForm = await page.locator('input[name="identifier"], input[type="email"]').count();
const hasSocial = await page.locator('button:has-text("GitHub"), button:has-text("Google")').count();
const bodyText = (await page.locator('body').innerText()).slice(0, 400).replace(/\s+/g, ' ');
console.log('   identifier inputs:', hasForm, '| social buttons:', hasSocial);
console.log('   text:', bodyText);
await page.screenshot({ path: path.join(OUT, 'probe-2-signin.png'), fullPage: true });

if (hasForm) {
  console.log('3. email_code sign-in with the test user');
  await page.locator('input[name="identifier"], input[type="email"]').first().fill(EMAIL);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);
  const otp = await page.locator('input[name="code"], input[autocomplete="one-time-code"], input[data-otp-input]').count();
  console.log('   otp inputs after submit:', otp, '| url:', page.url());
  await page.screenshot({ path: path.join(OUT, 'probe-3-after-email.png'), fullPage: true });
  if (otp) {
    await page.keyboard.type(CODE, { delay: 40 });
    await page.waitForTimeout(6000);
    console.log('   after code, landed:', page.url());
    await page.screenshot({ path: path.join(OUT, 'probe-4-after-code.png'), fullPage: true });
    const cookies = await ctx.cookies();
    console.log('   session cookie present:', cookies.some((c) => c.name.startsWith('__session') || c.name.startsWith('__client')));
  }
}

await browser.close();
console.log('--- 4xx/5xx responses ---');
for (const r of responses.slice(0, 12)) console.log('  ', r);
console.log(errors.length ? `--- console errors ---\n${errors.slice(0, 8).join('\n')}` : 'no console errors');
