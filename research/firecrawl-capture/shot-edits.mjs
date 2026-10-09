import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:3400/', { waitUntil: 'load' }); await p.waitForTimeout(2500);
await p.screenshot({ path: 'D:/Helix/apps/dashboard/.screenshots/edit-home-hero.png' });
await p.goto('http://localhost:3400/scrape', { waitUntil: 'load' }); await p.waitForTimeout(1500);
await p.screenshot({ path: 'D:/Helix/apps/dashboard/.screenshots/edit-scrape-hero.png' });
await b.close();
