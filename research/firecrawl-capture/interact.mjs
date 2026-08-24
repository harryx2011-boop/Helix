import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = path.resolve('out');
fs.mkdirSync(OUT, { recursive: true });

const report = { log: [] };
function log(msg) {
  console.log(msg);
  report.log.push(msg);
}

function styleSnapshot(el) {
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    backgroundColor: s.backgroundColor,
    color: s.color,
    transform: s.transform,
    boxShadow: s.boxShadow,
    borderColor: s.borderTopColor,
    borderWidth: s.borderTopWidth,
    opacity: s.opacity,
    filter: s.filter,
    scale: s.scale,
    textDecorationLine: s.textDecorationLine,
    outlineColor: s.outlineColor,
    outlineWidth: s.outlineWidth,
    transition: s.transitionProperty + ' ' + s.transitionDuration + ' ' + s.transitionTimingFunction + ' ' + s.transitionDelay,
    rect: { top: r.top, left: r.left, width: r.width, height: r.height }
  };
}

function pickSelectorCandidates() {
  const WS = /\s+/g;
  const clean = (t) => (t || '').replace(WS, ' ').trim();
  const out = { primaryCtas: [], secondaryCtas: [], navLinks: [], cards: [] };
  const buttons = Array.from(document.querySelectorAll('a, button'));
  for (const b of buttons) {
    const r = b.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const txt = clean(b.textContent).slice(0, 40);
    if (!txt) continue;
    const cls = (b.className || '').toString();
    const s = getComputedStyle(b);
    const rec = { text: txt, tag: b.tagName.toLowerCase(), cls: cls.slice(0, 160), bg: s.backgroundColor };
    // prefer elements with explicit button-primary/button-secondary design-system classes over plain nav text links
    if (/button-primary/.test(cls) && out.primaryCtas.length < 3) {
      out.primaryCtas.unshift(rec);
    } else if (/get started|sign up|start|try|book a demo|start for free|start crawling/i.test(txt) && out.primaryCtas.length < 3) {
      out.primaryCtas.push(rec);
    } else if (/button-secondary/.test(cls) && out.secondaryCtas.length < 3) {
      out.secondaryCtas.unshift(rec);
    } else if (/log in|login|sign in|docs|contact|pricing/i.test(txt) && out.secondaryCtas.length < 3) {
      out.secondaryCtas.push(rec);
    }
  }
  const nav = document.querySelector('header, nav');
  if (nav) {
    for (const a of Array.from(nav.querySelectorAll('a')).slice(0, 8)) {
      const t = clean(a.textContent);
      if (t) out.navLinks.push({ text: t.slice(0, 30) });
    }
  }
  const cardEls = Array.from(document.querySelectorAll('[class*="card"], [class*="Card"]')).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 150 && r.height > 100 && r.width < 900;
  });
  out.cards = cardEls.slice(0, 30).map((el, i) => ({ idx: i, cls: (el.className || '').toString().slice(0, 160) }));
  return out;
}

const browser = await chromium.launch();

