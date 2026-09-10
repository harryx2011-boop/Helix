# Checks — build contract

A Tools surface over four API capabilities that ship, are tested, are in
`openapi.yaml`, and are already live MCP tools — but have no dashboard UI
and no entry in `lib/catalog.ts`.

This is not new product. It is surfacing what the API already answers.
The backend work is done; what is missing is a place for a person to type
a URL and see the answer.

## 0. What this is, and why it is one tool

Four capabilities, verified 2026-09-10 (agent `abf21f8`, file:line cited
throughout):

| Capability | Route | Handler | Tested |
|---|---|---|---|
| Robots check | `POST /v1/robots-check` | `apps/api/src/routes/robots.ts:21` | `robots.test.ts` |
| Diff | `POST /v1/diff` | `apps/api/src/routes/diff.ts:78` | `diff.test.ts` |
| PDF assess | `POST /v1/pdf-assess` | `apps/api/src/routes/pdf-assess.ts:85` | `pdf-assess.test.ts` |
| Selector | *(reuses `POST /v1/scrape`)* | — | — |

All are absent from `apps/dashboard/lib/catalog.ts` (whose `ENDPOINTS`
array holds exactly 12 entries, none of them these) and from the
`Endpoint` union in `lib/endpoints.ts`.

**One tool, four tabs — not four Tools entries.** Four separate
form-over-endpoint pages would rebuild Playground, which is already
~4,700 LOC of exactly that, one form per endpoint. The distinction that
earns Checks its own surface is *shape of answer*, not *count of
endpoints*: Playground answers "what does this endpoint return" for an
operator holding an API key; Checks answers "is this page OK" for someone
who has a URL and a question. Same instance, same key, different question.

**Non-goal: replacing the Playground tabs.** If a fifth capability wants a
raw request/response view, it belongs in Playground. Checks earns a tab
only when there is a plain-language question behind it.

## 1. Identity

- Product name: **Checks**. Not added to `lib/catalog.ts` — `catalog.ts`
  is the *product* catalog (things with a marketing route and a price
  story), and these are diagnostics against products already listed.
  Adding them there would imply four new products.
