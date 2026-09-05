# Canvas Connect → Helix: merge scope

> Status: **merged and shipped as Helix 1.17.0, 2026-09-05.** All five phases done bar the
> final GitHub deletion, which is a deliberate hold. Sits alongside CONVERTER-CONTRACT.md
> and PERSONA.md as the third sibling-product doc.
>
> **Both previously-open items are now closed:**
>
> 1. **The unmerged `http_auth` branch is cherry-picked in** as canvas-mcp **1.1.0**
>    (`58c1561`). See below.
> 2. **Shipped as Helix 1.17.0**, which names Canvas in its own release line.
>
> **One item remains, and it is a deliberate hold:** the GitHub repo
> `harryx2011-boop/CanvasLMS-API` is archived at `e:/archive/` but not deleted. With the
> auth branch now merged, nothing unique remains on it — deletion is safe whenever wanted,
> but it is irreversible and stays a human call.

## What shipped

| Commit | What |
|---|---|
| `d0ef9d8` | The presentation: four routes, the real Canvas mark, the `segments` hero motif |
| `70b4788` | The server: `tools/canvas-mcp/` by subtree merge, history preserved |
| `0193d16` | Decommission: URLs repointed at Helix, old repo archived (not deleted) |
| `3a73562` | The markdown twin, which also fixed the search index |
| `58c1561` | `http_auth` cherry-picked from the archived branch — canvas-mcp 1.1.0 |

Verified rather than assumed: both build gates pass on NTFS (self-host `output: export` and
`HELIX_HOSTED=1`, 79/79 static pages each), 162 Python tests pass and ruff is clean from the
new location. At the point of the move, `src/`, `tests/` and `skills/` were **byte-identical
by tree hash** to `a8ecb12` — the utility crossed unchanged, which was the requirement. The
only deliberate change since is the `http_auth` cherry-pick, which adds a capability rather
than altering an existing one.

## The decision in one line

**The utility moves unchanged; the presentation is rebuilt in Helix.** The Python MCP
server (100 tools, 6.8k lines) comes across with its history as `tools/canvas-mcp/`. The
Next.js marketing site (`web/`) does **not** come across — its pages are re-authored as
routes under `apps/dashboard/app/(marketing)/canvas/` using Helix's own components and
tokens. Canvas Connect stops being a site and becomes a Tools entry in Helix.

## Why the site cannot simply be copied

The two front-ends do not share a runtime.

| | Canvas `web/` | Helix `apps/dashboard` |
|---|---|---|
| Next | 16.3.2 | 15.1 |
| React | 19.2.8 | 19.0 |
| Tailwind | **v4** (`@theme inline`) | **v3.4** (`tailwind.config.ts`) |
| Icons | lucide-react 1.34 | lucide-react 0.468 |
| Theme | light-first, `.dark` class, orange accent | `data-surface="marketing"`, `m-*` tokens, violet accent |

Tailwind v4 and v3 do not coexist in one app, and the accents are two different products'
brands. So `web/src/components/*` is **reference material, not source**. What transfers
verbatim is the *data* (`tools.json`, `skills.ts`, `CHANGELOG.md`) and the *copy*; what
gets rebuilt is every component around it.

This is the call the repo already made for capability pages: `capability-page.tsx` renders
eleven endpoint pages from one component. Canvas gets the same treatment rather than
importing a second design system.

---

## Target layout

```
e:/Helix
  tools/canvas-mcp/                    ← moved wholesale, git history preserved
    src/canvaslms_api/                 100 tools, unchanged
    tests/                             pytest + respx, unchanged
    skills/                            8 agent skills, unchanged
    pyproject.toml  Dockerfile  README.md  CHANGELOG.md  context.md
    (NOT a pnpm workspace member — uv/pytest run inside it)

  apps/dashboard/
    app/(marketing)/canvas/
      page.tsx                         hero · problem · install · usage · safety · CTA
      tools/page.tsx                   the 100-tool explorer
      skills/page.tsx                  8 skill cards
      changelog/page.tsx               renders the server's CHANGELOG.md
    components/marketing/
      canvas-mark.tsx                  the real Instructure Canvas mark
      canvas/tools-explorer.tsx        rebuilt on Helix tokens
      canvas/install-tabs.tsx          OS × client matrix, on Helix's Tabs
    lib/canvas.ts                      catalog: tool groups, counts, install commands
    public/canvas/tools.json           generated from list_tools()
```

