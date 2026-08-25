import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1500 } });
await p.goto('http://localhost:3400/', { waitUntil: 'load' });
await p.evaluate(() => window.scrollTo(0, 560));
const texts = [];
for (let i = 0; i < 5; i++) {
  await p.waitForTimeout(i === 0 ? 300 : 700);
  await p.screenshot({ path: `E:/Helix/apps/dashboard/.screenshots/anim-hero-${i}.png`, clip: { x: 340, y: 40, width: 760, height: 1100 } });
  texts.push(await p.evaluate(() => Array.from(document.querySelectorAll('pre')).slice(0, 2).map((e) => e.textContent.replace(/\s+/g, ' ').slice(0, 110))));
}
texts.forEach((t, i) => console.log(`t${i}:`, JSON.stringify(t)));
await b.close();