- Mark: a check inside a rounded square, single stroke, no fill — reads at
  16px in the nav tile and sidebar. Static; no ambient animation (unlike
  Vulcan's flame, which earns motion by being a brand mark at header size).
- Design system: the marketing surface's own tokens (`--m-*`), inherited
  from `app/(marketing)/layout.tsx`. **No scoped `[data-surface='checks']`
  block.** Convert and Vulcan each earn a scope by having a distinct
  visual identity; Checks is deliberately the dashboard's own voice —
  it is a utility, not a sub-brand. If a scope is later needed, add it
  rather than editing shared tokens.
- Theme: follows the marketing surface (its existing light/dark handling).

## 2. Ports / hosting

None of its own. Served by the dashboard on **3400**.

Routes:

- `/checks` — redirects to `/checks/robots`.
- `/checks/[tab]` — one of `robots` | `diff` | `pdf` | `selector`.

Under `app/(marketing)/` so the pages are public and prerenderable. Tab
state lives in the URL, not React state: a robots result for a given URL
is a thing a person links to a colleague.

## 3. Auth and the two build targets

Every tab calls the user's own Helix instance. There is no Checks-owned
backend and no new route handler.

**Self-host (static export, no route handlers):** the browser calls the
instance directly with the operator's key, via `HelixClient` — the path
`lib/run-endpoint.ts` already takes. Works today for robots, diff, and
scrape.

**Hosted:** calls go through the existing proxy at
`app/api/app/run/route.ts`, which resolves the signed-in user's key
server-side (Clerk `auth()` + `resolveDashboardApiKey`) and forwards to
the instance.

**This is the one piece of backend work in the whole contract.** The proxy
allowlist (`route.ts:10-23`) does not include these capabilities, so in
hosted mode they are unreachable from a browser today. The file already
models the exact extension needed: `agent-schema` rides as a non-`Endpoint`
string literal in `ProxyEndpoint` with a mapped `upstreamPath`
(`route.ts:26-35`). Three additions follow that same pattern:

```
type ProxyEndpoint = Endpoint | 'agent-schema' | 'robots-check' | 'diff' | 'pdf-assess';
```

with `upstreamPath` returning `/robots-check`, `/diff`, `/pdf-assess`.
No new route file, no new auth path, no schema change. If this extension
is rejected, hosted mode loses three of four tabs and the tool should not
ship.

**Which path wins (`shouldUseProxy`, `lib/checks.ts`).** Not `HOSTED`
alone. Checks is a *public* page, unlike the Agent panel behind `/app`, so
a hosted build still serves visitors holding their own key and no Clerk
session. A browser-held key (`lib/auth.ts`, the same `helix.apiKey` entry
the app's `ApiKeyProvider` reads) therefore wins wherever one exists, and
the proxy is the fallback for a signed-in user without one. Branching on
`HOSTED` alone sends a key-holding operator through the proxy and 401s —
found by driving the page in a browser, not by typechecking.

Because `lib/checks.ts` is `'use client'`, tab identity lives in a
separate `lib/checks-tabs.ts` with no directive: importing constants from
a client module into `generateStaticParams` hands the server a client
reference proxy rather than the array, and the route 500s.

## 4. The four tabs

### 4.1 Robots (`/checks/robots`)

Request `{ url, userAgent? }` → `{ url, userAgent, allowed,
crawlDelaySeconds, sitemaps }` (`routes/robots.ts:12-47`).

The answer is one word — Allowed or Blocked — then the matched rule,
crawl delay, and discovered sitemaps. The endpoint's own doc comment is
the feature: it uses the same `RobotsCache` that `/crawl` and `/map` use,
so "the answer here is exactly what a crawl would decide — never a second
opinion from a separate parser" (`robots.ts:6-9`). The UI must say this,
because it is the reason to use it over any online robots tester.

`userAgent` is a free-text field with the Helix default prefilled.

### 4.2 Diff (`/checks/diff`)

Request is a discriminated union on `mode` (`routes/diff.ts:19-40`):

- `{ mode: 'text', before, after, granularity? }` where each side is
  `{text}` or `{url}`; granularity `word` (default) | `line` | `character`.
- `{ mode: 'json', before, after }`.

`mode` defaults to `'text'` via a `z.preprocess` (`diff.ts:25-26`).
When a side is `{url}`, the server fetches it through the same pipeline
`/scrape` uses and diffs the resulting markdown.

Two side-by-side inputs, each toggling text-or-URL. Output is the Myers
diff, rendered inline with adds and removes.

**Bound:** text diffs are capped at 128KB server-side (`MAX_DIFF_BYTES`,
`diff.ts:19`). The UI surfaces the truncation rather than silently showing
a partial diff.

**Relationship to Monitor:** Diff is not a mode of Monitor. Both import
the same engine (`monitor/diff.ts`), but `/monitor` keeps a schedule and a
baseline while `/diff` is stateless and one-shot — per `diff.ts:10-17`,
it is "for a caller that already has two things to compare right now".
The tab links to Monitor for the scheduled case.

### 4.3 PDF (`/checks/pdf`)

Request: JSON `{ url, timeout? }` (1000–300000ms, default 30000) **or**
multipart with a `file` part (`pdf-assess.ts:16-19`).

Response `{ success: true, data: { pageCount, charsExtracted, needsOcr,
suspectedGarbledText, reason, metadata } }`, or a typed failure envelope
at HTTP 200 (`pdf-assess.ts:157-187`).

The question is "will parsing this cost me OCR". Per `pdf-assess.ts:8-14`
it wraps the same classifier `/parse` runs before choosing a parser, so
the caller can decide "whether a full parse is worth paying for... before
spending either". Headline is `needsOcr`; `suspectedGarbledText` is the
second signal; `reason` explains both.

Accepts drag-and-drop. Non-PDFs are rejected server-side with
`reason: 'unsupported_type'` (`pdf-assess.ts:143-156`) — the UI filters by
type before upload rather than making the user wait for that round trip.

### 4.4 Selector (`/checks/selector`)

**No dedicated endpoint, and it cannot fetch pages itself.** A browser
`fetch()` against an arbitrary third-party URL is blocked by *that site's*
CORS policy, which it controls and which will not name our origin. This is
precisely why `/scrape` exists: the server fetches, the browser receives.

So this tab calls `POST /v1/scrape` with `formats: ['rawHtml']` (already
supported — see `FORMAT_OPTIONS`, `scrape-form.tsx:13-22`), then runs
selector matching **client-side** against the returned HTML via
`DOMParser`. CSS via `querySelectorAll`; XPath via `document.evaluate`.

Output: match count, each match's outer HTML, and a copy-out that emits
the selector in the shape `/scrape` and `/extract` want — which is the
actual point of the tab. It turns a guess into a working request body.

The fetched HTML is held in memory for the session and re-matched on every
keystroke without re-fetching. One fetch, many selectors.

## 5. Schema Designer — deliberately excluded

`/v1/agent/schema` was considered as a fifth tab and is **not** included.

It is not unsurfaced. It has a production caller: `agent-client.tsx:65`
calls `requestAgentSchema` (`lib/agent.ts:11-28`), rendering into
`SchemaPanel` with a `RefineBar` for iteration. It is load-bearing for the
Agent flow and already has its own proxy carve-out.

A second schema UI would mean two divergent surfaces over one endpoint,
and the Agent page's version is the better-placed one — schema authoring
belongs next to the run that consumes the schema, not in a diagnostics
tool. If schema authoring needs to grow, it grows in the Agent panel.

Recorded here so a future session does not re-propose it.

## 6. Registration

One entry in `TOOL_ROWS` (`components/marketing/nav-menus.tsx:99-114`),
which feeds both the landing nav's Tools menu and the app sidebar:

```
{ label: 'Checks', href: '/checks', icon: ChecksMark },
```

Placed after Converter and Canvas, before Playground — grouping the
public utilities ahead of the signed-in ones. `MenuRow.icon` is typed
`LucideIcon | ComponentType<{ className?: string }>` (`icon-type.ts`), so
a custom mark needs no type change.

The footer's Tools column keeps its own hand-written list rather than
reading `TOOL_ROWS`, so it takes a second entry (`components/marketing/
footer.tsx`). Two places, not one.

## 7. Scope

In:

- Four tabs, the routes in §2, the proxy allowlist extension in §3.
- Deep-linkable state: URL and options in the query string.
- Failure envelopes rendered as answers, not errors — a blocked robots
  result or a `needs_ocr` verdict is a successful check.

Out:

- **No new API route.** The allowlist entry is the only backend change.
- **No persistence.** No history, no saved checks, no Supabase table, no
  migration. A check is a question you ask once. (Converter's job history
  earns its keep because conversions are slow and re-runnable; these are
  sub-second.)
- **No scheduling.** That is Monitor, and §4.2 links to it.
- **No catalog entry.** Per §1.
- **No `[data-surface]` scope.** Per §1.
- **No batch input.** One URL per check. Batch is `/batch/scrape`'s job.

## 8. Version

MINOR — a backwards-compatible feature. Bump the root manifest and every
derived appearance in the same commit, per `reference/versioning.md`.