`tools/` already holds `capture` and `antibot-suite`, so a non-JS tool directory is the
established home. `apps/` is reserved for deployables; the MCP server is not one.

---

## Work breakdown

### Phase 0 — clean the source repo — **DONE 2026-09-05, not by this session**

The in-flight work this phase existed to rescue was committed by another session as
`a8ecb12` — *"CanvasLMS-API 1.0.2: retries, cache invalidation, per-tool timeouts"* — while
this document was being written. It is a larger and better change than the dirty tree
suggested: 13 files, +374/−23, covering GET/HEAD retry with jittered backoff (writes
deliberately never retried), a `Retry-After` cap reasoned against the new per-tool
timeouts, course-cache invalidation on content-changing writes, and per-call timeout
overrides for the slow tools. `pyproject.toml` and `__init__.py` are at **1.0.2**.

The working tree is clean and the subtree move is unblocked.

1. ~~Commit the in-flight work.~~ Done as `a8ecb12`.
2. **DONE.** Tagged the Canvas repo `pre-helix-merge` at `a8ecb12`, so the standalone
   form stays recoverable the way Noted was tagged `pre-merge`. Only `v1.0.0` exists today
   — note there is no `v1.0.1` or `v1.0.2` tag, so if tags are meant to track releases,
   those are missing and should be added before the repo is deleted in Phase 5.

**Lesson for the rest of this plan:** this repo has other sessions working in it. Re-read
state immediately before acting on it rather than trusting a reading taken minutes earlier.

### Phase 1 — move the server (~1 h)

3. `git subtree add --prefix=tools/canvas-mcp <canvas remote> main` — preserves all six
   commits. A plain file copy loses them.
4. Rewrite `tools/canvas-mcp/context.md`: it is no longer a repo root. Its "Marketing site
   (`web/`)" section is deleted and replaced with a pointer to the Helix routes.
5. Delete `tools/canvas-mcp/web/` in the same commit — it is superseded by Phase 3, and
   leaving it means two sites for one product.
6. Confirm pnpm ignores it: `pnpm-workspace.yaml` lists members explicitly, so no change
   needed — but the deletion in step 5 is what guarantees its `package.json` never reaches
   the lockfile.
7. Root `README.md` and `context.md` gain a Canvas paragraph.

**Helix becomes polyglot.** Today every workspace member is TS/Node. After this, CI must
not assume `pnpm -r test` covers everything: `tools/canvas-mcp` runs `uv` + `pytest` +
`ruff`. Add a root `test:canvas` script and say so in `context.md`, or the tests silently
stop running.

### Phase 2 — the brand mark — **DONE 2026-09-05** (uncommitted)

The current `web/public/logo.svg` is a **monogram in a slate gradient square** — not the
Canvas mark. Global rule: a UI referencing a third-party product shows that brand's real
logo, never a monogram.

8. Fetch the Instructure Canvas mark from **`canvas.instructure.com`**, not
   `instructure.com` — the parent domain serves the Instructure "I", and favicon services
   walk up the tree on a miss and return it with a 200. Verify by eye and by byte-hash; a
   tiny payload, or a hash shared with the parent, means the wrong mark.
9. Add `components/marketing/canvas-mark.tsx`, mirroring the existing `github-mark.tsx`
   (which exists for exactly this reason — lucide ships no brand icons).
10. **Widen `MenuRow.icon`** in `nav-menus.tsx` from `LucideIcon` to
    `LucideIcon | ComponentType<{ className?: string }>`, and the same in `IconTileProps`.
    A real type change touching every `IconTile` call site and `catalog.ts`'s
    `EndpointDef.icon` consumers. `IconTile` passes `strokeWidth`, so a non-lucide
    component must accept-and-ignore it or the prop must become conditional.
