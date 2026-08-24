import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ROUTES = process.argv.slice(2);
if (!ROUTES.length) { console.error('usage: node capture.mjs <slug=url> ...'); process.exit(1); }

const OUT = path.resolve('out');
fs.mkdirSync(OUT, { recursive: true });

function TOKENS() {
  const seen = { color: {}, bg: {}, font: {}, size: {}, weight: {}, radius: {}, shadow: {}, spacing: {}, border: {}, transition: {}, letter: {}, lineh: {} };
  const bump = (k, v) => {
    if (!v || v === 'none' || v === 'normal' || v === 'rgba(0, 0, 0, 0)' || v === '0px') return;
    seen[k][v] = (seen[k][v] || 0) + 1;
  };
  const els = Array.from(document.querySelectorAll('*')).slice(0, 4000);
  for (const el of els) {
    const s = getComputedStyle(el);
    bump('color', s.color); bump('bg', s.backgroundColor);
    bump('font', s.fontFamily); bump('size', s.fontSize); bump('weight', s.fontWeight);
    bump('radius', s.borderRadius); bump('shadow', s.boxShadow);
    bump('border', s.borderTopWidth + ' ' + s.borderTopStyle + ' ' + s.borderTopColor);
    bump('transition', s.transitionDuration + ' ' + s.transitionTimingFunction);
    bump('letter', s.letterSpacing); bump('lineh', s.lineHeight);
    if (s.backgroundImage && s.backgroundImage.indexOf('gradient') !== -1) bump('bg', s.backgroundImage.slice(0, 220));
  }
  const rootVars = {};
  try {
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const r of rules || []) {
        const sel = r.selectorText;
        if (r.style && sel && (sel.indexOf(':root') !== -1 || sel.indexOf('html') !== -1 || sel.indexOf('data-theme') !== -1)) {
          for (const p of r.style) if (p.indexOf('--') === 0) rootVars[p] = r.style.getPropertyValue(p).trim();
        }
      }
    }
  } catch (e) {}
  const top = (k, n) => Object.entries(seen[k]).sort((a, b) => b[1] - a[1]).slice(0, n).map(([v, c]) => v + '  (' + c + ')');
  return {
    cssVars: rootVars,
    color: top('color', 22), bg: top('bg', 22), font: top('font', 8), fontSize: top('size', 20),
    fontWeight: top('weight', 10), radius: top('radius', 14), shadow: top('shadow', 12),
    border: top('border', 12), transition: top('transition', 10),
    letterSpacing: top('letter', 10), lineHeight: top('lineh', 12)
  };
}

function STRUCTURE() {
  const WS = new RegExp('\\s+', 'g');
  const clean = (t) => (t || '').replace(WS, ' ').trim();
  const sections = [];
  const roots = document.querySelectorAll('body > *, main > *, main > * > section, section, [class*="section"]');
  const seenEl = new Set();
  for (const el of roots) {
    if (seenEl.has(el)) continue;
    seenEl.add(el);
    const r = el.getBoundingClientRect();
    const h = r.height;
    if (h < 120) continue;
    const heads = Array.from(el.querySelectorAll('h1,h2,h3')).slice(0, 5).map((x) => x.tagName + ': ' + clean(x.textContent).slice(0, 110));
    if (!heads.length) continue;
    const s = getComputedStyle(el);
    sections.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 260),
      top: Math.round(r.top + window.scrollY), height: Math.round(h),
      bg: s.backgroundColor, bgImage: (s.backgroundImage || '').slice(0, 200),
      padding: s.padding, maxWidth: s.maxWidth,
      headings: heads,
      buttons: Array.from(el.querySelectorAll('a[class],button')).slice(0, 8).map((b) => clean(b.textContent).slice(0, 50)).filter(Boolean),
      copy: clean(el.innerText).slice(0, 900)
    });
  }
  const nav = document.querySelector('header, nav');
  const foot = document.querySelector('footer');
  const desc = document.querySelector('meta[name=description]');
  return {
    title: document.title,
    meta: desc ? clean(desc.content) : '',
    nav: nav ? { html: nav.outerHTML.slice(0, 3000), links: Array.from(nav.querySelectorAll('a')).map((a) => clean(a.textContent) + ' -> ' + a.getAttribute('href')).slice(0, 40) } : null,
    footer: foot ? { links: Array.from(foot.querySelectorAll('a')).map((a) => clean(a.textContent) + ' -> ' + a.getAttribute('href')).slice(0, 120), text: clean(foot.innerText).slice(0, 2500) } : null,
    h1: Array.from(document.querySelectorAll('h1')).map((x) => clean(x.textContent)),
    allHeadings: Array.from(document.querySelectorAll('h1,h2,h3')).map((x) => x.tagName + ': ' + clean(x.textContent)).slice(0, 90),
    sections: sections.slice(0, 40),
    fullText: clean(document.body.innerText).slice(0, 26000)
  };
}

const browser = await chromium.launch();
for (const spec of ROUTES) {
  const i = spec.indexOf('=');
  const slug = spec.slice(0, i), url = spec.slice(i + 1);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.evaluate(async () => {
      await new Promise((res) => {
        let y = 0;
        const t = setInterval(() => {
          window.scrollBy(0, 900); y += 900;
          if (y > document.body.scrollHeight) { clearInterval(t); res(); }
        }, 90);
      });
    });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);

    await page.screenshot({ path: path.join(OUT, slug + '-full.png'), fullPage: true });
    await page.screenshot({ path: path.join(OUT, slug + '-viewport.png') });

    const tokens = await page.evaluate(TOKENS);
    const structure = await page.evaluate(STRUCTURE);
    fs.writeFileSync(path.join(OUT, slug + '-tokens.json'), JSON.stringify(tokens, null, 2));
    fs.writeFileSync(path.join(OUT, slug + '-structure.json'), JSON.stringify(structure, null, 2));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, slug + '-mobile.png'), fullPage: true });

    console.log('OK ' + slug + '  ' + url + '  sections=' + structure.sections.length);
  } catch (e) {
    console.log('FAIL ' + slug + '  ' + url + '  ' + e.message.slice(0, 120));
  }
  await ctx.close();
}
await browser.close();
