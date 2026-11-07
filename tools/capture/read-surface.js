
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

  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  };
}

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
