import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// Self-host settings screen (no Clerk: self-host has no hosted auth).
// Verifies the admin-token gate, then the settings list once a token is saved.
const BASE = process.env.BASE ?? 'http://localhost:3400';
const TOKEN = process.env.HELIX_INTERNAL_ADMIN_TOKEN ?? '';
const API_KEY = process.env.HELIX_BOOTSTRAP_KEY ?? '';
const OUT = path.resolve('../../apps/dashboard/.screenshots');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];

for (const [w, h, tag] of [[1440, 1000, 'desktop'], [390, 844, 'mobile']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });

  // The whole /app shell sits behind the self-host API-key gate, so seed that
  // first; the admin-token gate is the thing under test, one layer in.
  await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((key) => window.localStorage.setItem('helix.apiKey', key), API_KEY);

  // 1. No admin token saved -> the gate asks for one.
  await page.goto(`${BASE}/app/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const gateVisible = await page.getByLabel('Admin token').isVisible().catch(() => false);
  console.log(`${tag}: token gate shown = ${gateVisible}`);
  await page.screenshot({ path: path.join(OUT, `self-host-settings-gate-${tag}.png`), fullPage: true });

  // 2. Save the token -> the settings list loads.
  if (TOKEN && gateVisible) {
    await page.getByLabel('Admin token').fill(TOKEN);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(1500);
  }

  const rows = await page.locator('text=HELIX_').count();
  const groups = await page.locator('text=Applies immediately').count();
  console.log(`${tag}: setting rows = ${rows}, live group = ${groups}`);
  await page.screenshot({ path: path.join(OUT, `self-host-settings-${tag}.png`), fullPage: true });

  await ctx.close();
}

await browser.close();
console.log(errors.length ? `CONSOLE ERRORS:\n${errors.join('\n')}` : 'no console errors');