11. Trademark posture: the mark identifies the product Canvas Connect talks to. Keep it
    unmodified, never use it as Helix's own icon, and carry a "not affiliated with
    Instructure" line.

**What was actually done.** The two hosts were confirmed to serve *different* marks —
`canvas.instructure.com/favicon.ico` sha256 `46bf05e4…` (the ring of dots) versus
`instructure.com/favicon.ico` sha256 `a015a7ac…` (the Instructure "I" on navy). Verified by
hash *and* by eye; the rule's predicted failure mode was real, not hypothetical.

Canvas serves 503 to everything but `/favicon.ico`, so no SVG or >64px raster was
obtainable. The mark was therefore **traced as exact vector geometry** from the 64px source
rather than shipped as a blurry raster: eight-fold symmetry on 45° centres, arcs subtending
34° across a band from 0.7031R to R, dot centres at 0.5352R with radius 0.0938R, brand red
`#E63D2F`. Rendered-vs-reference IoU 0.836; the residual is the reference's own
antialiasing at 64px, and a higher-IoU fit (0.859) was **rejected because it looked visibly
thinner than the real mark** — the eye check is the authority, per the rule.

Files added/changed, all typechecked and linted clean:
- `components/marketing/canvas-mark.tsx` — `CanvasMark` plus `CanvasMarkCompact`, the
  dotless ring for ≤20px where the counters stop resolving. Deliberately **not**
  `currentColor` by default (unlike `GithubMark`): Canvas red is part of the mark, and a
  third-party logo recoloured to our palette is no longer that brand's logo. `mono` opts out.
- `components/marketing/icon-type.ts` — new `GlyphIcon` type.
- `icon-tile.tsx`, `nav-menus.tsx` — widened to `GlyphIcon`.

**The blast radius was smaller than planned.** Only those two files needed widening;
`catalog.ts` correctly stays `LucideIcon`, because Canvas is a product, not an endpoint, and
never enters the catalog. `pnpm exec tsc --noEmit` passes across the whole dashboard.

Step 18's nav row is therefore **also already in place** — see Phase 4.

### Phase 3 — rebuild the presentation — **DONE 2026-09-05, both build gates PASS**

All four routes and their components exist; `tsc --noEmit`, `eslint`, the self-host
`output: export` build and the `HELIX_HOSTED=1` build all pass. See "Build gate" for why
the build can only be run off this drive.

12. `lib/canvas.ts` — the catalog, mirroring `lib/catalog.ts`'s shape: the 14 tool modules
    with counts and taglines, install commands per client (Claude Code / Desktop / Cursor /
    Windsurf / Codex / HTTP+Docker), and the OS matrix.
13. `/canvas` from Helix primitives: `HeroField` with the **new Canvas motif** added in
    `hero-field.tsx` and passed directly (not via `HERO_MOTIF`, which is keyed by
    `Endpoint` and Canvas is not one), `CodePanel` /
    `AnimatedCode` for the terminal demo, `BentoCard` for the safety story (confirm gate,
    local-only, anonymisation), `PillButton` CTAs, `SectionEyebrow` — observing the
    **no-mini-text-above-headings** rule, so eyebrows go below or beside, never above.
14. `/canvas/tools` — the explorer. Port the *behaviour* from `tools-explorer.tsx` (search,
    group filter, URL-synced state, `#tool_name` deep links) onto Helix tokens. 3015 lines
    of `tools.json` is too large to inline: it ships as a static asset under
    `public/canvas/` and is fetched client-side, or is trimmed to what the list needs.
15. `/canvas/skills` — eight cards from `skills.ts`.
16. `/canvas/changelog` — the server's CHANGELOG.md via `react-markdown` + `remark-gfm`,
    both already dependencies.