// ============================================================
// PART 1+2+3: homepage hover states, scroll animation, hero motion
// ============================================================
async function captureHomepage() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const results = { hover: {}, scrollAnim: {}, hero: {}, keyframes: {}, animationLibrary: {} };

  try {
    await page.goto('https://firecrawl.dev/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
  } catch (e) {
    log('FAIL homepage goto: ' + e.message.slice(0, 150));
    await ctx.close();
    return results;
  }

  // ---- PART 4-ish prelim: find candidate elements ----
  let candidates;
  try {
    candidates = await page.evaluate(pickSelectorCandidates);
    fs.writeFileSync(path.join(OUT, 'interact-candidates.json'), JSON.stringify(candidates, null, 2));
    log('OK candidates found: primary=' + candidates.primaryCtas.length + ' secondary=' + candidates.secondaryCtas.length + ' nav=' + candidates.navLinks.length + ' cards=' + candidates.cards.length);
  } catch (e) {
    log('FAIL candidates: ' + e.message.slice(0, 150));
    candidates = { primaryCtas: [], secondaryCtas: [], navLinks: [], cards: [] };
  }

  // ---- PART 1: HOVER STATES ----
  try {
    const hoverTargets = [];
    if (candidates.primaryCtas[0]) hoverTargets.push({ name: 'primary-cta', text: candidates.primaryCtas[0].text, tag: candidates.primaryCtas[0].tag });
    if (candidates.secondaryCtas[0]) hoverTargets.push({ name: 'secondary-cta', text: candidates.secondaryCtas[0].text, tag: candidates.secondaryCtas[0].tag });
    if (candidates.navLinks[0]) hoverTargets.push({ name: 'nav-link', text: candidates.navLinks[0].text, tag: 'a' });

    for (const target of hoverTargets) {
      try {
        const locator = page.locator(`${target.tag}:has-text("${target.text}")`).first();
        const count = await locator.count();
        if (!count) { log('SKIP hover ' + target.name + ': not found'); continue; }
        await locator.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        const handle = await locator.elementHandle();
        if (!handle) { log('SKIP hover ' + target.name + ': no handle'); continue; }

        const before = await page.evaluate(styleSnapshot, handle);
        await locator.hover();
        await page.waitForTimeout(400);
        const after = await page.evaluate(styleSnapshot, handle);

        const box = await locator.boundingBox();
        if (box) {
          const pad = 20;
          await page.screenshot({
            path: path.join(OUT, `interact-hover-${target.name}.png`),
            clip: {
              x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad),
              width: box.width + pad * 2, height: box.height + pad * 2
            }
          });
        }

        // move mouse away to reset
        await page.mouse.move(5, 5);
        await page.waitForTimeout(300);

        results.hover[target.name] = { text: target.text, before, after };
        log('OK hover captured: ' + target.name + ' (' + target.text + ')');
      } catch (e) {
        log('FAIL hover ' + target.name + ': ' + e.message.slice(0, 150));
      }
    }

    // hover a feature card: firecrawl's cards are divs containing a "Learn more" link that
    // fades in via opacity-0 -> opacity-100 on parent hover (Tailwind group-hover pattern)
    try {
      // find a card container: walk up from a "Learn more" link with opacity-0 to a reasonably-sized ancestor
      const cardBox = await page.evaluate(() => {
        const WS = /\s+/g;
        const clean = (t) => (t || '').replace(WS, ' ').trim();
        const links = Array.from(document.querySelectorAll('a')).filter((a) => clean(a.textContent) === 'Learn more' && /opacity-0/.test(a.className));
        if (!links.length) return null;
        let el = links[0];
        for (let i = 0; i < 6 && el.parentElement; i++) {
          el = el.parentElement;
          const r = el.getBoundingClientRect();
          // the card is a clickable button/div wrapper; accept a reasonably-sized ancestor (card widths ~250-320px, height ~80-350px on this design)
          if (r.width > 200 && r.width < 500 && r.height > 60 && r.height < 500 && (el.tagName === 'BUTTON' || el.tagName === 'A' || /cursor-pointer/.test(el.className))) {
            el.setAttribute('data-capture-card', 'true');
            return { top: r.top + window.scrollY, left: r.left, width: r.width, height: r.height };
          }
        }
        return null;
      });
      if (cardBox) {
        await page.evaluate((top) => window.scrollTo(0, top - 300), cardBox.top);
        await page.waitForTimeout(300);
        const cardLocator = page.locator('[data-capture-card="true"]').first();
        const handle = await cardLocator.elementHandle();
        const linkHandle = await page.locator('[data-capture-card="true"] a:has-text("Learn more")').first().elementHandle();

        const before = await page.evaluate(styleSnapshot, handle);
        const linkBefore = linkHandle ? await page.evaluate(styleSnapshot, linkHandle) : null;

        await cardLocator.hover();
        await page.waitForTimeout(400);

        const after = await page.evaluate(styleSnapshot, handle);
        const linkAfter = linkHandle ? await page.evaluate(styleSnapshot, linkHandle) : null;

        const box = await cardLocator.boundingBox();
        if (box) {
          await page.screenshot({
            path: path.join(OUT, 'interact-hover-card.png'),
            clip: { x: Math.max(0, box.x - 10), y: Math.max(0, box.y - 10), width: box.width + 20, height: box.height + 20 }
          });
        }
        results.hover['card'] = { before, after, learnMoreLink: { before: linkBefore, after: linkAfter } };
        log('OK hover captured: card (feature card with Learn-more reveal)');
        await page.mouse.move(5, 5);
        await page.waitForTimeout(300);
      } else {
        log('SKIP hover card: no card container resolved from Learn-more links');
      }
    } catch (e) {
      log('FAIL hover card: ' + e.message.slice(0, 150));
    }
  } catch (e) {
    log('FAIL hover section overall: ' + e.message.slice(0, 150));
  }

  // ---- PART 3: HERO MOTION ----
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    const shots = [];
    for (let i = 0; i < 3; i++) {
      const buf = await page.screenshot({ path: path.join(OUT, `interact-hero-frame${i}.png`) });
      shots.push(buf.length);
      if (i < 2) await page.waitForTimeout(900);
    }
    results.hero.frameByteSizes = shots;
    results.hero.framesDiffer = new Set(shots).size > 1;
    log('OK hero frames captured, byte sizes: ' + shots.join(', ') + ' differ=' + results.hero.framesDiffer);

    // enumerate animation-name computed values + matching keyframes
    const animInfo = await page.evaluate(() => {
      const found = [];
      const els = Array.from(document.querySelectorAll('*'));
      for (const el of els) {
        const s = getComputedStyle(el);
        if (s.animationName && s.animationName !== 'none') {
          const r = el.getBoundingClientRect();
          found.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || '').toString().slice(0, 120),
            animationName: s.animationName,
            animationDuration: s.animationDuration,
            animationTimingFunction: s.animationTimingFunction,
            animationIterationCount: s.animationIterationCount,
            animationDelay: s.animationDelay,
            visibleNow: r.top < window.innerHeight && r.bottom > 0
          });
        }
      }
      // dedupe by animationName
      const byName = {};
      for (const f of found) byName[f.animationName] = byName[f.animationName] || f;
      const uniqueNames = Object.keys(byName);

      const keyframeRules = {};
      try {
        for (const sheet of document.styleSheets) {
          let rules;
          try { rules = sheet.cssRules; } catch (e) { continue; }
          for (const r of rules || []) {
            if (r.type === CSSRule.KEYFRAMES_RULE && uniqueNames.includes(r.name)) {
              keyframeRules[r.name] = r.cssText.slice(0, 1500);
            }
          }
        }
      } catch (e) {}

      // also check for canvas/video/svg-animate elements in hero
      const hero = document.querySelector('header + *, main > section:first-child, main > div:first-child') || document.body;
      const canvases = Array.from(document.querySelectorAll('canvas')).length;
      const videos = Array.from(document.querySelectorAll('video')).length;
      const svgAnimates = Array.from(document.querySelectorAll('svg animate, svg animateTransform, svg animateMotion')).length;
      const lottiePlayers = Array.from(document.querySelectorAll('lottie-player, [class*="lottie"]')).length;

      return { animatedElements: found.slice(0, 40), uniqueAnimationNames: uniqueNames, keyframeRules, canvases, videos, svgAnimates, lottiePlayers };
    });
    results.hero.animations = animInfo;
    fs.writeFileSync(path.join(OUT, 'interact-hero-keyframes.json'), JSON.stringify(animInfo, null, 2));
    log('OK hero animation scan: names=' + animInfo.uniqueAnimationNames.length + ' canvases=' + animInfo.canvases + ' videos=' + animInfo.videos + ' svgAnimates=' + animInfo.svgAnimates + ' lottie=' + animInfo.lottiePlayers);
  } catch (e) {
    log('FAIL hero motion: ' + e.message.slice(0, 150));
  }

  // ---- detect animation library fingerprints ----
  try {
    const libInfo = await page.evaluate(() => {
      const html = document.documentElement.outerHTML;
      const hasFramerAttr = /data-framer|framer-motion/i.test(html);
      const hasGsapClass = /gsap-|data-gsap/i.test(html);
      const dataStateAttrs = new Set();
      document.querySelectorAll('[data-state]').forEach((el) => dataStateAttrs.add(el.getAttribute('data-state')));
      const animateInClasses = Array.from(document.querySelectorAll('[class*="animate-in"], [class*="fade-in"], [class*="slide-in"], [class*="reveal"]')).length;
      const win = window;
      const globals = {
        framerMotion: !!(win.FramerMotion || win.__framer),
        gsap: typeof win.gsap !== 'undefined',
        aos: typeof win.AOS !== 'undefined',
        lenis: typeof win.Lenis !== 'undefined' || !!document.querySelector('html.lenis, [data-lenis]')
      };
      return { hasFramerAttr, hasGsapClass, dataStateValues: Array.from(dataStateAttrs).slice(0, 20), animateInClassCount: animateInClasses, globals };
    });
    results.animationLibrary = libInfo;
    log('OK library fingerprint: framer=' + libInfo.globals.framerMotion + ' gsap=' + libInfo.globals.gsap + ' aos=' + libInfo.globals.aos + ' lenis=' + libInfo.globals.lenis + ' dataStates=' + JSON.stringify(libInfo.dataStateValues));
  } catch (e) {
    log('FAIL library fingerprint: ' + e.message.slice(0, 150));
  }

  // ---- PART 2: SCROLL-TRIGGERED ANIMATION ----
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    const sectionSelector = 'main > section, main > div > section, section, [class*="section"]';
    const sectionInfoBefore = await page.evaluate((sel) => {
      const WS = /\s+/g;
      const clean = (t) => (t || '').replace(WS, ' ').trim();
      const els = Array.from(document.querySelectorAll(sel)).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.height > 150;
      });
      const seen = new Set();
      const uniq = [];
      for (const el of els) {
        const key = el.className + '|' + Math.round(el.getBoundingClientRect().top + window.scrollY);
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push(el);
      }
      return uniq.slice(0, 14).map((el, i) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const heading = el.querySelector('h1,h2,h3');
        return {
          idx: i,
          cls: (el.className || '').toString().slice(0, 140),
          label: heading ? clean(heading.textContent).slice(0, 60) : clean(el.textContent).slice(0, 60),
          top: Math.round(r.top + window.scrollY),
          opacity: s.opacity,
          transform: s.transform
        };
      });
    }, sectionSelector);

    fs.writeFileSync(path.join(OUT, 'interact-scroll-sections-initial.json'), JSON.stringify(sectionInfoBefore, null, 2));
    log('OK scroll sections mapped: ' + sectionInfoBefore.length);

    // For each section, scroll it to just below viewport top, wait, then check opacity/transform change
    const scrollResults = [];
    for (const sec of sectionInfoBefore) {
      try {
        await page.evaluate((top) => window.scrollTo(0, Math.max(0, top - 400)), sec.top);
        await page.waitForTimeout(150);
        // capture the section itself AND up to 20 descendants (opacity/transform animations often live on inner wrappers, not the section)
        const captureFn = (cls) => {
          const els = document.querySelectorAll('[class]');
          let target = null;
          for (const el of els) {
            if ((el.className || '').toString().slice(0, 140) === cls) { target = el; break; }
          }
          if (!target) return null;
          const self = getComputedStyle(target);
          const descendants = Array.from(target.querySelectorAll('*')).slice(0, 40).map((el) => {
            const s = getComputedStyle(el);
            return { tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 80), opacity: s.opacity, transform: s.transform };
          }).filter((d) => d.opacity !== '1' || d.transform !== 'none');
          return {
            self: { opacity: self.opacity, transform: self.transform, transition: self.transitionProperty + ' ' + self.transitionDuration + ' ' + self.transitionTimingFunction },
            nonDefaultDescendants: descendants
          };
        };
        const captureBefore = await page.evaluate(captureFn, sec.cls);

        await page.evaluate((top) => window.scrollTo(0, top - 200), sec.top);
        await page.waitForTimeout(600);
        const captureAfter = await page.evaluate(captureFn, sec.cls);

        const changed = captureBefore && captureAfter && (
          captureBefore.self.opacity !== captureAfter.self.opacity ||
          captureBefore.self.transform !== captureAfter.self.transform ||
          captureBefore.nonDefaultDescendants.length !== captureAfter.nonDefaultDescendants.length
        );
        scrollResults.push({ label: sec.label, cls: sec.cls, before: captureBefore, after: captureAfter, animatesOnScroll: !!changed });
      } catch (e) {
        scrollResults.push({ label: sec.label, error: e.message.slice(0, 100) });
      }
    }
    results.scrollAnim.sections = scrollResults;
    fs.writeFileSync(path.join(OUT, 'interact-scroll-results.json'), JSON.stringify(scrollResults, null, 2));
    const animatedCount = scrollResults.filter((r) => r.animatesOnScroll).length;
    log('OK scroll-triggered check complete: ' + animatedCount + '/' + scrollResults.length + ' sections showed opacity/transform change');

    // IntersectionObserver detection
    const ioInfo = await page.evaluate(() => {
      return {
        ioDefined: typeof IntersectionObserver !== 'undefined',
        ioProtoOverridden: IntersectionObserver.toString().indexOf('[native code]') === -1
      };
    });
    results.scrollAnim.intersectionObserver = ioInfo;
    log('OK IntersectionObserver present natively: ' + JSON.stringify(ioInfo));
  } catch (e) {
    log('FAIL scroll animation section: ' + e.message.slice(0, 150));
  }

  fs.writeFileSync(path.join(OUT, 'interact-homepage-results.json'), JSON.stringify(results, null, 2));
  await ctx.close();
  return results;
}

