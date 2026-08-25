import { chromium } from 'playwright';
import { clerk, clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright';
import fs from 'fs';
const envText = fs.readFileSync('../../apps/dashboard/.env.local', 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
process.env.CLERK_PUBLISHABLE_KEY = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY; process.env.CLERK_SECRET_KEY = env.CLERK_SECRET_KEY;
await clerkSetup();
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = []; page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
await setupClerkTestingToken({ page });
await page.goto('http://localhost:3400/sign-in', { waitUntil: 'load' }); await clerk.loaded({ page });
await clerk.signIn({ page, signInParams: { strategy: 'email_code', identifier: 'e2e+clerk_test@helix.dev' } });
await page.goto('http://localhost:3400/app/playground?tab=scrape', { waitUntil: 'load' }); await page.waitForTimeout(1500);
const url = page.locator('input[placeholder*="example.com"], input[name="url"], input[type="url"]').first();
await url.fill('https://example.com');
const run = page.getByRole('button', { name: /^run$/i }).first();
const [resp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes('/api/app/playground/'), { timeout: 120000 }).catch(() => null),
  run.click(),
]);
console.log('proxy response:', resp ? resp.status() : 'none');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'E:/Helix/apps/dashboard/.screenshots/launch-playground-scrape.png', fullPage: true });
const text = await page.locator('main').innerText();
console.log('result pane excerpt:', text.replace(/\s+/g, ' ').slice(0, 600));
console.log('console errors:', errors.filter((e) => !e.includes('script-src')).length);
await b.close();