17. Copy pass against the naming decision: **"Canvas Connect"** in the page title, `h1`,
    OG image and prose; **"Canvas"** as the nav label and in the sidebar/footer rows. The
    pip package is `canvaslms-api` wherever a command is shown.

**What was actually built.**

| File | What it is |
|---|---|
| `lib/canvas.ts` | Catalog: counts, 14 modules, install steps per OS, 4 client configs, 7 env vars |
| `lib/canvas-skills.ts` | The 8 skills, carried across from the server repo unchanged |
| `app/(marketing)/canvas/page.tsx` | Hero, worked example, confirm gate, safety bento, module grid, install, skills CTA |
| `app/(marketing)/canvas/tools/page.tsx` | Wrapper around the explorer |
| `app/(marketing)/canvas/skills/page.tsx` | 8 cards, split student/educator, tools deep-linked to `/canvas/tools#name` |
| `app/(marketing)/canvas/changelog/page.tsx` | `react-markdown` over the mirrored CHANGELOG |
| `components/marketing/canvas/install.tsx` | OS × client selectors on `Segmented`, plus the env table |
| `components/marketing/canvas/tools-explorer.tsx` | Search, group and access filters, URL-synced, `#tool_name` deep links |
| `components/marketing/canvas/tools-loader.tsx` | Runtime fetch + Suspense boundary + skeleton |
| `public/canvas/tools.json` | 89KB, 100 tools, copied from the server's `list_tools()` dump |
| `public/canvas/CHANGELOG.md` | Mirror of the server changelog |

Two corrections the code forced, both worth keeping:

- **The safety claim is "every tool that changes Canvas", not "every mutating tool".**
  tools.json has 40 non-read-only tools but only 39 confirm-gated; the odd one is
  `clear_cache`, which clears a local in-memory cache and makes no Canvas request. The
  looser phrasing would have been false. `TOOL_CONFIRMED` carries a comment saying so.
- **`tools.json` is fetched, not imported.** At 89KB an import would have put the whole
  catalog in the client bundle. It is a static asset fetched by `tools-loader.tsx`, which
  also supplies the `Suspense` boundary `useSearchParams` needs under `output: export`.

The new hero motif is **`segments`** in `ascii-fields.tsx` / `hero-field.tsx`: eight arc
bands with gaps on 45° centres and eight inner dots, echoing the Canvas mark's own
geometry. It is distinct from `orbit`, which is continuous concentric rings. `HeroMotif`
gained a member without breaking `HERO_MOTIF`'s `Record<Endpoint, HeroMotif>`, since that
constrains keys rather than values — Canvas passes the motif directly, as decided.

**Static-export constraint.** Self-host builds run `output: 'export'` with
`pageExtensions: ['tsx']` — no route handlers. Every Canvas route must be statically
renderable, and any `tools.json` fetch must work from a static host. No `force-dynamic`,
no `route.ts`.

#### Build gate — PASSES, but never on E:

**`next build` cannot run on `E:` at all, for any project — `E:` is exFAT.** exFAT's
`readlink` returns `EISDIR` on a *regular* file where NTFS returns `EINVAL`; webpack treats
`EINVAL` as "not a symlink" and continues, but `EISDIR` is fatal. So every build on this
drive dies with `EISDIR ... readlink <somefile>`, and the file it names changes between
runs because it is whichever file webpack happened to stat first. Verified directly:

```
E:/Helix/apps/dashboard/app/icon.svg   EISDIR      (exFAT)
C:/Windows/System32/drivers/etc/hosts  EINVAL      (NTFS)
```

This is a known, recorded property of the environment (helix-d4, proven 2026-08-28), not a
defect in this branch. Two ways to run the gate: copy the repo to `C:` and build on NTFS,
or push a Vercel preview and let Vercel build. **The `C:` copy is the one that exercises
`output: export`**, so it is the one that matters here.

**Result of the C:\ run** (repo copied excluding `node_modules`, `.next*`, `out`, `.git`,
`graphify-out`, `.pgdata`, `.venv`; `corepack pnpm install --prefer-offline`):

