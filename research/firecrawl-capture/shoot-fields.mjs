import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await p.goto('http://localhost:3400/', { waitUntil: 'load', timeout: 180000 });
await p.waitForTimeout(3500);
await p.screenshot({ path: 'D:/Helix/apps/dashboard/.screenshots/fields-hero-1440.png' });
const h = await p.evaluate(() => document.body.scrollHeight);
for (let y = 0; y < h; y += 500) { await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(40); }
const secs = await p.evaluate(() => [...document.querySelectorAll('section')].map((s) => Math.round(s.getBoundingClientRect().top + scrollY)));
const names = ['hero', 'capabilities', 'hard-parts', 'performance', 'setup', 'self-host', 'use-cases', 'cta'];
for (let i = 1; i < Math.min(secs.length, 8); i++) {
  await p.evaluate((yy) => window.scrollTo(0, yy), secs[i] - 20); await p.waitForTimeout(3200);
  await p.screenshot({ path: `D:/Helix/apps/dashboard/.screenshots/fields-${names[i]}-1440.png` });
}
const pre = p.locator('pre.whitespace-pre').nth(2);
const a = await pre.textContent(); await p.waitForTimeout(700); const c = await pre.textContent();
console.log('a field changes between frames:', a !== c);
await b.close(); console.log('ok');
