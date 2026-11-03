
export const RESOLVABLE = [
  'chrome-149',
  'chrome-148',
  'chrome-147',
  'chrome-146',
  'chrome-145',
  'chrome-144',
  'chrome-143',
  'chrome-142',
  'chrome-141',
  'chrome-140',
  'chrome-139',
  'chrome-138',
  'chrome-137',
  'chrome-136',
  'chrome-135',
  'chrome-134',
  'chrome-133',
  'chrome-132',
  'chrome-131',
  'edge-148',
  'edge-147',
  'edge-146',
  'edge-145',
  'edge-144',
  'edge-143',
  'edge-142',
  'edge-141',
  'edge-137',
  'edge-136',
  'edge-135',
  'edge-134',
  'edge-131',
  'edge-127',
  'safari-26-4',
  'safari-26-3',
  'safari-26-2',
  'safari-26-1',
  'safari-26',
  'safari-18-5',
  'safari-18-3-1',
  'safari-17-5',
  'safari-ios-26-2',
  'safari-ios-26',
  'safari-ios-18-1-1',
];

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