| Build | Result |
|---|---|
| `next build` (self-host, `output: export`) | **pass**, 78/78 static pages |
| `HELIX_HOSTED=1 next build` | **pass**, 78/78 |

All four Canvas routes prerender as static (`○`), and the prerendered HTML was checked for
real content rather than an empty shell:

| Route | First load JS | Verified |
|---|---|---|
| `/canvas` | 6.64 kB | 134KB HTML; mark's arc paths present, `segments` motif mounts, trademark line renders |
| `/canvas/tools` | 3.58 kB | 61KB; the 89KB catalog correctly stayed **out** of the bundle |
| `/canvas/skills` | 165 B | 115KB; all 8 skill slugs render |
| `/canvas/changelog` | 165 B | 66KB; all 3 releases render |

`public/canvas/tools.json` ships as a static asset (88,777 bytes), which is what makes the
`/canvas/tools` bundle 3.58 kB rather than ~90 kB.

### Phase 4 — wire it into the Tools system (~30 min)

18. **DONE.** `TOOL_ROWS` in `nav-menus.tsx` gained the Canvas row (between Converter and
    Playground), with `CanvasMarkCompact` as its icon and chips for Tools / Skills /
    Install. It sits above the existing `.filter((row) => row.href)`, which an internal
    href always passes. **The row is live but its four routes do not exist yet** — the nav
    entry 404s until Phase 3 lands. Written as:

    ```
    { label: 'Canvas', href: '/canvas', icon: CanvasMark,
      tagline: 'Your Canvas LMS as ~100 MCP tools. Local, your own token, confirm before every write.',
      chips: [ {Tools, /canvas/tools}, {Skills, /canvas/skills}, {Install, /canvas#install} ] }
    ```

    **Internal, not external** — unlike Persona and Converter, which are separate deploys.
    No `CANVAS_URL` in `lib/mode.ts`; that is the point of choosing routes over a sibling
    app. `MenuRowItem` already infers `external` from an `http` href, so an internal href
    needs no flag.
19. **DONE.** Footer's Tools column gained a `Canvas → /canvas` entry (it is a hardcoded
    list, as suspected).
20. **DONE.** `/canvas` has a markdown twin. `lib/markdown-twins.ts` gains
    `canvasMarkdown()` and `'canvas'` in `MARKDOWN_TWIN_PATHS`. It could not reuse
    `capabilityPageMarkdown`, which is keyed by `Endpoint` — Canvas is a product but not an
    endpoint, the same distinction that kept it out of `catalog.ts`. The twin is generated
    from `lib/canvas.ts`, so its counts cannot drift from the page's.

    **This fixed `/search-index.json` at the same time**: that route derives from
    `MARKDOWN_TWIN_PATHS` rather than keeping its own list, so the command palette now finds
    Canvas without a second change. Verified in the built output: `/md/canvas` renders with
    the real counts, and the index contains `"path":"canvas"`. Static page count went 78 → 79
    in both builds.

    The three sub-routes (`/canvas/tools`, `/canvas/skills`, `/canvas/changelog`) have no
    twins by design — `/tools` is a filterable UI over a JSON catalog and `/changelog` is
    already markdown at source, so a twin would be a worse copy of each.
21. **Moot — the dashboard has no sitemap.** There is no `app/sitemap.ts` and no
    `robots.ts`; the only "sitemap" hits in the tree are prose on `/crawl` and `/map`
    describing the *feature*. So there is nothing for Canvas to be added to. Adding a
    sitemap is a site-wide decision that belongs to whoever owns SEO for the marketing
    site, not to this merge — discovery for Canvas is already covered by `/llms.txt`, the
    markdown twin and the search index. Per-page `metadata` is set in each `page.tsx`.

### Phase 5 — decommission and verify — **archived 2026-09-05; deletion NOT done, and should not be**

**The archive is taken and verified. The GitHub deletion is deliberately left undone**
because taking it surfaced work that only exists there — see step 23.

Findings that changed this phase:

