import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto('http://localhost:3400/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
const bad = await p.evaluate(() => {
  const vw = document.documentElement.clientWidth; const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && r.width > 40) {
      const cls = (el.className && typeof el.className === 'string') ? el.className.slice(0, 90) : '';
      out.push(`${el.tagName.toLowerCase()} right=${Math.round(r.right)} w=${Math.round(r.width)} ${cls}`);
    }
  }
  return out.slice(0, 25);
});
console.log('viewport 390, offenders:'); console.log(bad.join('\n'));
await b.close();
