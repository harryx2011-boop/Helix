#!/usr/bin/env node
/**
 * Record a real browser's JS surface into a profile definition.
 *
 * What this does and does not cover matters, because the file it writes claims
 * to be a recording:
 *
 * - It records the **JS layer** — what a page's own JavaScript can read about
 *   the machine. That is the layer `apps/api/src/browser/profiles.ts` applies.
 * - It does **not** record the transport layer. TLS and HTTP/2 fingerprints are
 *   not observable from inside a browser; they are facts about a handshake only
 *   the server sees. Helix gets those from `wreq-util`'s emulation presets, so
 *   the `tls` and `http2` blocks here are carried for documentation and for the
 *   Rust coherence validator, not replayed.
 *
 * Because of that split, `--id` must name an identity `apps/fetch` actually
 * resolves (see `available()` in apps/fetch/src/profile.rs). Recording Chrome
 * 152's JS surface under a name the transport tier falls back from would
 * produce exactly the contradiction profiles exist to prevent.
 *
 * Usage:
 *   node tools/capture/capture.mjs --id chrome-137
 *   node tools/capture/capture.mjs --id chrome-137 --channel chrome --headed
 *   node tools/capture/capture.mjs --id safari-18-5 --browser webkit
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import {
  browserFromUserAgent,
  HEADER_TABLE_SIZE,
  platformFromSurface,
  recordingProblems,
  RESOLVABLE as RESOLVABLE_LIST,
  versionFromUserAgent,
  versionMismatch,
} from './identity.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const DEFINITIONS = join(REPO_ROOT, 'packages', 'profiles', 'definitions');

const RESOLVABLE = new Set(RESOLVABLE_LIST);

function parseArgs(argv) {
  const args = { browser: 'chromium', headed: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--headed') args.headed = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--id') args.id = argv[++i];
    else if (arg === '--browser') args.browser = argv[++i];
    else if (arg === '--channel') args.channel = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else {
      console.error(`unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

const HELP = `Record a real browser's JS surface into a profile definition.

  --id <name>        Required. Must be an identity apps/fetch resolves, e.g. chrome-137.
  --browser <name>   chromium | firefox | webkit. Default chromium.
  --channel <name>   Playwright browser channel, e.g. chrome, msedge. Use a real
                     installed browser rather than Playwright's bundled build.
  --headed           Show the window. Some GPUs report a different renderer headless.
  --out <path>       Write here instead of packages/profiles/definitions/<id>-<platform>.json.
  --force            Overwrite an existing definition.

The transport layer (TLS, HTTP/2) is not recorded — see the header comment.`;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP);
    return;
  }

  if (!args.id) {
    console.error('--id is required.\n');
    console.error(HELP);
    process.exit(2);
  }

  if (!RESOLVABLE.has(args.id) && !args.force) {
    console.error(
      `--id ${args.id} is not an identity apps/fetch resolves, so the transport layer would\n` +
        `fall back to chrome-137 while this JS layer claimed otherwise. Pick one of:\n  ` +
        [...RESOLVABLE].join('\n  ') +
        `\n\nPass --force only if you are adding the name to available() in the same change.`,
    );
    process.exit(2);
  }

  const launcher = { chromium, firefox, webkit }[args.browser];
  if (!launcher) {
    console.error(`--browser must be chromium, firefox or webkit (got ${args.browser})`);
    process.exit(2);
  }

  const readSurface = readFileSync(join(HERE, 'read-surface.js'), 'utf8');

  const browser = await launcher.launch({
    headless: !args.headed,
    ...(args.channel ? { channel: args.channel } : {}),
    // `screen.width` reports the display, but a browser launched into a small
    // window can report the window instead. Starting maximised, with no forced
    // viewport below, is what makes the recorded geometry the real monitor's.
    ...(args.headed && args.browser === 'chromium' ? { args: ['--start-maximized'] } : {}),
  });

  let surface;
  try {
    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();
    // A real origin, not about:blank: some APIs behave differently on an opaque
    // origin, and a recording taken there would not describe normal browsing.
    await page.goto('https://example.com/', { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: readSurface });
    surface = await page.evaluate(() => globalThis.__helixReadSurface());
  } finally {
    await browser.close();
  }

  // A recording is only useful if it describes a browser a site would believe.
  const problems = recordingProblems(surface);
  if (problems.length > 0 && !args.force) {
    console.error('Refusing to record:');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('\nPass --force to write it anyway — it would still be marked verified:true, so do not.');
    process.exit(1);
  }

  if (!surface.canvasStable) {
    console.error(
      'Refusing to record: this browser returned different canvas bytes on two consecutive\n' +
        'reads. That means it is already spoofed or running an anti-fingerprinting extension,\n' +
        'and its surface is not a usable baseline.',
    );
    process.exit(1);
  }

  const detectedBrowser = browserFromUserAgent(surface.userAgent);
  const platform = platformFromSurface(surface);
  const version = versionFromUserAgent(surface.userAgent, detectedBrowser);
  const tableSize = HEADER_TABLE_SIZE[detectedBrowser];

  if (!tableSize) {
    console.error(`Recorded an unrecognised engine (${detectedBrowser}); refusing to guess its HTTP/2 settings.`);
    process.exit(1);
  }

  // A JS layer recorded from Chrome 151 stored under the chrome-137 identity is a
  // contradiction: the transport tier would present 137's fingerprint beside a 151
  // user-agent. Warned rather than refused, since the id is the caller's choice.
  const mismatch = versionMismatch(args.id, version);
  if (mismatch) {
    console.warn(
      `Warning: recorded ${detectedBrowser} ${mismatch.recorded} but --id says ${args.id}. The transport\n` +
        `layer will present ${args.id}'s fingerprint next to this ${mismatch.recorded} user-agent.`,
    );
  }

  const definition = {
    $comment: [
      'Recorded by tools/capture from a real browser. Do not hand-edit the js block:',
      'a plausible-looking value that was never measured is exactly what detection',
      'looks for.',
      '',
      'The tls and http2 blocks are NOT recordings — the transport layer is not',
      'observable from inside a browser. Helix presents wreq-util emulation for',
      'this identity; these values document what that is expected to be and give',
      "the Rust validator something to check the user-agent against.",
    ],
    id: args.id,
    browser: detectedBrowser,
    version,
    platform,
    capturedAt: new Date().toISOString(),
    verified: true,
    tls: {
      $comment: 'Documentation only. The handshake actually sent is wreq-util’s.',
      ja4: 'unset_transport_owned_by_wreq_util',
      cipherSuites: ['TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256'],
      extensions: [
        'server_name',
        'extended_master_secret',
        'renegotiation_info',
        'supported_groups',
        'ec_point_formats',
        'application_layer_protocol_negotiation',
        'status_request',
        'signature_algorithms',
        'signed_certificate_timestamp',
        'key_share',
        'psk_key_exchange_modes',
        'supported_versions',
      ],
      alpn: ['h2', 'http/1.1'],
    },
    http2: {
      $comment: `${detectedBrowser} sends ${tableSize}; the validator rejects anything else for this engine.`,
      headerTableSize: tableSize,
      initialWindowSize: 6291456,
      maxConcurrentStreams: 1000,
      pseudoHeaderOrder: [':method', ':authority', ':scheme', ':path'],
    },
    headers: {
      userAgent: surface.userAgent,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      acceptLanguage: surface.acceptLanguage,
      acceptEncoding: 'gzip, deflate, br, zstd',
      $comment: 'Header ORDER is itself a fingerprint, independent of the values.',
      order: [
        'host',
        'connection',
        'sec-ch-ua',
        'sec-ch-ua-mobile',
        'sec-ch-ua-platform',
        'upgrade-insecure-requests',
        'user-agent',
        'accept',
        'sec-fetch-site',
        'sec-fetch-mode',
        'sec-fetch-user',
        'sec-fetch-dest',
        'accept-encoding',
        'accept-language',
      ],
    },
    js: {
      $comment:
        'Recorded. canvasSeed is derived from the profile id and held stable: real browsers return an identical canvas hash on every read, and randomising per read is itself the tell.',
      canvasSeed: `${args.id}-${platform}`,
      webglVendor: surface.webglVendor,
      webglRenderer: surface.webglRenderer,
      hardwareConcurrency: surface.hardwareConcurrency,
      deviceMemory: surface.deviceMemory,
      timezone: surface.timezone,
      screen: surface.screen,
      fonts: surface.fonts,
    },
  };

  const outPath = args.out ? resolve(args.out) : join(DEFINITIONS, `${args.id}-${platform}.json`);
  mkdirSync(dirname(outPath), { recursive: true });

  try {
    readFileSync(outPath);
    if (!args.force) {
      console.error(`${outPath} already exists. Pass --force to overwrite it.`);
      process.exit(1);
    }
  } catch {
    // Does not exist, which is the normal case.
  }

  writeFileSync(outPath, `${JSON.stringify(definition, null, 2)}\n`);

  console.log(`Recorded ${detectedBrowser} ${version} on ${platform} -> ${outPath}`);
  console.log(`  cores=${surface.hardwareConcurrency} memory=${surface.deviceMemory ?? 'unreported'}`);
  console.log(`  screen=${surface.screen.width}x${surface.screen.height}@${surface.screen.colorDepth}`);
  console.log(`  timezone=${surface.timezone}`);
  console.log(`  webgl=${surface.webglRenderer ?? 'unavailable'}`);
  console.log(`  fonts=${surface.fonts.length} detected`);
}

await main();