- **PyPI was never published.** `https://pypi.org/pypi/canvaslms-api/json` returns 404, so
  the "PyPI page links at a dead repo" risk does not exist. `pyproject.toml`'s
  `[project.urls]` still pointed at the old repo and now points at Helix.
- **GitHub carried nothing but code**: 0 issues, 0 PRs, 0 releases, 0 stars. So the archive
  loses no discussion history.
- **The local clone was NOT a superset of the remote.** The remote's `pushedAt` was newer
  than the local checkout, and carried a branch the local clone had never seen.
- **The tags were the other way round.** `v1.0.1`, `v1.0.2` and `pre-helix-merge` existed
  only locally; GitHub had `v1.0.0` alone. The archive was built from the remote and then
  had the local tags fetched into it, so it is a superset of both.

**Archive at `e:/archive/`**: `CanvasLMS-API.git` (full `--mirror`, all branches and tags),
`canvas-repo-metadata.json`, `canvas-releases.json`, `canvas-issues.json`, and
`CanvasLMS-API-README.md` explaining what is there. Verified by cloning back out of the
mirror and confirming HEAD, all four tags and the extra branch.

22. Vercel project `canvas-api` (`prj_AHDXLdtPX2zBfvBX9SvVTJWPqR1h`, live at
    canvaslms-api.vercel.app): keep it serving **301s to `helixapi-dev.vercel.app/canvas`**
    rather than deleting it — the PyPI page, the GitHub README and existing MCP client
    configs point there. Deleting it 404s them.
23. **Retire the GitHub repo.** `tools/canvas-mcp` becomes the only development tree and the
    PyPI publish source; `harryx2011-boop/CanvasLMS-API` is **deleted from GitHub after a
    full local mirror is taken**. Order matters and none of it is reversible, so:

    1. `git clone --mirror` the repo to `e:/archive/CanvasLMS-API.git`, plus
       `gh issue list --state all --json ...` and the same for PRs and releases — a mirror
       clone carries commits, branches and tags but **not** issues, PRs, releases or stars.
    2. Verify the mirror: clone *from* it into a temp dir and confirm `main` matches
       `pre-helix-merge`, and that the subtree in Helix contains the same tree hash.
    3. Repoint the PyPI project URLs (`Homepage`, `Source`) in `pyproject.toml` at the Helix
       repo and publish that metadata **before** deletion — the live PyPI page links at the
       old repo, and deleting it first leaves a 404 on the package page.
    4. Only then delete on GitHub.

    **Deletion is permanent and takes issue history and stars with it.** Confirm at the
    time; do not run it as part of an unattended phase.

    **STATUS: steps 1–3 done, step 4 NOT done and blocked on a decision.**

    Mirroring found an **unmerged branch that is not in Helix**:

    ```
    claude/mcp-browser-connection-0ew1qj   875e210
    "http: add shared-secret auth so claude.ai can connect"
    ```

    It is not an ancestor of `main`, so the subtree merge did not bring it: 506 insertions
    across 14 files, including a new `src/canvaslms_api/http_auth.py` (92 lines) and 203
    lines of tests (`test_http_auth.py`, `test_cli.py`, `test_config.py`). It adds
    shared-secret auth to the HTTP transport so claude.ai can reach the server —
    a real feature, and one Helix's copy does not have.

    It survives only because the mirror was re-taken from the **GitHub remote** after
    noticing `pushedAt` was newer than the local clone. A mirror of the local working copy
    alone — which is what the plan originally said — would have missed it, and deleting the
    repo would have destroyed it permanently.

    **Before anyone deletes the repo, decide what happens to that branch.** Either
    cherry-pick it into `tools/canvas-mcp/` (it is self-contained: a new module, CLI/config
    extensions, three test files) or consciously abandon it. It is preserved in the archive
    either way, but an archive nobody reads is not the same as the feature existing.
24. Verify: `pnpm typecheck`, `pnpm lint`, `pnpm build` for both `HELIX_HOSTED=1` and
    self-host; `pytest` + `ruff` in `tools/canvas-mcp`; the four routes render in both
    themes; the Canvas mark reads correctly at 14px and at 40px.
