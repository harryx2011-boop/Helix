import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await p.goto('http://localhost:3400/', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
await p.screenshot({ path: 'E:/Helix/apps/dashboard/.screenshots/home-hero.png' });
await p.evaluate(() => window.scrollTo(0, 2600)); await p.waitForTimeout(1500);
await p.screenshot({ path: 'E:/Helix/apps/dashboard/.screenshots/home-mid.png' });
await b.close();
