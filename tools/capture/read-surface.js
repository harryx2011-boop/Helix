/**
 * The script that runs inside the browser being recorded.
 *
 * Kept as its own file, and as plain JS rather than a template string, so the
 * thing being evaluated is readable and reviewable on its own. Everything here
 * runs in the page, so it may only use what a page has.
 */

/** Fonts a fingerprinter would plausibly probe for. Absent ones are simply not reported. */
const FONT_CANDIDATES = [
  'Arial',
  'Arial Black',
  'Calibri',
  'Cambria',
  'Comic Sans MS',
  'Consolas',
  'Courier New',
  'Georgia',
  'Helvetica',
  'Helvetica Neue',
  'Impact',
  'Lucida Console',
  'Lucida Grande',
  'Menlo',
  'Monaco',
  'Palatino',
  'SF Pro Text',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
];

/**
 * There is no API that lists installed fonts, so this measures instead: render
 * a string in a candidate with a known fallback, and if the width differs from
 * the fallback alone, the candidate resolved to something real.
 */
function detectFonts(candidates) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const probe = 'mmmmmmmmmmlli';
  const size = '72px';
  const baselines = ['monospace', 'sans-serif', 'serif'];

  const widthOf = (family) => {
    ctx.font = `${size} ${family}`;
    return ctx.measureText(probe).width;
  };

  const baselineWidths = new Map(baselines.map((b) => [b, widthOf(b)]));

  return candidates.filter((candidate) =>
    baselines.some((baseline) => widthOf(`"${candidate}", ${baseline}`) !== baselineWidths.get(baseline)),
  );
}

function webglStrings() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) return { vendor: null, renderer: null };

  // The unmasked pair is what fingerprinters read; the plain VENDOR is almost
  // always "WebKit" and tells nobody anything.
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  };
}

/**
 * A canvas hash read twice.
 *
 * Two identical reads are the expected result and the point of recording it: a
 * browser that returns different bytes on consecutive reads is either already
 * spoofed or running an anti-fingerprinting extension, and its surface should
 * not be recorded as a baseline.
 */
function canvasReads() {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 60;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { first: null, second: null };

  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillStyle = '#f60';
  ctx.fillRect(0, 0, 120, 30);
  ctx.fillStyle = '#069';
  ctx.fillText('helix profile capture', 2, 16);

  const first = canvas.toDataURL();
  const second = canvas.toDataURL();
  return { first: first.slice(-44), second: second.slice(-44) };
}

globalThis.__helixReadSurface = () => {
  const gl = webglStrings();
  const canvas = canvasReads();

  return {
    userAgent: navigator.userAgent,
    acceptLanguage: navigator.languages ? navigator.languages.join(',') : navigator.language,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    // Firefox and Safari do not implement deviceMemory at all; null is the
    // honest recording, not a guess.
    deviceMemory: typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: {
      width: screen.width,
      height: screen.height,
      colorDepth: screen.colorDepth,
    },
    webglVendor: gl.vendor,
    webglRenderer: gl.renderer,
    fonts: detectFonts(FONT_CANDIDATES),
    canvasStable: canvas.first !== null && canvas.first === canvas.second,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  };
};