25. Pre-commit UI gates, in order: `interface-review` → `review-animations` → tastemaker
    anti-slop scan → `rules/ui-anti-vibe.md` checklist.

---

## Version and release

- Helix root: **MINOR**. A new product surface and four new routes, backwards compatible.
  Root and `apps/dashboard` are both at **1.15.0** as of `faa3435` — the drift noted
  earlier is gone. **Do not assume `1.16.0` is free:** helix-37 has told helix-d4 it will
  ship a MINOR taking root to 1.16.0, touching the same version-mirror set and the
  `context.md` header. Confirm the next free number with helix-37 immediately before
  bumping, and expect this merge to land at **1.17.0** if helix-37 goes first.
- `tools/canvas-mcp` keeps its own line, now at **1.0.2** (`a8ecb12`); separately published.
- Update in the same commit: root `context.md`, root `README.md`, `WEBSITE.md` (the Tools
  system now has four entries), and this file's status header.

## Decisions (settled 2026-09-05)

1. **Public name.** Nav label **"Canvas"** — one word, level with Converter, Persona,
   Playground and Status. Page title, `h1` and OG title are **"Canvas Connect"**. The pip
   package stays `canvaslms-api`; no rename. Every string in Phase 3 follows this split.
2. **PyPI and the old repo.** Helix's `tools/canvas-mcp` is the sole development tree and
   publish source. The GitHub repo is mirrored locally and then **deleted** — see Phase 5
   step 23 for the ordering, which is load-bearing.
3. **Hero motif.** Add a **Canvas-specific motif** to `hero-field.tsx`. Canvas is a product,
   not a twelfth endpoint, so it does not enter `HERO_MOTIF` (which is keyed by `Endpoint`)
   — `/canvas` passes the motif to `HeroField` directly. Keeps the "neighbours never share
   a motif" invariant true rather than quietly false.
4. **Both builds.** Canvas routes ship in self-host and hosted alike. No gating, no new env
   var, one code path. This makes the Phase 3 static-export constraint binding rather than
   advisory: every Canvas route must render under `output: 'export'`.

## Risk register

| Risk | Mitigation |
|---|---|
| Subtree merge drags Next 16 / Tailwind v4 deps into the lockfile | `web/` is deleted in the same commit as the subtree add; its `package.json` never reaches pnpm |
| `MenuRow.icon` widening breaks `catalog.ts` consumers | Typecheck the whole dashboard, not just nav |
| `tools.json` (3015 lines) bloats the bundle | Static asset + client fetch; never a server import into a client component |
| Python tests silently stop running in CI | Explicit root `test:canvas` script + `context.md` note |
| Wrong Canvas mark from a favicon service walking up to `instructure.com` | Byte-hash comparison; fetch `canvas.instructure.com` specifically |
| **Several sessions work in both repos concurrently** — Phase 0's premise went stale within the hour | Re-read git state immediately before acting, never from a reading taken earlier in the session; announce shared-file intent via SendMessage first |
| Two sessions claim the same version number | helix-37 has 1.16.0 provisionally; confirm the next free number with it before bumping |
| Deleting the Canvas repo destroys work another session pushed there but has not mirrored | Re-check `git log` and `gh` state at deletion time, not at planning time |
| **GitHub deletion is irreversible** and drops issues, PRs, releases and stars, which a mirror clone does not carry | Export issues/PRs/releases as JSON alongside the `--mirror` clone; verify the mirror by cloning back from it before deleting |
| PyPI page links at a repo that no longer exists | Repoint `pyproject.toml` project URLs and publish that metadata *before* deletion, not after |
| A Canvas route uses a server-only feature and breaks the self-host export | Both builds ship Canvas, so `pnpm build` without `HELIX_HOSTED` is a required gate, not an optional one |

## Estimate

**8–10 hours.** Phase 3 is roughly 60% of it. Phases 0–2 are mechanical and can run in
parallel with Phase 3's catalog work; Phase 4 depends on both.
