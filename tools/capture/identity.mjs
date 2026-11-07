
/**
 * Identities helix-scrape presents exactly: each is a curl_cffi target in
 * `apps/scrape/helix_scrape/profiles.py`. Any other name is sent as the nearest
 * target, and Edge names are sent as Chrome, so none of those can be recorded.
 */
export const RESOLVABLE = [
  'chrome-152',
  'chrome-151',
  'chrome-150',
  'chrome-146',
  'chrome-145',
  'chrome-142',
  'chrome-136',
  'chrome-133',
  'chrome-131',
  'chrome-124',
  'chrome-123',
  'chrome-120',
  'chrome-119',
  'chrome-116',
  'chrome-110',
  'chrome-107',
  'chrome-104',
  'chrome-101',
  'chrome-100',
  'chrome-99',
  'safari-27',
  'safari-26',
  'safari-18-4',
  'safari-18',
  'safari-17',
  'safari-15-5',
  'safari-15-3',
  'safari-ios-27',
  'safari-ios-26',
  'safari-ios-18-4',
  'safari-ios-18',
  'safari-ios-17-2',
];

/** HTTP/2 header table size each engine sends (the old Rust validator's table). */
export const HEADER_TABLE_SIZE = { chrome: 65536, edge: 65536, firefox: 65536, safari: 4096 };

export function browserFromUserAgent(userAgent) {
  const ua = userAgent.toLowerCase();
  if (ua.includes('edg/')) return 'edge';
  if (ua.includes('firefox/')) return 'firefox';
  if (ua.includes('chrome/')) return 'chrome';
  if (ua.includes('safari/')) return 'safari';
  return 'unknown';
}

export function platformFromSurface(surface) {
  const ua = surface.userAgent.toLowerCase();
  if (surface.maxTouchPoints > 0 && ua.includes('mobile')) return ua.includes('android') ? 'android' : 'ios';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos';
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

export function versionFromUserAgent(userAgent, browser) {
  const key = browser === 'edge' ? 'edg' : browser === 'safari' ? 'version' : browser;
  const match = new RegExp(`${key}/(\\d+)`, 'i').exec(userAgent);
  return match ? match[1] : 'unknown';
}

export function recordingProblems(surface) {
  const problems = [];

  if (/headless/i.test(surface.userAgent)) {
    problems.push(
      'the user-agent says HeadlessChrome, which is itself a detection signal — ' +
        'record with --headed, or --channel chrome against a real install',
    );
  }

  if (surface.webglRenderer && /swiftshader|llvmpipe|software/i.test(surface.webglRenderer)) {
    problems.push(
      'the WebGL renderer is a software rasteriser, which fingerprints as "no GPU" ' +
        'rather than as a real desktop — record on a machine with graphics',
    );
  }

  if (!surface.webglRenderer) {
    problems.push('WebGL reported nothing at all, so the profile would carry no renderer string');
  }

  return problems;
}

export function versionMismatch(id, version) {
  const idVersion = /-(\d+)/.exec(id)?.[1];
  if (!idVersion || version === 'unknown') return undefined;
  return idVersion === version ? undefined : { expected: idVersion, recorded: version };
}