// ============================================================
// PART 4: INTERACTIVE WIDGETS — homepage demo + /playground
// ============================================================
async function captureWidgets() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const results = { homepageDemo: {}, playground: {} };

  // ---- Homepage runnable demo ----
  try {
    await page.goto('https://firecrawl.dev/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    const demoInfo = await page.evaluate(() => {
      const WS = /\s+/g;
      const clean = (t) => (t || '').replace(WS, ' ').trim();
      const inputs = Array.from(document.querySelectorAll('input, textarea')).map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.type || '',
        placeholder: el.placeholder || '',
        cls: (el.className || '').toString().slice(0, 100)
      }));
      const submitBtns = Array.from(document.querySelectorAll('button')).filter((b) => /run|scrape|crawl|submit|try|extract|go\b/i.test(b.textContent || '')).map((b) => clean(b.textContent));
      return { inputs, submitBtns };
    });
    results.homepageDemo.structure = demoInfo;
    log('OK homepage demo structure: inputs=' + demoInfo.inputs.length + ' submitBtns=' + JSON.stringify(demoInfo.submitBtns));

    await page.screenshot({ path: path.join(OUT, 'interact-homepage-demo-initial.png'), fullPage: false });

    if (demoInfo.inputs.length) {
      try {
        const inputLocator = page.locator('input, textarea').first();
        await inputLocator.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await inputLocator.fill('https://example.com');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, 'interact-homepage-demo-filled.png') });
        log('OK homepage demo: filled input with example.com');

        // try to find and click a run/submit button near the input, WITHOUT signing in
        const runBtn = page.locator('button:has-text("Run"), button:has-text("Scrape"), button:has-text("Try"), button:has-text("Crawl"), button[type="submit"]').first();
        const runCount = await runBtn.count();
        if (runCount) {
          await runBtn.click({ timeout: 5000 }).catch((e) => log('INFO run click issue: ' + e.message.slice(0, 100)));
          await page.waitForTimeout(1500);
          await page.screenshot({ path: path.join(OUT, 'interact-homepage-demo-after-submit.png') });
          const postSubmitState = await page.evaluate(() => {
            const WS = /\s+/g;
            const clean = (t) => (t || '').replace(WS, ' ').trim();
            const hasAuthModal = !!document.querySelector('[class*="modal"], [class*="dialog"], [role="dialog"]');
            const bodyText = clean(document.body.innerText).slice(0, 400);
            return { hasAuthModal, url: location.href, bodyTextSnippet: bodyText };
          });
          results.homepageDemo.afterSubmit = postSubmitState;
          log('OK homepage demo post-submit: authModal=' + postSubmitState.hasAuthModal + ' url=' + postSubmitState.url);
        } else {
          log('SKIP homepage demo: no run/submit button found');
        }
      } catch (e) {
        log('FAIL homepage demo interaction: ' + e.message.slice(0, 150));
      }
    } else {
      log('SKIP homepage demo: no inputs found on page');
    }
  } catch (e) {
    log('FAIL homepage demo section: ' + e.message.slice(0, 150));
  }

  // ---- /playground ----
  try {
    await page.goto('https://firecrawl.dev/playground', { waitUntil: 'networkidle', timeout: 60000 }).catch(async () => {
      await page.goto('https://www.firecrawl.dev/playground', { waitUntil: 'networkidle', timeout: 60000 });
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, 'interact-playground-initial.png'), fullPage: false });

    // firecrawl playground tabs are plain buttons (Search/Scrape/Parse/Map/Crawl), no role=tab
    const knownTabNames = ['Search', 'Scrape', 'Parse', 'Map', 'Crawl'];
    const tabInfo = await page.evaluate((names) => {
      const WS = /\s+/g;
      const clean = (t) => (t || '').replace(WS, ' ').trim();
      const buttons = Array.from(document.querySelectorAll('button'));
      const tabs = [];
      for (const b of buttons) {
        const text = clean(b.textContent);
        if (names.includes(text)) {
          const r = b.getBoundingClientRect();
          tabs.push({ text, cls: (b.className || '').toString().slice(0, 120), width: Math.round(r.width), height: Math.round(r.height) });
        }
      }
      return tabs;
    }, knownTabNames);
    results.playground.tabs = tabInfo;
    log('OK playground tabs found: ' + tabInfo.length + ' -> ' + JSON.stringify(tabInfo.map((t) => t.text)));

    // click through each known tab and screenshot
    for (const name of knownTabNames) {
      try {
        const t = page.locator('button', { hasText: name }).first();
        const count = await t.count();
        if (!count) { log('SKIP playground tab ' + name + ': not found'); continue; }
        await t.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT, `interact-playground-tab-${name}.png`) });
        log('OK playground tab clicked: ' + name);
      } catch (e) {
        log('FAIL playground tab ' + name + ': ' + e.message.slice(0, 100));
      }
    }

    // check for auth gate on run — firecrawl playground's action buttons are "Start searching" / "Start scraping" / "Start crawling" etc, or "Get code"
    const runBtn = page.locator('button:has-text("Start"), button:has-text("Run"), button:has-text("Submit"), button:has-text("Execute"), button[type="submit"]').first();
    const runCount = await runBtn.count();
    if (runCount) {
      await runBtn.click({ timeout: 5000 }).catch((e) => log('INFO playground run click issue: ' + e.message.slice(0, 100)));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, 'interact-playground-after-run.png') });
      const gateInfo = await page.evaluate(() => {
        const WS = /\s+/g;
        const clean = (t) => (t || '').replace(WS, ' ').trim();
        const modal = document.querySelector('[class*="modal"], [class*="dialog"], [role="dialog"]');
        return {
          hasModal: !!modal,
          modalText: modal ? clean(modal.textContent).slice(0, 300) : '',
          url: location.href
        };
      });
      results.playground.runGate = gateInfo;
      log('OK playground run-gate check: hasModal=' + gateInfo.hasModal + ' url=' + gateInfo.url);
    } else {
      log('SKIP playground: no run button found');
    }
  } catch (e) {
    log('FAIL playground section: ' + e.message.slice(0, 150));
  }

  fs.writeFileSync(path.join(OUT, 'interact-widgets-results.json'), JSON.stringify(results, null, 2));
  await ctx.close();
  return results;
}

