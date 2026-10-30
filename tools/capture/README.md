# tools/capture

Records a real browser's JavaScript surface into a Helix profile definition.

```bash
node tools/capture/capture.mjs --id chrome-137 --headed
```

## What it records, and what it cannot

A browser identity has two layers, and this tool only sees one of them.

**The JS layer — recorded here.** Everything a page's own JavaScript can read
about the machine: WebGL vendor and renderer, `hardwareConcurrency`,
`deviceMemory`, timezone, screen geometry, and which fonts resolve. This is the
layer `apps/api/src/browser/profiles.ts` injects into every Playwright context.

**The transport layer — not recorded, and not recordable.** TLS and HTTP/2
fingerprints are facts about a handshake that only the *server* observes; no API
inside a browser exposes them. Helix gets these from curl_cffi's impersonation
targets in helix-scrape (`apps/scrape`), which are maintained upstream against
real captures. The `tls` and `http2` blocks in a written definition document
what that identity is expected to be. They are never replayed.

## Why `--id` is constrained

`--id` must name an identity helix-scrape presents exactly — a curl_cffi target
in `apps/scrape/helix_scrape/profiles.py` (`RESOLVABLE` in `identity.mjs`; a test
keeps the two equal). The tool refuses anything else.

This is not bureaucracy. helix-scrape sends any other name as the nearest target
(Edge names as Chrome), and the response's `profile_used` is the only trace. A
definition called `chrome-149` would ship a Chrome 149 JS surface behind a Chrome
150 handshake, which is precisely the contradiction the profile system exists to
prevent. The Rust service had the same trap: it fell back to `chrome-137`
quietly, and a `chrome-149-macos` definition was in the repo when this tool was
written.

## Why a headless capture is refused

Three checks run before anything is written, and any one of them stops it:

| Refused when | Why |
|---|---|
| The user-agent contains `HeadlessChrome` | The string is itself a detection signal. Recording it bakes "this is a bot" into the profile. |
| The WebGL renderer is SwiftShader, llvmpipe or a software rasteriser | It fingerprints as "no GPU", which is a headless-server tell, not a desktop. |
| Two consecutive canvas reads differ | The browser is already spoofed or running an anti-fingerprinting extension, so its surface is not a baseline. |

`--force` overrides them. Do not use it: the file is still written with
`verified: true`, so the lie survives the person who told it.

Run with `--headed` on a machine with real graphics. `--channel chrome` records
from an actual Chrome install rather than Playwright's bundled build; use
`--executable` when you need a specific version, as below.

## Matching the version you record to the identity you claim

helix-scrape presents the Chrome, Safari and iOS Safari versions in `RESOLVABLE`
(for recent Chrome: 131, 133, 136, 142, 145, 146, 150, 151, 152; no Edge). Record
against a browser whose version is one of them, or the definition pairs one
version's user-agent with another's handshake — the contradiction the whole
profile system exists to prevent. The tool warns when they disagree.

Playwright usually keeps more than one Chromium build, and the older one is
often a version curl_cffi carries even when the newest is not:

```powershell
Get-ChildItem "$env:LOCALAPPDATA\ms-playwright" -Filter chrome.exe -Recurse |
  ForEach-Object { "{0} : {1}" -f $_.Directory.Parent.Name, $_.VersionInfo.ProductVersion }
```

Then pass that binary directly:

```bash
node tools/capture/capture.mjs --id chrome-148 --headed \
  --executable "$LOCALAPPDATA/ms-playwright/chromium-1223/chrome-win64/chrome.exe"
```

`chrome-148-windows.json` was recorded exactly that way, and is the reference
for what a `verified: true` definition looks like.

## Output

Written to `packages/profiles/definitions/<id>-<platform>.json`, with
`verified: true` and a `capturedAt` timestamp. A definition that carries
`verified: false` was hand-written and never measured.

Do not hand-edit the `js` block afterwards. A plausible-looking value that was
never observed is exactly what detection looks for.
