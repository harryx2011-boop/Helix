# Helix — Profiles API Spec

> **Status: deferred, and §2 below was partly wrong about why.**
>
> Reviewed 2026-08-26. The endpoint is still unbuilt, but the reason changed on
> inspection: it is not only that the definitions are placeholders, it is that
> the *transport* layer never read them at all. `apps/fetch`'s `resolve()` maps
> a profile name onto a `wreq-util` `Emulation` preset — real fingerprints,
> maintained upstream — while `load_all()` is a stub that never opens the JSON.
>
> What the definitions genuinely carry is the JS layer, and as of 2026-08-26
> the Playwright tier applies it (`apps/api/src/browser/profiles.ts`). So a
> `/profiles` listing would now describe something real rather than nothing.
> It stays deferred until `tools/capture` exists, because every definition is
> still `verified: false` — plausible values, not recorded ones.

## 1. Goal
Let a caller discover which browser identity profiles an instance can apply, so
`"profile": "chrome-149-macos"` on `/scrape`, `/search`, `/crawl` and `/monitor`
can be chosen from a real list instead of guessed.

## 2. Read-only, by design
This endpoint lists and inspects profiles. It does **not** create, edit or
upload them, and that is a deliberate constraint rather than a missing feature.

A profile is one coherent identity applied as a unit (`apps/fetch/src/profile.rs`).
Detection needs only one layer to disagree with the others — a JA4 claiming
Chrome alongside a Python client's HTTP/2 `HEADER_TABLE_SIZE` is a contradiction
visible before the response body exists. Profiles are validated for coherence at
load and an incoherent one is refused.

Accepting caller-authored profiles over HTTP would hand callers a way to
manufacture exactly the incoherent identities the subsystem exists to prevent.
Real profiles come from `tools/capture`, which records an actual browser's
handshake and JS surface. Hand-written fingerprint values "look plausible,
validate structurally, and are wrong in exactly the way detection systems look
for" (`packages/profiles/definitions/chrome-149-macos.json`).

Profiles therefore stay operator-supplied, on disk, loaded at boot.

## 3. Endpoints

### `GET /v1/profiles`
```json
{
  "success": true,
  "profiles": [
    {
      "id": "chrome-149-macos",
      "browser": "Chrome",
      "version": "149",
      "platform": "macOS",
      "userAgent": "Mozilla/5.0 (Macintosh; ...)",
      "sample": true
    }
  ],
  "default": "chrome-149-macos"
}
```

### `GET /v1/profiles/{id}`
Same entry plus the JS-layer surface a browser tier applies (`js`), and the
declared `tls.ja4` / `http2` shape for inspection.

**The fingerprint internals are metadata, not secrets** — they describe a public
browser, and a caller choosing a profile needs to know what it claims to be.

## 4. The `sample` flag
Exactly one definition ships today and it is a **placeholder with fabricated
values**, self-documented as such. Any profile whose definition carries the
`$comment` sample marker is reported with `"sample": true`, and `GET /v1/profiles`
sets `"warning"` when every loaded profile is a sample.

An endpoint that silently lists a fake identity as available would be worse than
no endpoint: it invites callers to rely on an identity that fails against a live
target. The flag is the point, not decoration.

## 5. Failure semantics
| Case | Status | Body |
|---|---|---|
| Unknown id | 404 | `not_found` |
| fetch service unreachable | 503 | `service_unavailable` |
| No profiles loaded | 200 | empty array, `warning` set |

A request naming an unknown profile on `/scrape` keeps its current behaviour;
this route does not change resolution, only discovery.

## 6. Open questions for review
1. **Source of truth.** Serve from helix-fetch (`profiles_loaded` already exists
   on its health route) so the list reflects what will actually be applied, or
   read `packages/profiles/definitions` from the API? Fetch is more honest;
   it makes `/profiles` fail when fetch is down.
2. **Expose `tls.ja4`?** Useful for debugging, and a caller can read it from any
   real browser anyway — but it invites treating the value as configurable.
3. **Is this worth building before real captures exist?** Resolved: no. Build
   `tools/capture` first, then this. Two things changed the answer — the JS
   layer is now actually applied, so a listing would mean something; and the
   naming trap surfaced (`chrome-149-macos` names an identity `resolve()` falls
   back from, silently serving chrome-137). A discovery endpoint that lists a
   name the transport tier does not know would advertise that bug rather than
   fix it. `available()` in `apps/fetch/src/profile.rs` is the real list.