// ============================================================
// PART 5: CODE SAMPLE PRESENTATION (language tabs)
// ============================================================
async function captureCodeSamples() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const results = { tabs: [], colorMap: {} };

  try {
    await page.goto('https://firecrawl.dev/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    // find code block containers with tabs (python/js/curl etc)
    const codeBlockInfo = await page.evaluate(() => {
      const WS = /\s+/g;
      const clean = (t) => (t || '').replace(WS, ' ').trim();
      const pres = Array.from(document.querySelectorAll('pre, [class*="code"]'));
      const results = [];
      for (const pre of pres) {
        const r = pre.getBoundingClientRect();
        if (r.width < 200 || r.height < 60) continue;
        // look for tab buttons in the ancestor chain (up to 4 levels)
        let container = pre;
        let tabButtons = [];
        for (let depth = 0; depth < 5 && container; depth++) {
          const btns = Array.from(container.querySelectorAll('[role="tab"], button')).filter((b) => {
            const txt = clean(b.textContent);
            return /^(python|javascript|js|node|curl|typescript|ts|go|java|ruby|php)$/i.test(txt);
          });
          if (btns.length >= 2) { tabButtons = btns; break; }
          container = container.parentElement;
        }
        if (tabButtons.length >= 2) {
          results.push({
            top: Math.round(r.top + window.scrollY),
            tabLabels: tabButtons.map((b) => clean(b.textContent)),
            containerFound: true
          });
        }
      }
      return results;
    });
    log('OK code block scan: ' + codeBlockInfo.length + ' tabbed code blocks found');
    fs.writeFileSync(path.join(OUT, 'interact-codeblock-scan.json'), JSON.stringify(codeBlockInfo, null, 2));

    // interact with the first tabbed code block found
    const tabBtnLocator = page.locator('[role="tab"], button').filter({ hasText: /^(python|javascript|js|node|curl|typescript)$/i });
    const tabCount = await tabBtnLocator.count();
    if (tabCount >= 2) {
      for (let i = 0; i < Math.min(tabCount, 6); i++) {
        try {
          const t = tabBtnLocator.nth(i);
          const text = (await t.textContent() || '').trim();
          await t.scrollIntoViewIfNeeded();
          await t.click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(350);

          const codeText = await page.evaluate(() => {
            const activePre = document.querySelector('[role="tabpanel"]:not([hidden]) pre, [class*="active"] pre, pre');
            return activePre ? activePre.textContent.slice(0, 600) : '';
          });

          // capture token color mapping from the visible code block
          const colorMapping = await page.evaluate(() => {
            const pre = document.querySelector('[role="tabpanel"]:not([hidden]) pre, [class*="active"] pre, pre');
            if (!pre) return {};
            const spans = Array.from(pre.querySelectorAll('span')).slice(0, 200);
            const map = {};
            for (const sp of spans) {
              const cls = (sp.className || '').toString();
              const color = getComputedStyle(sp).color;
              const txt = (sp.textContent || '').slice(0, 20);
              const key = cls || 'no-class';
              if (!map[key]) map[key] = { color, sample: txt };
            }
            return map;
          });

          results.tabs.push({ index: i, label: text, codeSnippet: codeText, colorMapping });

          const box = await t.locator('xpath=ancestor::*[self::div or self::section][1]').first().boundingBox().catch(() => null);
          const shotPath = path.join(OUT, `interact-codeblock-tab-${i}-${text.replace(/[^a-z0-9]+/gi, '-')}.png`);
          if (box) {
            await page.screenshot({ path: shotPath, clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.min(box.width, 1440), height: Math.min(box.height, 800) } }).catch(async () => {
              await page.screenshot({ path: shotPath });
            });
          } else {
            await page.screenshot({ path: shotPath });
          }
          log('OK code tab captured: ' + text);
        } catch (e) {
          log('FAIL code tab ' + i + ': ' + e.message.slice(0, 150));
        }
      }
    } else {
      log('SKIP code tabs: fewer than 2 tab buttons found (count=' + tabCount + ')');
    }
  } catch (e) {
    log('FAIL code samples section: ' + e.message.slice(0, 150));
  }

  fs.writeFileSync(path.join(OUT, 'interact-codesamples-results.json'), JSON.stringify(results, null, 2));
  await ctx.close();
  return results;
}

