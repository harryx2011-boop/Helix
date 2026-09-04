import { chromium } from 'playwright';
const PAGES = [['scrape','/scrape'],['docs','/docs'],['docs-scrape','/docs/scrape'],['self-host','/self-host'],['architecture','/architecture'],['status','/status'],['sign-in','/sign-in']];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
for (const [name, path] of PAGES) {
  await p.goto('http://localhost:3400' + path, { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForTimeout(3000);
  const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, h: document.documentElement.scrollHeight }));
  console.log(name, JSON.stringify(m), m.sw > m.iw ? 'HSCROLL' : 'ok');
  await p.screenshot({ path: `E:/Helix/apps/dashboard/.screenshots/site-fields-${name}.png` });
}
await b.close();
