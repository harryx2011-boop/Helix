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
inside a browser exposes them. Helix gets these from `wreq-util`'s emulation
presets in `apps/fetch`, which are maintained upstream against real captures.
The `tls` and `http2` blocks in a written definition exist to document what that
identity is expected to be and to give the Rust coherence validator something to
check the user-agent against. They are never replayed.

## Why `--id` is constrained

`--id` must name an identity `apps/fetch` actually resolves — see `available()`
in `apps/fetch/src/profile.rs`. The tool refuses anything else.

This is not bureaucracy. `resolve()` falls back to `chrome-137` for a name it
does not know, and it does so quietly. A definition called `chrome-149-macos`
therefore ships a Chrome 149 JS surface behind a Chrome 137 handshake, which is
precisely the contradiction the profile system exists to prevent. That bug was
already in the repo when this tool was written.

## Why a headless capture is refused

Three checks run before anything is written, and any one of them stops it:

| Refused when | Why |
|---|---|
| The user-agent contains `HeadlessChrome` | The string is itself a detection signal. Recording it bakes "this is a bot" into the profile. |
| The WebGL renderer is SwiftShader, llvmpipe or a software rasteriser | It fingerprints as "no GPU", which is a headless-server tell, not a desktop. |
| Two consecutive canvas reads differ | The browser is already spoofed or running an anti-fingerprinting extension, so its surface is not a baseline. |

`--force` overrides them. Do not use it: the file is still written with
`verified: true`, so the lie survives the person who told it.

Run with `--headed` on a machine with real graphics. Better still, use
`--channel chrome` so the recording comes from an actual Chrome install rather
than Playwright's bundled build — that also avoids the version warning, since
the bundled Chromium runs ahead of the identities `apps/fetch` presents.

## Known blocker: no browser here can record chrome-137

`apps/fetch` presents `chrome-137` as its newest identity. Playwright's bundled
Chromium and system Chrome are both **151**. Nothing on this machine can produce
a Chrome 137 JS surface, so every capture warns about a version mismatch and
would pair a 151 user-agent with a 137 handshake.

That is why `packages/profiles/definitions` still holds only `verified: false`
entries: the tool works, but shipping its output today would encode the exact
contradiction the profile system exists to prevent.

The fix is upstream of this tool — add the newer `Emulation` variants that
`wreq-util` offers to `available()` and `resolve()` in
`apps/fetch/src/profile.rs`, then record against a matching browser.

## Output

Written to `packages/profiles/definitions/<id>-<platform>.json`, with
`verified: true` and a `capturedAt` timestamp. A definition that carries
`verified: false` was hand-written and never measured.

Do not hand-edit the `js` block afterwards. A plausible-looking value that was
never observed is exactly what detection looks for.