// ============================================================
// PART 6: RESPONSIVE BREAKPOINTS
// ============================================================
async function captureResponsive() {
  const widths = [1920, 1440, 1024, 768, 390];
  const results = [];
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  try {
    for (const w of widths) {
      try {
        await page.setViewportSize({ width: w, height: 1000 });
        try {
          await page.goto('https://firecrawl.dev/', { waitUntil: 'networkidle', timeout: 45000 });
        } catch (navErr) {
          log('INFO responsive ' + w + 'px networkidle timed out, falling back to load: ' + navErr.message.slice(0, 80));
          await page.goto('https://firecrawl.dev/', { waitUntil: 'load', timeout: 45000 });
        }
        await page.waitForTimeout(1200);

        const info = await page.evaluate(() => {
          const WS = /\s+/g;
          const clean = (t) => (t || '').replace(WS, ' ').trim();
          const main = document.querySelector('main') || document.body;
          const mainRect = main.getBoundingClientRect();
          const mainStyle = getComputedStyle(main);

          // container width: look for a common wrapper with max-width
          const containers = Array.from(document.querySelectorAll('main > *, main > * > *')).filter((el) => {
            const s = getComputedStyle(el);
            return s.maxWidth && s.maxWidth !== 'none';
          });
          const containerWidth = containers.length ? containers[0].getBoundingClientRect().width : mainRect.width;
          const containerMaxWidth = containers.length ? getComputedStyle(containers[0]).maxWidth : mainStyle.maxWidth;

          // capability/feature grid column count: find a grid with 3+ children
          let gridCols = null;
          let gridSelector = null;
          const gridCandidates = Array.from(document.querySelectorAll('[class*="grid"]'));
          for (const g of gridCandidates) {
            const s = getComputedStyle(g);
            if (s.display === 'grid' && g.children.length >= 3) {
              const cols = s.gridTemplateColumns.split(' ').length;
              gridCols = cols;
              gridSelector = (g.className || '').toString().slice(0, 100);
              break;
            }
          }

          // nav hamburger check
          const hamburger = document.querySelector('[class*="hamburger"], [class*="menu-toggle"], [aria-label*="menu" i], button[class*="mobile"]');
          const nav = document.querySelector('header nav, nav');
          const navLinksVisible = nav ? Array.from(nav.querySelectorAll('a')).filter((a) => {
            const r = a.getBoundingClientRect();
            const s = getComputedStyle(a);
            return r.width > 0 && s.display !== 'none' && s.visibility !== 'hidden';
          }).length : 0;
          let hamburgerVisible = false;
          if (hamburger) {
            const r = hamburger.getBoundingClientRect();
            const s = getComputedStyle(hamburger);
            hamburgerVisible = r.width > 0 && s.display !== 'none' && s.visibility !== 'hidden';
          }

          return {
            windowWidth: window.innerWidth,
            containerWidth: Math.round(containerWidth),
            containerMaxWidth,
            gridCols,
            gridSelector,
            navLinksVisible,
            hamburgerPresent: !!hamburger,
            hamburgerVisible
          };
        });

        results.push({ width: w, ...info });
        await page.screenshot({ path: path.join(OUT, `interact-responsive-${w}.png`), fullPage: false });
        log('OK responsive ' + w + 'px: containerWidth=' + info.containerWidth + ' gridCols=' + info.gridCols + ' navLinksVisible=' + info.navLinksVisible + ' hamburgerVisible=' + info.hamburgerVisible);
      } catch (e) {
        log('FAIL responsive ' + w + 'px: ' + e.message.slice(0, 150));
      }
    }
  } catch (e) {
    log('FAIL responsive section overall: ' + e.message.slice(0, 150));
  }

  fs.writeFileSync(path.join(OUT, 'interact-responsive-results.json'), JSON.stringify(results, null, 2));
  await ctx.close();
  return results;
}

// ============================================================
// run all
// ============================================================
const [homepageResults, widgetResults, codeResults, responsiveResults] = await Promise.allSettled([
  captureHomepage(),
  captureWidgets(),
  captureCodeSamples(),
  captureResponsive()
]);

fs.writeFileSync(path.join(OUT, 'interact-log.json'), JSON.stringify(report.log, null, 2));

await browser.close();
log('DONE all sections attempted.');
